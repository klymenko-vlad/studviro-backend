import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import type { Course, DegreeLevel, Program, StudyForm } from '../../database/schema';

import {
  CoursesCatalogueRepository,
  ProgramsCatalogueRepository,
} from './catalogue.repository';

export interface ProgramInput {
  readonly code: string;
  readonly name: string;
  readonly degreeLevel?: DegreeLevel;
  readonly studyForm?: StudyForm;
  readonly standardLengthSemesters?: number | null;
  readonly orgUnitId?: string | null;
}

export interface CourseInput {
  readonly code: string;
  readonly title: string;
  readonly description?: string | null;
  readonly credits?: number | null;
  readonly orgUnitId?: string | null;
}

@Injectable()
export class CatalogueService {
  constructor(
    private readonly programs: ProgramsCatalogueRepository,
    private readonly courses: CoursesCatalogueRepository,
  ) {}

  listPrograms(institutionId: string): Promise<Program[]> {
    return this.programs.listFor(institutionId);
  }

  async createProgram(institutionId: string, input: ProgramInput): Promise<Program> {
    await this.programs.assertCodeFree(institutionId, input.code);

    return this.programs.create({
      institutionId,
      code: input.code,
      name: input.name,
      ...(input.degreeLevel === undefined ? {} : { degreeLevel: input.degreeLevel }),
      ...(input.studyForm === undefined ? {} : { studyForm: input.studyForm }),
      standardLengthSemesters: input.standardLengthSemesters ?? null,
      orgUnitId: input.orgUnitId ?? null,
    });
  }

  async updateProgram(
    institutionId: string,
    id: string,
    input: Partial<ProgramInput>,
  ): Promise<Program> {
    const existing = await this.programs.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('program', id);

    if (input.code !== undefined) {
      await this.programs.assertCodeFree(institutionId, input.code, id);
    }

    return this.programs.update(id, { ...definedOnly(input) });
  }

  async removeProgram(institutionId: string, id: string): Promise<void> {
    const existing = await this.programs.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('program', id);

    await this.programs.softDelete(id);
  }

  listCourses(institutionId: string): Promise<Course[]> {
    return this.courses.listFor(institutionId);
  }

  async createCourse(institutionId: string, input: CourseInput): Promise<Course> {
    await this.courses.assertCodeFree(institutionId, input.code);

    return this.courses.create({
      institutionId,
      code: input.code,
      title: input.title,
      description: input.description ?? null,
      credits:
        input.credits === undefined || input.credits === null ? null : String(input.credits),
      orgUnitId: input.orgUnitId ?? null,
    });
  }

  async updateCourse(
    institutionId: string,
    id: string,
    input: Partial<CourseInput>,
  ): Promise<Course> {
    const existing = await this.courses.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('course', id);

    if (input.code !== undefined) {
      await this.courses.assertCodeFree(institutionId, input.code, id);
    }

    const { credits, ...rest } = input;

    return this.courses.update(id, {
      ...definedOnly(rest),
      ...(credits === undefined ? {} : { credits: credits === null ? null : String(credits) }),
    });
  }

  async removeCourse(institutionId: string, id: string): Promise<void> {
    const existing = await this.courses.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('course', id);

    await this.courses.softDelete(id);
  }
}

function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

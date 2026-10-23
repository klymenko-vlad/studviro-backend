import { Injectable } from '@nestjs/common';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import type { LearningMaterial, LearningSection } from '../../database/schema';

import { AssignmentsService, type AssignmentEntry } from './assignments.service';
import {
  CourseStudentsRepository,
  type CourseStudent,
  type StudentPageQuery,
} from './course-students.repository';
import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import type { Gated } from './learning-availability.service';
import { LearningMaterialsService } from './learning-materials.service';
import { LearningSectionsService } from './learning-sections.service';
import { MyProgressService, type Progress } from './my-progress.service';

export const NOBODY = '00000000-0000-0000-0000-000000000000';

export interface StudentView {
  readonly student: CourseStudent | null;
  readonly sections: Gated<LearningSection>[];
  readonly materials: Gated<LearningMaterial>[];
  readonly assignments: Gated<AssignmentEntry>[];
  readonly progress: Progress;
}

export interface StudentPage {
  readonly students: CourseStudent[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class StudentViewService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly students: CourseStudentsRepository,
    private readonly sections: LearningSectionsService,
    private readonly materials: LearningMaterialsService,
    private readonly assignments: AssignmentsService,
    private readonly progress: MyProgressService,
  ) {}

  async outline(
    institutionId: string,
    spaceId: string,
    userId: string,
    asStudent: string | undefined,
    now = new Date(),
  ): Promise<StudentView> {
    const author = await this.authorContext(institutionId, spaceId, userId);
    const student = asStudent === undefined ? null : await this.enrolled(author, asStudent);
    const context: LearningSpaceContext = {
      ...author,
      stance: 'participant',
      userId: student?.userId ?? NOBODY,
    };

    const [sections, materials, assignments, progress] = await Promise.all([
      this.sections.listFor(context, now),
      this.materials.listFor(context),
      this.assignments.listFor(context),
      this.progress.forContext(context, now),
    ]);

    return { student, sections, materials, assignments, progress };
  }

  async studentPage(
    institutionId: string,
    spaceId: string,
    userId: string,
    query: StudentPageQuery,
  ): Promise<StudentPage> {
    const { offeringId } = await this.authorContext(institutionId, spaceId, userId);
    const { students, total } =
      offeringId === null
        ? { students: [], total: 0 }
        : await this.students.page(offeringId, query);

    return { students, total, page: query.page, limit: query.limit };
  }

  private async authorContext(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<LearningSpaceContext> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    return context;
  }

  private async enrolled(
    context: LearningSpaceContext,
    userId: string,
  ): Promise<CourseStudent> {
    const student =
      context.offeringId === null ? null : await this.students.find(context.offeringId, userId);
    if (!student) throw new EntityNotFoundError('enrolled_student', userId);

    return student;
  }
}

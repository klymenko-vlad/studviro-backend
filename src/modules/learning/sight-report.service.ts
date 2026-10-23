import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import { learningActivities, learningMaterials, learningSections } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { Access } from './access-explanation';
import {
  CourseStudentsRepository,
  type CourseStudent,
  type StudentPageQuery,
} from './course-students.repository';
import { LearningAccessService } from './learning-access.service';
import { AvailabilityService, type ExplainSubject } from './learning-availability.service';
import { RestrictionFactsRepository } from './restriction-facts.repository';

export const SIGHT_SUBJECT_KINDS = ['section', 'material', 'assignment'] as const;
export type SightSubjectKind = (typeof SIGHT_SUBJECT_KINDS)[number];

export interface StudentSight extends CourseStudent {
  readonly access: Access;
}

export interface SightReport {
  readonly kind: SightSubjectKind;
  readonly id: string;
  readonly title: string;
  readonly students: number;
  readonly canOpen: number;
  readonly seeTitle: number;
  readonly seeNothing: number;
  readonly rows: StudentSight[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class SightReportService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly availability: AvailabilityService,
    private readonly facts: RestrictionFactsRepository,
    private readonly students: CourseStudentsRepository,
  ) {}

  async forItem(
    institutionId: string,
    spaceId: string,
    userId: string,
    target: { kind: SightSubjectKind; id: string },
    query: StudentPageQuery,
    now = new Date(),
  ): Promise<SightReport> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const { title, subject } = await this.subjectOf(spaceId, target);
    const { offeringId } = context;
    const [everyone, { students, total }] =
      offeringId === null
        ? [[], { students: [], total: 0 }]
        : await Promise.all([
            this.facts.enrolledStudents(offeringId),
            this.students.page(offeringId, query),
          ]);

    const accesses = await this.availability.explain(
      { spaceId, offeringId },
      subject,
      [...new Set([...everyone, ...students.map((student) => student.userId)])],
      now,
    );
    const sights = everyone.map((id) => accesses.get(id)?.sight);

    return {
      ...target,
      title,
      students: everyone.length,
      canOpen: sights.filter((sight) => sight === 'full').length,
      seeTitle: sights.filter((sight) => sight === 'title').length,
      seeNothing: sights.filter((sight) => sight === 'none').length,
      rows: students.flatMap((student) => {
        const access = accesses.get(student.userId);

        return access ? [{ ...student, access }] : [];
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private async subjectOf(
    spaceId: string,
    target: { kind: SightSubjectKind; id: string },
  ): Promise<{ title: string; subject: ExplainSubject }> {
    if (target.kind === 'section') {
      const [section] = await this.reader
        .select()
        .from(learningSections)
        .where(
          and(
            eq(learningSections.id, target.id),
            eq(learningSections.learningSpaceId, spaceId),
            isNull(learningSections.deletedAt),
          ),
        );
      if (!section) throw new EntityNotFoundError('learning_section', target.id);

      return { title: section.title, subject: { kind: 'section', section } };
    }

    if (target.kind === 'material') {
      const [material] = await this.reader
        .select()
        .from(learningMaterials)
        .where(
          and(
            eq(learningMaterials.id, target.id),
            eq(learningMaterials.learningSpaceId, spaceId),
            isNull(learningMaterials.deletedAt),
          ),
        );
      if (!material) throw new EntityNotFoundError('learning_material', target.id);

      return { title: material.title, subject: { kind: 'item', item: material } };
    }

    const [activity] = await this.reader
      .select()
      .from(learningActivities)
      .where(
        and(
          eq(learningActivities.id, target.id),
          eq(learningActivities.learningSpaceId, spaceId),
          eq(learningActivities.type, 'assignment'),
          isNull(learningActivities.deletedAt),
        ),
      );
    if (!activity) throw new EntityNotFoundError('assignment', target.id);

    return { title: activity.name, subject: { kind: 'item', item: activity } };
  }

  private get reader() {
    return this.txHost.reader();
  }
}

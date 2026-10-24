import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  academicTerms,
  assessments,
  courseOfferings,
  learningActivities,
  learningMaterialFiles,
  learningMaterials,
  learningSections,
  questionCategories,
  questions,
  questionVersions,
  quizSlots,
  quizzes,
  studyGroups,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { ACTIVITY_KINDS } from './activity-kind';
import type { GroupIdentity } from './course-import-names';
import type { ImportSnapshot } from './course-import.types';

export interface OfferingTerm {
  readonly courseId: string;
  readonly termCode: string;
  readonly termName: string;
  readonly startsAt: Date;
}

@Injectable()
export class CourseImportSnapshotRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async snapshotOf(spaceId: string): Promise<ImportSnapshot> {
    const [sections, materials, folderFiles, activities, categories, bank] = await Promise.all([
      this.reader
        .select()
        .from(learningSections)
        .where(
          and(
            eq(learningSections.learningSpaceId, spaceId),
            isNull(learningSections.deletedAt),
          ),
        ),
      this.reader
        .select()
        .from(learningMaterials)
        .where(
          and(
            eq(learningMaterials.learningSpaceId, spaceId),
            isNull(learningMaterials.deletedAt),
          ),
        ),
      this.reader
        .select({ file: learningMaterialFiles })
        .from(learningMaterialFiles)
        .innerJoin(
          learningMaterials,
          eq(learningMaterials.id, learningMaterialFiles.learningMaterialId),
        )
        .where(
          and(
            eq(learningMaterials.learningSpaceId, spaceId),
            isNull(learningMaterials.deletedAt),
            isNull(learningMaterialFiles.deletedAt),
          ),
        )
        .orderBy(asc(learningMaterialFiles.filename), asc(learningMaterialFiles.createdAt)),
      this.reader
        .select({ activity: learningActivities, assessment: assessments })
        .from(learningActivities)
        .innerJoin(
          assessments,
          and(
            eq(assessments.learningActivityId, learningActivities.id),
            isNull(assessments.deletedAt),
          ),
        )
        .where(
          and(
            eq(learningActivities.learningSpaceId, spaceId),
            inArray(learningActivities.type, [...ACTIVITY_KINDS]),
            isNull(learningActivities.deletedAt),
          ),
        ),
      this.reader
        .select()
        .from(questionCategories)
        .where(
          and(
            eq(questionCategories.learningSpaceId, spaceId),
            isNull(questionCategories.deletedAt),
          ),
        )
        .orderBy(asc(questionCategories.createdAt)),
      this.reader
        .select({ question: questions, version: questionVersions })
        .from(questions)
        .innerJoin(
          questionVersions,
          and(
            eq(questionVersions.questionId, questions.id),
            eq(questionVersions.version, questions.latestVersion),
          ),
        )
        .where(and(eq(questions.learningSpaceId, spaceId), isNull(questions.deletedAt)))
        .orderBy(asc(questions.createdAt)),
    ]);

    const quizIds = activities
      .filter(({ activity }) => activity.type === 'quiz')
      .map(({ activity }) => activity.id);
    const [settings, slots] =
      quizIds.length === 0
        ? [[], []]
        : await Promise.all([
            this.reader
              .select()
              .from(quizzes)
              .where(inArray(quizzes.learningActivityId, quizIds)),
            this.reader
              .select()
              .from(quizSlots)
              .where(inArray(quizSlots.learningActivityId, quizIds))
              .orderBy(asc(quizSlots.learningActivityId), asc(quizSlots.position)),
          ]);

    return {
      sections,
      materials,
      folderFiles: folderFiles.map((row) => row.file),
      activities,
      quizzes: settings,
      slots,
      categories,
      questions: bank,
    };
  }

  async termOf(offeringId: string | null): Promise<OfferingTerm | null> {
    if (offeringId === null) return null;

    const [row] = await this.reader
      .select({
        courseId: courseOfferings.courseId,
        termCode: academicTerms.code,
        termName: academicTerms.name,
        startsAt: academicTerms.startsAt,
      })
      .from(courseOfferings)
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(eq(courseOfferings.id, offeringId))
      .limit(1);

    return row ?? null;
  }

  async groupsOf(offeringId: string | null): Promise<GroupIdentity[]> {
    if (offeringId === null) return [];

    return this.reader
      .select({ id: studyGroups.id, code: studyGroups.code, name: studyGroups.name })
      .from(studyGroups)
      .where(and(eq(studyGroups.courseOfferingId, offeringId), isNull(studyGroups.deletedAt)));
  }

  async groupsByIds(ids: readonly string[]): Promise<GroupIdentity[]> {
    if (ids.length === 0) return [];

    return this.reader
      .select({ id: studyGroups.id, code: studyGroups.code, name: studyGroups.name })
      .from(studyGroups)
      .where(inArray(studyGroups.id, [...ids]));
  }

  async categoryNamesOf(spaceId: string): Promise<string[]> {
    const rows = await this.reader
      .select({ name: questionCategories.name })
      .from(questionCategories)
      .where(
        and(
          eq(questionCategories.learningSpaceId, spaceId),
          isNull(questionCategories.deletedAt),
        ),
      );

    return rows.map((row) => row.name);
  }

  private get reader() {
    return this.txHost.reader();
  }
}

import { Injectable } from '@nestjs/common';
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  min,
  ne,
  or,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import {
  activityCompletions,
  assessmentResults,
  assessments,
  learningActivities,
  learningMaterials,
  quizAttempts,
  submissions,
  type ActivityCompletionState,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { activityKindOf } from './activity-kind';
import {
  COMPLETE_STATES,
  type CompletionFacts,
  type CompletionItem,
  type CompletionSetting,
} from './completion-rule';

export interface CompletionSubject extends CompletionSetting {
  readonly institutionId: string;
  readonly spaceId: string;
}

export interface UserFacts extends CompletionFacts {
  readonly userId: string;
  readonly recorded: ActivityCompletionState | null;
}

export interface CompletionWrite {
  readonly userId: string;
  readonly state: ActivityCompletionState;
  readonly completedAt: Date | null;
}

export interface RecordedCompletion {
  readonly userId: string;
  readonly item: CompletionItem;
  readonly state: ActivityCompletionState;
  readonly completedAt: Date | null;
}

type Fact = 'viewedAt' | 'markedDoneAt';

@Injectable()
export class CompletionRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async subject(item: CompletionItem): Promise<CompletionSubject | null> {
    const table = item.kind === 'material' ? learningMaterials : learningActivities;
    const [row] = await this.client
      .select({
        institutionId: table.institutionId,
        spaceId: table.learningSpaceId,
        rule: table.completionRule,
        passPoints:
          item.kind === 'material'
            ? sql<string | null>`null`
            : learningActivities.completionPassPoints,
      })
      .from(table)
      .where(and(eq(table.id, item.id), isNull(table.deletedAt)))
      .limit(1);

    if (!row) return null;

    return { ...row, passPoints: row.passPoints === null ? null : Number(row.passPoints) };
  }

  async facts(item: CompletionItem, userIds?: readonly string[]): Promise<UserFacts[]> {
    const byUser = new Map<string, UserFacts>();
    const merge = (userId: string, facts: Partial<UserFacts>) => {
      byUser.set(userId, { ...(byUser.get(userId) ?? blankFacts(userId)), ...facts });
    };

    for (const row of await this.recordedRows(item, userIds)) merge(row.userId, row);
    if (item.kind === 'material') return [...byUser.values()];

    const [handedIn, marks] = await Promise.all([
      item.kind === 'quiz'
        ? this.finishedAttempts(item, userIds)
        : this.handedIn(item, userIds),
      this.client
        .select({
          userId: assessmentResults.userId,
          markedAt: assessmentResults.gradedAt,
          points: assessmentResults.points,
        })
        .from(assessmentResults)
        .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
        .where(
          and(
            eq(assessments.learningActivityId, item.id),
            isNull(assessments.deletedAt),
            isNull(assessmentResults.deletedAt),
            isNotNull(assessmentResults.gradedAt),
            forUsers(assessmentResults.userId, userIds),
          ),
        ),
    ]);

    for (const row of handedIn) merge(row.userId, { submittedAt: row.submittedAt });
    for (const row of marks) {
      merge(row.userId, {
        markedAt: row.markedAt,
        points: row.points === null ? null : Number(row.points),
      });
    }

    return [...byUser.values()];
  }

  async writeStates(
    item: CompletionItem,
    institutionId: string,
    writes: readonly CompletionWrite[],
  ): Promise<void> {
    if (writes.length === 0) return;

    await this.client
      .insert(activityCompletions)
      .values(writes.map((write) => ({ institutionId, ...itemColumns(item), ...write })))
      .onConflictDoUpdate({
        target: [itemColumn(item), activityCompletions.userId],
        targetWhere: isNull(activityCompletions.deletedAt),
        set: {
          state: sql`excluded.state`,
          completedAt: sql`excluded.completed_at`,
          updatedAt: new Date(),
        },
      });
  }

  async recordFact(
    item: CompletionItem,
    institutionId: string,
    userId: string,
    fact: Fact,
    at: Date | null,
  ): Promise<void> {
    const column = activityCompletions[fact];

    await this.client
      .insert(activityCompletions)
      .values({ institutionId, userId, ...itemColumns(item), [fact]: at })
      .onConflictDoUpdate({
        target: [itemColumn(item), activityCompletions.userId],
        targetWhere: isNull(activityCompletions.deletedAt),
        set: {
          [fact]: fact === 'viewedAt' ? sql`coalesce(${column}, excluded.viewed_at)` : at,
          updatedAt: new Date(),
        },
      });
  }

  async recorded(
    userIds: readonly string[],
    items: readonly CompletionItem[],
  ): Promise<RecordedCompletion[]> {
    if (userIds.length === 0 || items.length === 0) return [];

    const activityIds = items.filter((item) => item.kind !== 'material').map(({ id }) => id);
    const materialIds = items.filter((item) => item.kind === 'material').map(({ id }) => id);
    const kindOf = new Map(items.map((item) => [item.id, item.kind]));

    const rows = await this.txHost
      .reader()
      .select({
        userId: activityCompletions.userId,
        materialId: activityCompletions.learningMaterialId,
        itemId: sql<string>`coalesce(${activityCompletions.learningMaterialId}, ${activityCompletions.learningActivityId})`,
        state: activityCompletions.state,
        completedAt: activityCompletions.completedAt,
      })
      .from(activityCompletions)
      .where(
        and(
          inArray(activityCompletions.userId, [...userIds]),
          or(
            activityIds.length === 0
              ? undefined
              : inArray(activityCompletions.learningActivityId, activityIds),
            materialIds.length === 0
              ? undefined
              : inArray(activityCompletions.learningMaterialId, materialIds),
          ),
          isNull(activityCompletions.deletedAt),
        ),
      );

    return rows.map((row) => ({
      userId: row.userId,
      item: { kind: kindOf.get(row.itemId) ?? 'material', id: row.itemId },
      state: row.state,
      completedAt: row.completedAt,
    }));
  }

  async completedInSpace(userId: string, spaceId: string): Promise<CompletionItem[]> {
    const rows = await this.txHost
      .reader()
      .select({
        materialId: learningMaterials.id,
        activityId: learningActivities.id,
        activityType: learningActivities.type,
      })
      .from(activityCompletions)
      .leftJoin(
        learningMaterials,
        and(
          eq(learningMaterials.id, activityCompletions.learningMaterialId),
          eq(learningMaterials.learningSpaceId, spaceId),
          isNull(learningMaterials.deletedAt),
        ),
      )
      .leftJoin(
        learningActivities,
        and(
          eq(learningActivities.id, activityCompletions.learningActivityId),
          eq(learningActivities.learningSpaceId, spaceId),
          isNull(learningActivities.deletedAt),
        ),
      )
      .where(
        and(
          eq(activityCompletions.userId, userId),
          inArray(activityCompletions.state, [...COMPLETE_STATES]),
          isNull(activityCompletions.deletedAt),
          or(isNotNull(learningMaterials.id), isNotNull(learningActivities.id)),
        ),
      );

    return rows.flatMap((row): CompletionItem[] => {
      if (row.materialId !== null) return [{ kind: 'material', id: row.materialId }];
      if (row.activityId !== null && row.activityType !== null) {
        return [{ kind: activityKindOf(row.activityType), id: row.activityId }];
      }

      return [];
    });
  }

  private handedIn(item: CompletionItem, userIds?: readonly string[]) {
    return this.client
      .select({ userId: submissions.userId, submittedAt: min(submissions.submittedAt) })
      .from(submissions)
      .where(
        and(
          eq(submissions.learningActivityId, item.id),
          ne(submissions.state, 'draft'),
          isNotNull(submissions.submittedAt),
          isNull(submissions.deletedAt),
          forUsers(submissions.userId, userIds),
        ),
      )
      .groupBy(submissions.userId);
  }

  private finishedAttempts(item: CompletionItem, userIds?: readonly string[]) {
    return this.client
      .select({ userId: quizAttempts.userId, submittedAt: min(quizAttempts.finishedAt) })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.learningActivityId, item.id),
          eq(quizAttempts.state, 'finished'),
          forUsers(quizAttempts.userId, userIds),
        ),
      )
      .groupBy(quizAttempts.userId);
  }

  private recordedRows(item: CompletionItem, userIds?: readonly string[]) {
    return this.client
      .select({
        userId: activityCompletions.userId,
        recorded: activityCompletions.state,
        viewedAt: activityCompletions.viewedAt,
        markedDoneAt: activityCompletions.markedDoneAt,
      })
      .from(activityCompletions)
      .where(
        and(
          eq(itemColumn(item), item.id),
          isNull(activityCompletions.deletedAt),
          forUsers(activityCompletions.userId, userIds),
        ),
      );
  }

  private get client() {
    return this.txHost.client();
  }
}

function blankFacts(userId: string): UserFacts {
  return {
    userId,
    recorded: null,
    viewedAt: null,
    markedDoneAt: null,
    submittedAt: null,
    markedAt: null,
    points: null,
  };
}

function itemColumn(item: CompletionItem) {
  return item.kind === 'material'
    ? activityCompletions.learningMaterialId
    : activityCompletions.learningActivityId;
}

function itemColumns(item: CompletionItem) {
  return item.kind === 'material'
    ? { learningMaterialId: item.id }
    : { learningActivityId: item.id };
}

function forUsers(column: Column, userIds: readonly string[] | undefined): SQL | undefined {
  return userIds === undefined ? undefined : inArray(column, [...userIds]);
}

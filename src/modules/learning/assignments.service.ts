import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, max } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  assessments,
  learningActivities,
  type Assessment,
  type LearningActivity,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { assertAttemptPolicy, assertWindow } from './assignment-policy';
import { LearningAccessService, type LearningStance } from './learning-access.service';

export interface NewAssignment {
  readonly name: string;
  readonly brief?: string | null;
  readonly opensAt?: Date | null;
  readonly dueAt?: Date | null;
  readonly closesAt?: Date | null;
  readonly maxAttempts?: number | null;
  readonly allowsLateSubmission?: boolean;
  readonly maxPoints?: number | null;
  readonly countsTowardFinalGrade?: boolean;
  readonly visible?: boolean;
}

export type AssignmentChanges = Partial<NewAssignment> & { readonly position?: number };

export interface AssignmentEntry {
  readonly activity: LearningActivity;
  readonly assessment: Assessment;
}

/**
 * A brief, a window and an attempt policy. It is a `learning_activity` of type
 * `assignment` — the table already carried the three dates for exactly this —
 * paired with the `assessment` row the marks will land in, created together so
 * that marking never has to invent a gradebook column.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
  ) {}

  async list(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<AssignmentEntry[]> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);

    const rows = await this.reader
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
          eq(learningActivities.type, 'assignment'),
          isNull(learningActivities.deletedAt),
        ),
      )
      .orderBy(asc(learningActivities.position), asc(learningActivities.createdAt));

    return visibleTo(context.stance, rows);
  }

  async findOne(
    institutionId: string,
    spaceId: string,
    assignmentId: string,
    userId: string,
  ): Promise<AssignmentEntry> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    const entry = await this.entryOrFail(spaceId, assignmentId);

    if (!entry.activity.visible && context.stance !== 'author') {
      throw new EntityNotFoundError('assignment', assignmentId);
    }

    return entry;
  }

  async create(
    institutionId: string,
    spaceId: string,
    userId: string,
    input: NewAssignment,
  ): Promise<AssignmentEntry> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);
    assertWindow(input);
    assertAttemptPolicy(input.maxAttempts ?? null);

    return this.txHost.run(async () => {
      const [activity] = await this.client
        .insert(learningActivities)
        .values({
          institutionId,
          learningSpaceId: spaceId,
          type: 'assignment',
          name: input.name,
          brief: input.brief ?? null,
          position: await this.nextPosition(spaceId),
          opensAt: input.opensAt ?? null,
          dueAt: input.dueAt ?? null,
          closesAt: input.closesAt ?? null,
          maxAttempts: input.maxAttempts ?? 1,
          allowsLateSubmission: input.allowsLateSubmission ?? false,
          visible: input.visible ?? true,
        })
        .returning();

      if (!activity) {
        throw new ConflictError('ASSIGNMENT_NOT_CREATED', 'The assignment was not created');
      }

      const [assessment] = await this.client
        .insert(assessments)
        .values({
          institutionId,
          learningSpaceId: spaceId,
          learningActivityId: activity.id,
          name: input.name,
          maxPoints: numeric(input.maxPoints),
          countsTowardFinalGrade: input.countsTowardFinalGrade ?? true,
        })
        .returning();

      if (!assessment) {
        throw new ConflictError('ASSIGNMENT_NOT_CREATED', 'The assignment was not created');
      }

      return { activity, assessment };
    });
  }

  async update(
    institutionId: string,
    spaceId: string,
    assignmentId: string,
    userId: string,
    changes: AssignmentChanges,
  ): Promise<AssignmentEntry> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const existing = await this.entryOrFail(spaceId, assignmentId);
    assertWindow({ ...existing.activity, ...changes });
    if (changes.maxAttempts !== undefined) assertAttemptPolicy(changes.maxAttempts);

    return this.txHost.run(async () => {
      const [activity] = await this.client
        .update(learningActivities)
        .set({
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.brief === undefined ? {} : { brief: changes.brief }),
          ...(changes.opensAt === undefined ? {} : { opensAt: changes.opensAt }),
          ...(changes.dueAt === undefined ? {} : { dueAt: changes.dueAt }),
          ...(changes.closesAt === undefined ? {} : { closesAt: changes.closesAt }),
          ...(changes.maxAttempts === undefined ? {} : { maxAttempts: changes.maxAttempts }),
          ...(changes.allowsLateSubmission === undefined
            ? {}
            : { allowsLateSubmission: changes.allowsLateSubmission }),
          ...(changes.visible === undefined ? {} : { visible: changes.visible }),
          ...(changes.position === undefined ? {} : { position: changes.position }),
        })
        .where(eq(learningActivities.id, assignmentId))
        .returning();

      if (!activity) throw new EntityNotFoundError('assignment', assignmentId);

      const [assessment] = await this.client
        .update(assessments)
        .set({
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.maxPoints === undefined ? {} : { maxPoints: numeric(changes.maxPoints) }),
          ...(changes.countsTowardFinalGrade === undefined
            ? {}
            : { countsTowardFinalGrade: changes.countsTowardFinalGrade }),
        })
        .where(eq(assessments.id, existing.assessment.id))
        .returning();

      if (!assessment) throw new EntityNotFoundError('assessment', existing.assessment.id);

      return { activity, assessment };
    });
  }

  async remove(
    institutionId: string,
    spaceId: string,
    assignmentId: string,
    userId: string,
  ): Promise<void> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const existing = await this.entryOrFail(spaceId, assignmentId);
    const now = new Date();

    await this.txHost.run(async () => {
      await this.client
        .update(assessments)
        .set({ deletedAt: now })
        .where(eq(assessments.id, existing.assessment.id));
      await this.client
        .update(learningActivities)
        .set({ deletedAt: now })
        .where(eq(learningActivities.id, assignmentId));
    });
  }

  async entryOrFail(spaceId: string, assignmentId: string): Promise<AssignmentEntry> {
    const [row] = await this.client
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
          eq(learningActivities.id, assignmentId),
          eq(learningActivities.learningSpaceId, spaceId),
          eq(learningActivities.type, 'assignment'),
          isNull(learningActivities.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('assignment', assignmentId);

    return row;
  }

  private async nextPosition(spaceId: string): Promise<number> {
    const [row] = await this.client
      .select({ highest: max(learningActivities.position) })
      .from(learningActivities)
      .where(
        and(
          eq(learningActivities.learningSpaceId, spaceId),
          isNull(learningActivities.deletedAt),
        ),
      );

    return (row?.highest ?? -1) + 1;
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function visibleTo(stance: LearningStance, rows: AssignmentEntry[]): AssignmentEntry[] {
  return stance === 'author' ? rows : rows.filter((row) => row.activity.visible);
}

function numeric(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(4);
}

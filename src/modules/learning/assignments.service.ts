import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  assessments,
  learningActivities,
  type Assessment,
  type CompletionRule,
  type LearningActivity,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { LearningActivityNotificationsService } from '../notifications/learning-activity-notifications.service';

import { AssignmentAnnouncementsService } from './assignment-announcements.service';
import { assignmentCompletion, completionChanged } from './assignment-completion';
import { assertAttemptPolicy, assertWindow } from './assignment-policy';
import { CompletionService } from './completion.service';
import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import {
  assertAvailabilityWindow,
  availabilityChanges,
  teaserOf,
} from './learning-availability';
import { AvailabilityService, type Gated } from './learning-availability.service';
import { LearningOutlineService } from './learning-outline.service';
import type { RestrictionInput } from './restriction';
import type { AudienceInput } from './restriction-audience';
import { RestrictionRulesService } from './restriction-rules.service';

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
  readonly sectionId?: string | null;
  readonly availableFrom?: Date | null;
  readonly availableUntil?: Date | null;
  readonly hiddenUntilAvailable?: boolean;
  readonly completionRule?: CompletionRule;
  readonly completionPassPoints?: number | null;
  readonly restriction?: RestrictionInput | null;
  readonly audience?: AudienceInput | null;
}

export type AssignmentChanges = Partial<NewAssignment> & { readonly position?: number };

export interface AssignmentEntry {
  readonly activity: LearningActivity;
  readonly assessment: Assessment;
}

const ASSIGNMENT_CONTENT = ['brief', 'opensAt', 'dueAt', 'closesAt'] as const;

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
    private readonly notifications: LearningActivityNotificationsService,
    private readonly outline: LearningOutlineService,
    private readonly announcements: AssignmentAnnouncementsService,
    private readonly completion: CompletionService,
    private readonly availability: AvailabilityService,
    private readonly restrictions: RestrictionRulesService,
  ) {}

  async list(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<Gated<AssignmentEntry>[]> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);

    return this.listFor(context);
  }

  async listFor(context: LearningSpaceContext): Promise<Gated<AssignmentEntry>[]> {
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
          eq(learningActivities.learningSpaceId, context.space.id),
          eq(learningActivities.type, 'assignment'),
          isNull(learningActivities.deletedAt),
        ),
      )
      .orderBy(asc(learningActivities.position), asc(learningActivities.createdAt));

    return this.availability.sift(context, rows, {
      itemOf: (row) => row.activity,
      teaser: (row) => ({ ...row, activity: teaserOf(row.activity, ASSIGNMENT_CONTENT) }),
    });
  }

  async findOne(
    institutionId: string,
    spaceId: string,
    assignmentId: string,
    userId: string,
  ): Promise<Gated<AssignmentEntry>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    const entry = await this.entryOrFail(spaceId, assignmentId);

    if (!(await this.availability.isOpenTo(context, entry.activity))) {
      throw new EntityNotFoundError('assignment', assignmentId);
    }

    return this.gatedEntry(context, entry);
  }

  async create(
    institutionId: string,
    spaceId: string,
    userId: string,
    input: NewAssignment,
    now = new Date(),
  ): Promise<Gated<AssignmentEntry>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);
    assertWindow(input);
    assertAvailabilityWindow(input);
    assertAttemptPolicy(input.maxAttempts ?? null);
    const completion = assignmentCompletion(input);
    await this.outline.assertSectionOf(spaceId, input.sectionId);
    const sectionId = input.sectionId ?? null;
    const { restriction = null } = await this.restrictions.settle(
      { spaceId, offeringId: context.offeringId, key: null, sectionId, restriction: null },
      { input: input.restriction, audience: input.audience },
    );

    return this.txHost.run(async () => {
      const [activity] = await this.client
        .insert(learningActivities)
        .values({
          institutionId,
          learningSpaceId: spaceId,
          type: 'assignment',
          name: input.name,
          brief: input.brief ?? null,
          sectionId,
          position: await this.outline.nextPosition(spaceId, sectionId),
          opensAt: input.opensAt ?? null,
          dueAt: input.dueAt ?? null,
          closesAt: input.closesAt ?? null,
          maxAttempts: input.maxAttempts ?? 1,
          allowsLateSubmission: input.allowsLateSubmission ?? false,
          visible: input.visible ?? true,
          availableFrom: input.availableFrom ?? null,
          availableUntil: input.availableUntil ?? null,
          hiddenUntilAvailable: input.hiddenUntilAvailable ?? false,
          restriction,
          ...completion,
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

      await this.announcements.announceNewlySeen(now, spaceId);

      return this.gatedEntry(context, { activity, assessment });
    });
  }

  async update(
    institutionId: string,
    spaceId: string,
    assignmentId: string,
    userId: string,
    changes: AssignmentChanges,
    now = new Date(),
  ): Promise<Gated<AssignmentEntry>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const existing = await this.entryOrFail(spaceId, assignmentId);
    assertWindow({ ...existing.activity, ...changes });
    assertAvailabilityWindow({ ...existing.activity, ...changes });
    if (changes.maxAttempts !== undefined) assertAttemptPolicy(changes.maxAttempts);
    const completion = assignmentCompletion(changes, existing);
    const placement = await this.outline.placement(
      spaceId,
      existing.activity.sectionId,
      changes,
    );
    const restriction = await this.restrictions.settle(
      {
        spaceId,
        offeringId: context.offeringId,
        key: `assignment:${assignmentId}`,
        sectionId:
          placement.sectionId === undefined ? existing.activity.sectionId : placement.sectionId,
        restriction: existing.activity.restriction,
      },
      {
        input: changes.restriction,
        audience: changes.audience,
        moved: placement.sectionId !== undefined,
      },
    );

    const activityChanges = {
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
      ...availabilityChanges(changes),
      ...placement,
      ...restriction,
      ...completion,
    };

    const assessmentChanges = {
      ...(changes.name === undefined ? {} : { name: changes.name }),
      ...(changes.maxPoints === undefined ? {} : { maxPoints: numeric(changes.maxPoints) }),
      ...(changes.countsTowardFinalGrade === undefined
        ? {}
        : { countsTowardFinalGrade: changes.countsTowardFinalGrade }),
    };

    return this.txHost.run(async () => {
      const [activity] = isEmpty(activityChanges)
        ? [existing.activity]
        : await this.client
            .update(learningActivities)
            .set(activityChanges)
            .where(eq(learningActivities.id, assignmentId))
            .returning();

      if (!activity) throw new EntityNotFoundError('assignment', assignmentId);

      const [assessment] = isEmpty(assessmentChanges)
        ? [existing.assessment]
        : await this.client
            .update(assessments)
            .set(assessmentChanges)
            .where(eq(assessments.id, existing.assessment.id))
            .returning();

      if (!assessment) throw new EntityNotFoundError('assessment', existing.assessment.id);

      if (completionChanged(existing, { activity, assessment })) {
        await this.completion.recompute({ kind: 'assignment', id: assignmentId });
      }

      await this.notifications.rescheduled(
        institutionId,
        { previous: existing.activity, current: activity },
        now,
      );
      await this.announcements.announceNewlySeen(now, spaceId);

      return this.gatedEntry(context, { activity, assessment });
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

  private async gatedEntry(
    context: LearningSpaceContext,
    entry: AssignmentEntry,
  ): Promise<Gated<AssignmentEntry>> {
    const { gate } = await this.availability.gated(context, entry.activity);

    return { ...entry, gate };
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}

function isEmpty(changes: Record<string, unknown>): boolean {
  return Object.keys(changes).length === 0;
}

function numeric(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(4);
}

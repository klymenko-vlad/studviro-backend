import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  assessments,
  learningActivities,
  type CompletionRule,
  type QuizGradingMethod,
  type QuizLayout,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { LearningActivityNotificationsService } from '../notifications/learning-activity-notifications.service';

import { AssignmentAnnouncementsService } from './assignment-announcements.service';
import { assignmentCompletion, completionChanged } from './assignment-completion';
import { assertAttemptPolicy } from './assignment-policy';
import { CompletionService } from './completion.service';
import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import {
  assertAvailabilityWindow,
  availabilityChanges,
  teaserOf,
} from './learning-availability';
import { AvailabilityService, type Gated } from './learning-availability.service';
import { LearningOutlineService } from './learning-outline.service';
import { assertQuizWindow } from './quiz-policy';
import { QuizzesRepository, type QuizEntry } from './quizzes.repository';
import type { RestrictionInput } from './restriction';
import type { AudienceInput } from './restriction-audience';
import { RestrictionRulesService } from './restriction-rules.service';

export const DEFAULT_QUIZ_POINTS = 10;

export interface NewQuiz {
  readonly name: string;
  readonly brief?: string | null;
  readonly opensAt?: Date | null;
  readonly closesAt?: Date | null;
  readonly timeLimitMinutes?: number | null;
  readonly maxAttempts?: number | null;
  readonly gradingMethod?: QuizGradingMethod;
  readonly shuffleQuestions?: boolean;
  readonly shuffleChoices?: boolean;
  readonly layout?: QuizLayout;
  readonly maxPoints?: number;
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

export type QuizChanges = Partial<NewQuiz> & { readonly position?: number };

const QUIZ_CONTENT = ['brief', 'opensAt', 'dueAt'] as const;

@Injectable()
export class QuizzesService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly notifications: LearningActivityNotificationsService,
    private readonly outline: LearningOutlineService,
    private readonly announcements: AssignmentAnnouncementsService,
    private readonly completion: CompletionService,
    private readonly availability: AvailabilityService,
    private readonly restrictions: RestrictionRulesService,
    private readonly quizzes: QuizzesRepository,
  ) {}

  async list(institutionId: string, spaceId: string, userId: string) {
    return this.listFor(await this.access.contextForSpace(institutionId, spaceId, userId));
  }

  async listFor(context: LearningSpaceContext): Promise<Gated<QuizEntry>[]> {
    const entries = await this.quizzes.inSpace(context.space.id);

    return this.availability.sift(context, entries, {
      itemOf: (entry) => entry.activity,
      teaser: (entry) => ({
        ...entry,
        activity: teaserOf(entry.activity, QUIZ_CONTENT),
        quiz: null,
        totals: null,
      }),
    });
  }

  async findOne(
    institutionId: string,
    spaceId: string,
    quizId: string,
    userId: string,
  ): Promise<Gated<QuizEntry>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    const entry = await this.quizzes.findOrFail(spaceId, quizId);

    if (!(await this.availability.isOpenTo(context, entry.activity))) {
      throw new EntityNotFoundError('quiz', quizId);
    }

    return this.gatedEntry(context, entry);
  }

  async create(
    institutionId: string,
    spaceId: string,
    userId: string,
    input: NewQuiz,
    now = new Date(),
  ): Promise<Gated<QuizEntry>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);
    assertQuizWindow(input);
    assertAvailabilityWindow(input);
    assertAttemptPolicy(input.maxAttempts ?? null);
    const maxPoints = input.maxPoints ?? DEFAULT_QUIZ_POINTS;
    const completion = assignmentCompletion({ ...input, maxPoints }, undefined, 'quiz');
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
          type: 'quiz',
          name: input.name,
          brief: input.brief ?? null,
          sectionId,
          position: await this.outline.nextPosition(spaceId, sectionId),
          opensAt: input.opensAt ?? null,
          dueAt: input.closesAt ?? null,
          maxAttempts: input.maxAttempts === undefined ? 1 : input.maxAttempts,
          visible: input.visible ?? true,
          availableFrom: input.availableFrom ?? null,
          availableUntil: input.availableUntil ?? null,
          hiddenUntilAvailable: input.hiddenUntilAvailable ?? false,
          restriction,
          ...completion,
        })
        .returning();
      if (!activity) throw new ConflictError('QUIZ_NOT_CREATED', 'The quiz was not created');

      await this.client.insert(assessments).values({
        institutionId,
        learningSpaceId: spaceId,
        learningActivityId: activity.id,
        name: input.name,
        maxPoints: maxPoints.toFixed(4),
        countsTowardFinalGrade: input.countsTowardFinalGrade ?? true,
      });
      await this.quizzes.insertSettings({
        learningActivityId: activity.id,
        institutionId,
        timeLimitSeconds: secondsOf(input.timeLimitMinutes),
        gradingMethod: input.gradingMethod ?? 'highest',
        shuffleQuestions: input.shuffleQuestions ?? false,
        shuffleChoices: input.shuffleChoices ?? true,
        layout: input.layout ?? 'one_per_page',
      });

      await this.announcements.announceNewlySeen(now, spaceId);

      return this.gatedEntry(context, await this.quizzes.findOrFail(spaceId, activity.id));
    });
  }

  async update(
    institutionId: string,
    spaceId: string,
    quizId: string,
    userId: string,
    changes: QuizChanges,
    now = new Date(),
  ): Promise<Gated<QuizEntry>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const existing = await this.quizzes.findOrFail(spaceId, quizId);
    assertQuizWindow({
      opensAt: changes.opensAt === undefined ? existing.activity.opensAt : changes.opensAt,
      closesAt: changes.closesAt === undefined ? existing.activity.dueAt : changes.closesAt,
    });
    assertAvailabilityWindow({ ...existing.activity, ...changes });
    if (changes.maxAttempts !== undefined) assertAttemptPolicy(changes.maxAttempts);
    const completion = assignmentCompletion(changes, existing, 'quiz');
    const placement = await this.outline.placement(
      spaceId,
      existing.activity.sectionId,
      changes,
    );
    const restriction = await this.restrictions.settle(
      {
        spaceId,
        offeringId: context.offeringId,
        key: `quiz:${quizId}`,
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
      ...defined({
        name: changes.name,
        brief: changes.brief,
        opensAt: changes.opensAt,
        dueAt: changes.closesAt,
        maxAttempts: changes.maxAttempts,
        visible: changes.visible,
      }),
      ...availabilityChanges(changes),
      ...placement,
      ...restriction,
      ...completion,
    };
    const assessmentChanges = defined({
      name: changes.name,
      maxPoints: changes.maxPoints?.toFixed(4),
      countsTowardFinalGrade: changes.countsTowardFinalGrade,
    });
    const settingsChanges = defined({
      timeLimitSeconds:
        changes.timeLimitMinutes === undefined
          ? undefined
          : secondsOf(changes.timeLimitMinutes),
      gradingMethod: changes.gradingMethod,
      shuffleQuestions: changes.shuffleQuestions,
      shuffleChoices: changes.shuffleChoices,
      layout: changes.layout,
    });

    return this.txHost.run(async () => {
      if (Object.keys(activityChanges).length > 0) {
        await this.client
          .update(learningActivities)
          .set(activityChanges)
          .where(eq(learningActivities.id, quizId));
      }
      if (Object.keys(assessmentChanges).length > 0) {
        await this.client
          .update(assessments)
          .set(assessmentChanges)
          .where(eq(assessments.id, existing.assessment.id));
      }
      await this.quizzes.updateSettings(quizId, settingsChanges);

      const current = await this.quizzes.findOrFail(spaceId, quizId);
      if (completionChanged(existing, current)) {
        await this.completion.recompute({ kind: 'quiz', id: quizId });
      }
      await this.notifications.rescheduled(
        institutionId,
        { previous: existing.activity, current: current.activity },
        now,
      );
      await this.announcements.announceNewlySeen(now, spaceId);

      return this.gatedEntry(context, current);
    });
  }

  async remove(
    institutionId: string,
    spaceId: string,
    quizId: string,
    userId: string,
  ): Promise<void> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const existing = await this.quizzes.findOrFail(spaceId, quizId);
    const now = new Date();

    await this.txHost.run(async () => {
      await this.client
        .update(assessments)
        .set({ deletedAt: now })
        .where(eq(assessments.id, existing.assessment.id));
      await this.client
        .update(learningActivities)
        .set({ deletedAt: now })
        .where(eq(learningActivities.id, quizId));
    });
  }

  private async gatedEntry(
    context: LearningSpaceContext,
    entry: QuizEntry,
  ): Promise<Gated<QuizEntry>> {
    const { gate } = await this.availability.gated(context, entry.activity);

    return { ...entry, gate };
  }

  private get client() {
    return this.txHost.client();
  }
}

function secondsOf(minutes: number | null | undefined): number | null {
  return minutes === null || minutes === undefined ? null : minutes * 60;
}

function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

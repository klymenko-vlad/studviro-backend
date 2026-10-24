import { Injectable } from '@nestjs/common';

import { ConflictError, InvalidInputError } from '../../common/errors/domain.error';
import type { QuizSlot, QuizSlotKind } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { LearningAccessService } from './learning-access.service';
import { QuestionCategoriesRepository } from './question-categories.repository';
import { MAX_QUIZ_SLOTS, slotTotals, type SlotTotals } from './quiz-policy';
import { QuizSlotsRepository, type SlotQuery, type SlotRow } from './quiz-slots.repository';
import { QuizzesRepository } from './quizzes.repository';

export interface NewSlots {
  readonly kind: QuizSlotKind;
  readonly questionIds?: readonly string[] | null;
  readonly categoryId?: string | null;
  readonly pickCount?: number | null;
  readonly mark?: number | null;
}

export interface SlotChanges {
  readonly position?: number;
  readonly mark?: number;
  readonly pickCount?: number;
}

export interface SlotPage extends SlotTotals {
  readonly rows: SlotRow[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

interface QuizRef {
  readonly institutionId: string;
  readonly spaceId: string;
  readonly quizId: string;
  readonly userId: string;
}

const DEFAULT_RANDOM_MARK = 1;

@Injectable()
export class QuizSlotsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly quizzes: QuizzesRepository,
    private readonly slots: QuizSlotsRepository,
    private readonly categories: QuestionCategoriesRepository,
  ) {}

  async page(ref: QuizRef, query: SlotQuery): Promise<SlotPage> {
    await this.authorOf(ref);
    const [{ rows, total }, all] = await Promise.all([
      this.slots.page(ref.quizId, query),
      this.slots.all(ref.quizId),
    ]);

    return { rows, total, page: query.page, limit: query.limit, ...slotTotals(all) };
  }

  async add(ref: QuizRef, input: NewSlots): Promise<QuizSlot[]> {
    await this.authorOf(ref);
    const existing = await this.slots.all(ref.quizId);
    const values =
      input.kind === 'question'
        ? await this.byHand(ref, existing, input)
        : [await this.atRandom(ref, input)];

    if (existing.length + values.length > MAX_QUIZ_SLOTS) {
      throw new InvalidInputError(
        'QUIZ_SLOT_LIMIT',
        `A quiz holds at most ${MAX_QUIZ_SLOTS} questions and random draws`,
      );
    }

    const next = existing.length;

    return this.txHost.run(() =>
      this.slots.insert(
        values.map((value, index) => ({
          ...value,
          institutionId: ref.institutionId,
          learningActivityId: ref.quizId,
          position: next + index,
        })),
      ),
    );
  }

  async change(ref: QuizRef, slotId: string, changes: SlotChanges): Promise<QuizSlot> {
    await this.authorOf(ref);
    const slot = await this.slots.findOrFail(ref.quizId, slotId);

    if (changes.pickCount !== undefined) {
      if (slot.kind !== 'random' || slot.categoryId === null) {
        throw new InvalidInputError(
          'QUIZ_SLOT_NOT_RANDOM',
          'Only a random draw says how many questions it picks',
        );
      }
      await this.assertEnough(slot.categoryId, changes.pickCount);
    }

    return this.txHost.run(async () => {
      await this.slots.update(slotId, {
        ...(changes.mark === undefined ? {} : { mark: changes.mark.toFixed(4) }),
        ...(changes.pickCount === undefined ? {} : { pickCount: changes.pickCount }),
      });

      if (changes.position !== undefined) {
        const others = (await this.slots.all(ref.quizId)).filter((row) => row.id !== slotId);
        const at = Math.min(changes.position, others.length);
        await this.slots.renumber([...others.slice(0, at), slot, ...others.slice(at)]);
      }

      return this.slots.findOrFail(ref.quizId, slotId);
    });
  }

  async remove(ref: QuizRef, slotId: string): Promise<void> {
    await this.authorOf(ref);
    await this.slots.findOrFail(ref.quizId, slotId);

    await this.txHost.run(async () => {
      await this.slots.delete(slotId);
      await this.slots.renumber(await this.slots.all(ref.quizId));
    });
  }

  private async byHand(ref: QuizRef, existing: readonly QuizSlot[], input: NewSlots) {
    const questionIds = [...new Set(input.questionIds ?? [])];
    if (questionIds.length === 0) {
      throw new InvalidInputError('QUIZ_SLOT_INVALID', 'Pick the questions to add');
    }

    const found = await this.slots.bankQuestions(ref.spaceId, questionIds);
    if (found.length !== questionIds.length) {
      throw new InvalidInputError(
        'QUIZ_QUESTION_UNKNOWN',
        'A question is not in this course’s question bank',
      );
    }

    const placed = new Set(existing.map((slot) => slot.questionId));
    if (questionIds.some((id) => placed.has(id))) {
      throw new ConflictError(
        'QUIZ_QUESTION_ALREADY_ADDED',
        'A question is already in the quiz',
      );
    }

    const order = (id: string) => questionIds.indexOf(id);

    return [...found]
      .sort((a, b) => order(a.id) - order(b.id))
      .map((row) => ({
        kind: 'question' as const,
        questionId: row.id,
        mark: input.mark?.toFixed(4) ?? row.defaultMark,
      }));
  }

  private async atRandom(ref: QuizRef, input: NewSlots) {
    if (!input.categoryId || !input.pickCount) {
      throw new InvalidInputError(
        'QUIZ_SLOT_INVALID',
        'A random draw needs a category and how many questions to pick',
      );
    }
    if (!(await this.categories.findLive(ref.spaceId, input.categoryId))) {
      throw new InvalidInputError(
        'QUIZ_CATEGORY_UNKNOWN',
        'That category is not part of this course’s question bank',
      );
    }
    await this.assertEnough(input.categoryId, input.pickCount);

    return {
      kind: 'random' as const,
      categoryId: input.categoryId,
      pickCount: input.pickCount,
      mark: (input.mark ?? DEFAULT_RANDOM_MARK).toFixed(4),
    };
  }

  private async assertEnough(categoryId: string, pickCount: number): Promise<void> {
    const available = await this.categories.countQuestions(categoryId);
    if (available >= pickCount) return;

    throw new InvalidInputError(
      'QUIZ_RANDOM_NOT_ENOUGH_QUESTIONS',
      'The category has fewer questions than the draw picks',
      { available, pickCount },
    );
  }

  private async authorOf(ref: QuizRef): Promise<void> {
    const context = await this.access.contextForSpace(
      ref.institutionId,
      ref.spaceId,
      ref.userId,
    );
    this.access.assertAuthor(context);
    await this.quizzes.findOrFail(ref.spaceId, ref.quizId);
  }
}

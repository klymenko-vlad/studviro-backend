import { Injectable } from '@nestjs/common';

import type { Quiz, QuizAttemptQuestion } from '../../database/schema';

import { rounded } from './attempt-grading';
import { presentedOrderOf, secureRandom, type Random } from './attempt-presentation';
import { AttemptQuestionsRepository } from './attempt-questions.repository';
import { drawAttempt } from './quiz-draw';
import { QuizSlotsRepository } from './quiz-slots.repository';

export type PlannedQuestion = Pick<
  QuizAttemptQuestion,
  'position' | 'slotId' | 'questionVersionId' | 'mark' | 'presentedOrder'
>;

export interface PlannedAttempt {
  readonly questions: readonly PlannedQuestion[];
  readonly missing: number;
  readonly maxMarks: number;
}

@Injectable()
export class QuizAttemptBuilder {
  constructor(
    private readonly slots: QuizSlotsRepository,
    private readonly questions: AttemptQuestionsRepository,
  ) {}

  async plan(
    spaceId: string,
    quiz: Quiz,
    random: Random = secureRandom,
  ): Promise<PlannedAttempt> {
    const slots = await this.slots.all(quiz.learningActivityId);
    const categoryIds = [
      ...new Set(slots.flatMap((slot) => (slot.categoryId === null ? [] : [slot.categoryId]))),
    ];
    const pools = await this.questions.pools(spaceId, categoryIds);
    const draw = drawAttempt(
      slots.map((slot) => ({ ...slot, mark: Number(slot.mark) })),
      pools,
      quiz.shuffleQuestions,
      random,
    );
    const versions = await this.questions.latestVersions(
      draw.questions.map((question) => question.questionId),
    );
    const asked = draw.questions.flatMap((question) => {
      const version = versions.get(question.questionId);

      return version ? [{ ...question, version }] : [];
    });

    return {
      questions: asked.map((question, position) => ({
        position,
        slotId: question.slotId,
        questionVersionId: question.version.versionId,
        mark: question.mark.toFixed(4),
        presentedOrder: presentedOrderOf(
          question.version.type,
          question.version.answerKey,
          quiz.shuffleChoices,
          random,
        ),
      })),
      missing: draw.missing + draw.questions.length - asked.length,
      maxMarks: rounded(asked.reduce((sum, question) => sum + question.mark, 0)),
    };
  }
}

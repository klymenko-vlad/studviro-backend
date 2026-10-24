import { isDeepStrictEqual } from 'node:util';

import { Injectable } from '@nestjs/common';

import { ConflictError, InvalidInputError } from '../../common/errors/domain.error';
import type { QuestionType, QuestionVersion } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { LearningAccessService } from './learning-access.service';
import { answerKeyOf, type AnswerKeyInput } from './question-answer-key';
import { QuestionCategoriesRepository } from './question-categories.repository';
import {
  QuestionsRepository,
  type NewVersion,
  type QuestionEntry,
  type QuestionQuery,
} from './questions.repository';

export interface QuestionContent extends AnswerKeyInput {
  readonly categoryId: string;
  readonly name: string;
  readonly text: string;
  readonly defaultMark: number;
  readonly generalFeedback?: string | null;
}

export interface NewQuestion extends QuestionContent {
  readonly type: QuestionType;
}

export interface QuestionPage {
  readonly entries: QuestionEntry[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface QuestionVersionPage {
  readonly versions: QuestionVersion[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class QuestionBankService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly categories: QuestionCategoriesRepository,
    private readonly questions: QuestionsRepository,
  ) {}

  async page(
    institutionId: string,
    spaceId: string,
    userId: string,
    query: QuestionQuery,
  ): Promise<QuestionPage> {
    await this.assertAuthor(institutionId, spaceId, userId);
    const { entries, total } = await this.questions.page(spaceId, query);

    return { entries, total, page: query.page, limit: query.limit };
  }

  async findOne(
    institutionId: string,
    spaceId: string,
    questionId: string,
    userId: string,
  ): Promise<QuestionEntry> {
    await this.assertAuthor(institutionId, spaceId, userId);

    return this.questions.findLatestOrFail(spaceId, questionId);
  }

  async versions(
    institutionId: string,
    spaceId: string,
    questionId: string,
    userId: string,
    page: { page: number; limit: number },
  ): Promise<QuestionVersionPage> {
    await this.assertAuthor(institutionId, spaceId, userId);
    await this.questions.findLatestOrFail(spaceId, questionId);
    const { versions, total } = await this.questions.versions(questionId, page);

    return { versions, total, ...page };
  }

  async create(
    institutionId: string,
    spaceId: string,
    userId: string,
    input: NewQuestion,
  ): Promise<QuestionEntry> {
    await this.assertAuthor(institutionId, spaceId, userId);
    await this.assertCategory(spaceId, input.categoryId);
    const content = versionOf(institutionId, userId, input.type, input);

    return this.txHost.run(async () => {
      const question = await this.questions.insert(
        {
          institutionId,
          learningSpaceId: spaceId,
          categoryId: input.categoryId,
          type: input.type,
          createdById: userId,
        },
        content,
      );

      return this.questions.findLatestOrFail(spaceId, question.id);
    });
  }

  async revise(
    institutionId: string,
    spaceId: string,
    questionId: string,
    userId: string,
    input: QuestionContent,
  ): Promise<QuestionEntry> {
    await this.assertAuthor(institutionId, spaceId, userId);
    const existing = await this.questions.findLatestOrFail(spaceId, questionId);
    await this.assertCategory(spaceId, input.categoryId);
    const content = versionOf(institutionId, userId, existing.question.type, input);

    return this.txHost.run(async () => {
      await this.questions.appendVersion(
        existing.question,
        sameContent(existing.version, content) ? null : content,
        input.categoryId,
      );

      return this.questions.findLatestOrFail(spaceId, questionId);
    });
  }

  async remove(
    institutionId: string,
    spaceId: string,
    questionId: string,
    userId: string,
  ): Promise<void> {
    await this.assertAuthor(institutionId, spaceId, userId);
    await this.questions.findLatestOrFail(spaceId, questionId);

    if (await this.questions.placedInQuiz(questionId)) {
      throw new ConflictError(
        'QUESTION_IN_USE',
        'Take this question out of the quizzes it is in first',
      );
    }

    await this.questions.tombstone(questionId);
  }

  private async assertAuthor(institutionId: string, spaceId: string, userId: string) {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);
  }

  private async assertCategory(spaceId: string, categoryId: string): Promise<void> {
    if (await this.categories.findLive(spaceId, categoryId)) return;

    throw new InvalidInputError(
      'QUESTION_CATEGORY_UNKNOWN',
      'That category is not part of this course’s question bank',
    );
  }
}

function versionOf(
  institutionId: string,
  userId: string,
  type: QuestionType,
  input: QuestionContent,
): NewVersion {
  return {
    institutionId,
    createdById: userId,
    name: input.name.trim(),
    text: input.text.trim(),
    defaultMark: input.defaultMark.toFixed(4),
    generalFeedback: blankToNull(input.generalFeedback),
    answerKey: answerKeyOf(type, answerOf(input)),
  };
}

function answerOf(input: AnswerKeyInput): AnswerKeyInput {
  return {
    choices: input.choices,
    correct: input.correct,
    trueFeedback: input.trueFeedback,
    falseFeedback: input.falseFeedback,
    acceptedAnswers: input.acceptedAnswers,
    caseSensitive: input.caseSensitive,
    value: input.value,
    tolerance: input.tolerance,
    pairs: input.pairs,
  };
}

function sameContent(stored: QuestionVersion, next: NewVersion): boolean {
  return (
    stored.name === next.name &&
    stored.text === next.text &&
    Number(stored.defaultMark) === Number(next.defaultMark) &&
    stored.generalFeedback === (next.generalFeedback ?? null) &&
    isDeepStrictEqual(stored.answerKey, next.answerKey)
  );
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  return trimmed;
}

import { Injectable } from '@nestjs/common';

import { ConflictError } from '../../common/errors/domain.error';
import type { QuestionCategory } from '../../database/schema';

import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import {
  QuestionCategoriesRepository,
  type CategoryQuery,
  type CategoryRow,
} from './question-categories.repository';

export interface CategoryPage {
  readonly categories: CategoryRow[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@Injectable()
export class QuestionCategoriesService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly categories: QuestionCategoriesRepository,
  ) {}

  async page(
    institutionId: string,
    spaceId: string,
    userId: string,
    query: CategoryQuery,
  ): Promise<CategoryPage> {
    await this.authorOf(institutionId, spaceId, userId);
    const { categories, total } = await this.categories.page(spaceId, query);

    return { categories, total, page: query.page, limit: query.limit };
  }

  async create(
    institutionId: string,
    spaceId: string,
    userId: string,
    name: string,
  ): Promise<CategoryRow> {
    await this.authorOf(institutionId, spaceId, userId);
    const trimmed = await this.freeName(spaceId, name);
    const category = await this.categories.insert({
      institutionId,
      learningSpaceId: spaceId,
      name: trimmed,
    });

    return { ...category, questionCount: 0 };
  }

  async rename(
    institutionId: string,
    spaceId: string,
    categoryId: string,
    userId: string,
    name: string,
  ): Promise<CategoryRow> {
    await this.authorOf(institutionId, spaceId, userId);
    await this.categories.findLiveOrFail(spaceId, categoryId);
    const trimmed = await this.freeName(spaceId, name, categoryId);
    const category = await this.categories.rename(categoryId, trimmed);

    return { ...category, questionCount: await this.categories.countQuestions(categoryId) };
  }

  async remove(
    institutionId: string,
    spaceId: string,
    categoryId: string,
    userId: string,
  ): Promise<void> {
    await this.authorOf(institutionId, spaceId, userId);
    await this.categories.findLiveOrFail(spaceId, categoryId);

    if ((await this.categories.countQuestions(categoryId)) > 0) {
      throw new ConflictError(
        'QUESTION_CATEGORY_NOT_EMPTY',
        'Move or remove the questions in this category first',
      );
    }
    if (await this.categories.drawnFromByQuiz(categoryId)) {
      throw new ConflictError(
        'QUESTION_CATEGORY_IN_USE',
        'A quiz draws random questions from this category',
      );
    }

    await this.categories.tombstone(categoryId);
  }

  async liveCategory(spaceId: string, categoryId: string): Promise<QuestionCategory | null> {
    return this.categories.findLive(spaceId, categoryId);
  }

  private async authorOf(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<LearningSpaceContext> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    return context;
  }

  private async freeName(spaceId: string, name: string, exceptId?: string): Promise<string> {
    const trimmed = name.trim();
    if (await this.categories.nameTaken(spaceId, trimmed, exceptId)) {
      throw new ConflictError(
        'QUESTION_CATEGORY_EXISTS',
        'This bank already has a category with that name',
      );
    }

    return trimmed;
  }
}

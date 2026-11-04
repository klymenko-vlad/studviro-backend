import { Injectable } from '@nestjs/common';

import { rounded } from './attempt-grading';
import { DISTRIBUTED_TYPES, distributionOf, type Distribution } from './choice-distribution';
import { QuizAttemptAccessService, type QuizAt } from './quiz-attempt-access.service';
import { QuizAttemptClosingService } from './quiz-attempt-closing.service';
import type { Paged } from './quiz-attempt-lists.service';
import {
  QuizResultsRepository,
  type QuestionTally,
  type ResultsQuery,
} from './quiz-results.repository';

export interface QuestionResult extends Omit<QuestionTally, 'latestKey'> {
  readonly fullyRightPercent: number | null;
  readonly distribution: Distribution | null;
}

@Injectable()
export class QuizResultsService {
  constructor(
    private readonly access: QuizAttemptAccessService,
    private readonly closing: QuizAttemptClosingService,
    private readonly results: QuizResultsRepository,
  ) {}

  async byQuestion(
    at: QuizAt,
    query: ResultsQuery,
    now = new Date(),
  ): Promise<Paged<QuestionResult>> {
    await this.access.forAuthor(at);
    await this.closing.closeOverdue(now, { quizId: at.quizId });

    const page = await this.results.tallies(at.quizId, query);
    const answers = await this.results.answers(
      at.quizId,
      page.rows
        .filter((row) => DISTRIBUTED_TYPES.includes(row.type))
        .map((row) => row.questionId),
    );

    return {
      items: page.rows.map(({ latestKey, ...row }) => {
        const marked = row.attempts - row.awaitingMarking;

        return {
          ...row,
          averageMark: row.averageMark === null ? null : rounded(row.averageMark),
          averageOutOf: row.averageOutOf === null ? null : rounded(row.averageOutOf),
          fullyRightPercent:
            marked === 0 ? null : Math.round((row.fullyRight / marked) * 1000) / 10,
          distribution: distributionOf(
            row.type,
            latestKey,
            answers.filter((answer) => answer.questionId === row.questionId),
          ),
        };
      }),
      page: query.page,
      limit: query.limit,
      total: page.total,
    };
  }
}

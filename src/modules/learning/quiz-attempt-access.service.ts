import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, PermissionDeniedError } from '../../common/errors/domain.error';
import type { Quiz } from '../../database/schema';

import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import { AvailabilityService } from './learning-availability.service';
import { QuizzesRepository, type QuizEntry } from './quizzes.repository';

export interface QuizAt {
  readonly institutionId: string;
  readonly spaceId: string;
  readonly quizId: string;
  readonly userId: string;
}

export interface OpenQuiz {
  readonly context: LearningSpaceContext;
  readonly entry: QuizEntry;
  readonly quiz: Quiz;
}

@Injectable()
export class QuizAttemptAccessService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly availability: AvailabilityService,
    private readonly quizzes: QuizzesRepository,
  ) {}

  async forStudent(at: QuizAt, now: Date): Promise<OpenQuiz> {
    const context = await this.access.contextForSpace(at.institutionId, at.spaceId, at.userId);
    if (context.stance !== 'participant') {
      throw new PermissionDeniedError(
        'QUIZ_ATTEMPT_STUDENTS_ONLY',
        'Only a student enrolled on the course can attempt its quizzes',
      );
    }

    const entry = await this.quizzes.findOrFail(at.spaceId, at.quizId);
    if (!entry.quiz || !(await this.availability.isOpenTo(context, entry.activity, now))) {
      throw new EntityNotFoundError('quiz', at.quizId);
    }

    return { context, entry, quiz: entry.quiz };
  }

  async forAuthor(at: QuizAt): Promise<QuizEntry> {
    const context = await this.access.contextForSpace(at.institutionId, at.spaceId, at.userId);
    this.access.assertAuthor(context);

    return this.quizzes.findOrFail(at.spaceId, at.quizId);
  }
}

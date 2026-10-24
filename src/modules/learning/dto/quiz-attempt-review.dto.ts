import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  QUESTION_TYPES,
  QUIZ_ATTEMPT_CLOSERS,
  type QuestionType,
  type QuizAttemptCloser,
} from '../../../database/schema';
import type { QuestionReview } from '../attempt-review';
import { QUESTION_OUTCOMES, type QuestionOutcome, type RevealedKey } from '../question-review';
import type { AttemptReview } from '../quiz-attempt-review.service';
import type { ReviewShown } from '../quiz-review';

import { QuizAttemptScoreDto } from './quiz-attempt-score.dto';
import { MatchedPairResponseDto, QuizAnswerDto, QuizAttemptPartDto } from './quiz-attempt.dto';

@Exclude()
export class QuizReviewShownDto {
  @Expose() @ApiProperty({ description: 'Their own answers.' }) responses!: boolean;

  @Expose()
  @ApiProperty({ description: 'Whether each answer was right, and the marks per question.' })
  correctness!: boolean;

  @Expose() @ApiProperty({ description: 'The right answers.' }) correctAnswer!: boolean;

  @Expose()
  @ApiProperty({ description: 'General and per-choice feedback, and the marker’s comment.' })
  feedback!: boolean;

  @Expose() @ApiProperty({ description: 'The mark for the attempt.' }) overallMark!: boolean;

  static from(shown: ReviewShown): QuizReviewShownDto {
    return Object.assign(new QuizReviewShownDto(), shown);
  }
}

@Exclude()
export class QuizRevealedKeyDto {
  @Expose()
  @ApiProperty({
    type: Number,
    isArray: true,
    nullable: true,
    description: 'Right choice ids.',
  })
  choices!: number[] | null;

  @Expose() @ApiProperty({ type: Boolean, nullable: true }) value!: boolean | null;

  @Expose()
  @ApiProperty({
    type: String,
    isArray: true,
    nullable: true,
    description: 'Accepted answers.',
  })
  texts!: string[] | null;

  @Expose() @ApiProperty({ type: Number, nullable: true }) number!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) tolerance!: number | null;

  @Expose()
  @ApiProperty({ type: MatchedPairResponseDto, isArray: true, nullable: true })
  pairs!: MatchedPairResponseDto[] | null;

  static from(key: RevealedKey | null): QuizRevealedKeyDto | null {
    if (key === null) return null;

    return Object.assign(new QuizRevealedKeyDto(), {
      choices: key.choices === null ? null : [...key.choices],
      value: key.value,
      texts: key.texts === null ? null : [...key.texts],
      number: key.number,
      tolerance: key.tolerance,
      pairs:
        key.pairs === null
          ? null
          : key.pairs.map((pair) => Object.assign(new MatchedPairResponseDto(), pair)),
    });
  }
}

@Exclude()
export class QuizQuestionReviewDto {
  @Expose() @ApiProperty() position!: number;

  @Expose()
  @ApiProperty({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  type!: QuestionType;

  @Expose() @ApiProperty() text!: string;
  @Expose() @ApiProperty() mark!: number;

  @Expose()
  @ApiProperty({ type: QuizAttemptPartDto, isArray: true })
  choices!: QuizAttemptPartDto[];
  @Expose()
  @ApiProperty({ type: QuizAttemptPartDto, isArray: true })
  prompts!: QuizAttemptPartDto[];
  @Expose()
  @ApiProperty({ type: QuizAttemptPartDto, isArray: true })
  answers!: QuizAttemptPartDto[];

  @Expose()
  @ApiProperty({
    type: QuizAnswerDto,
    nullable: true,
    description: 'Null when unanswered, or while their answers are kept back.',
  })
  response!: QuizAnswerDto | null;

  @Expose()
  @ApiProperty({
    enum: QUESTION_OUTCOMES,
    enumName: 'QuizQuestionOutcome',
    nullable: true,
    description: 'Null while right and wrong are kept back.',
  })
  outcome!: QuestionOutcome | null;

  @Expose()
  @ApiProperty({ type: Number, nullable: true, description: 'Marks earned, when shown.' })
  awarded!: number | null;

  @Expose()
  @ApiProperty({ type: QuizRevealedKeyDto, nullable: true, description: 'When shown.' })
  key!: QuizRevealedKeyDto | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) generalFeedback!: string | null;

  @Expose()
  @ApiProperty({ type: String, isArray: true, description: 'Feedback on what was picked.' })
  specificFeedback!: string[];

  @Expose()
  @ApiProperty({ type: String, nullable: true, description: 'The marker’s comment.' })
  comment!: string | null;

  static from(review: QuestionReview): QuizQuestionReviewDto {
    const parts = (list: readonly { id: number; text: string }[]) =>
      list.map((part) => Object.assign(new QuizAttemptPartDto(), part));

    return Object.assign(new QuizQuestionReviewDto(), {
      position: review.position,
      type: review.type,
      text: review.text,
      mark: review.mark,
      choices: parts(review.parts.choices),
      prompts: parts(review.parts.prompts),
      answers: parts(review.parts.answers),
      response: QuizAnswerDto.from(review.response),
      outcome: review.outcome,
      awarded: review.awarded,
      key: QuizRevealedKeyDto.from(review.key),
      generalFeedback: review.generalFeedback,
      specificFeedback: [...review.specificFeedback],
      comment: review.comment,
    });
  }
}

@Exclude()
export class QuizAttemptReviewResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) quizId!: string;
  @Expose() @ApiProperty() attempt!: number;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startedAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: QUIZ_ATTEMPT_CLOSERS, enumName: 'QuizAttemptCloser', nullable: true })
  closedBy!: QuizAttemptCloser | null;

  @Expose()
  @ApiProperty({ type: QuizReviewShownDto, description: 'What the quiz lets them see now.' })
  shown!: QuizReviewShownDto;

  @Expose()
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When more becomes visible: the quiz’s close, if something waits for it.',
  })
  revealsAt!: Date | null;

  @Expose()
  @ApiProperty({ type: QuizAttemptScoreDto, nullable: true })
  score!: QuizAttemptScoreDto | null;

  @Expose()
  @ApiProperty({
    type: QuizQuestionReviewDto,
    isArray: true,
    description: 'Empty when no per-question option is shown.',
  })
  questions!: QuizQuestionReviewDto[];

  static from(review: AttemptReview): QuizAttemptReviewResponseDto {
    const { attempt } = review;

    return Object.assign(new QuizAttemptReviewResponseDto(), {
      id: attempt.id,
      quizId: attempt.learningActivityId,
      attempt: attempt.attempt,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      closedBy: attempt.closedBy,
      shown: QuizReviewShownDto.from(review.shown),
      revealsAt: review.revealsAt,
      score: QuizAttemptScoreDto.from(review.score),
      questions: review.questions.map((question) => QuizQuestionReviewDto.from(question)),
    });
  }
}

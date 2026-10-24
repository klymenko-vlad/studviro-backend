import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  QUESTION_TYPES,
  QUIZ_ATTEMPT_CLOSERS,
  QUIZ_ATTEMPT_PROGRESS,
  QUIZ_LAYOUTS,
  type AttemptResponse,
  type QuestionType,
  type QuizAttemptCloser,
  type QuizAttemptProgress,
  type QuizLayout,
} from '../../../database/schema';
import { remainingSeconds } from '../attempt-clock';
import { presentedParts, type PresentedPart } from '../attempt-presentation';
import type { AskedQuestion } from '../attempt-questions.repository';
import { MAX_ESSAY_LENGTH } from '../attempt-response';
import type { AttemptView, SavedAnswer } from '../quiz-attempts.service';

const MAX_PARTS = 20;

export class MatchedPairDto {
  @ApiProperty({ minimum: 0, description: 'The id of a prompt shown.' })
  @IsInt()
  @Min(0)
  prompt!: number;

  @ApiProperty({ minimum: 0, description: 'The id of an answer shown.' })
  @IsInt()
  @Min(0)
  answer!: number;
}

export class SaveQuizAnswerDto {
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Single choice: the id of the choice picked.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  choice?: number | null;

  @ApiPropertyOptional({
    type: Number,
    isArray: true,
    nullable: true,
    description: 'Multiple choice: the ids of every choice picked.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ArrayMaxSize(MAX_PARTS)
  @IsInt({ each: true })
  @Min(0, { each: true })
  choices?: number[] | null;

  @ApiPropertyOptional({ type: Boolean, nullable: true, description: 'True or false.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  value?: boolean | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_ESSAY_LENGTH,
    description: 'Short answer, numerical (as typed) or essay.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_ESSAY_LENGTH)
  text?: string | null;

  @ApiPropertyOptional({ type: MatchedPairDto, isArray: true, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ArrayMaxSize(MAX_PARTS)
  @ValidateNested({ each: true })
  @Type(() => MatchedPairDto)
  pairs?: MatchedPairDto[] | null;
}

@Exclude()
export class QuizAttemptPartDto {
  @Expose() @ApiProperty() id!: number;
  @Expose() @ApiProperty() text!: string;
}

@Exclude()
export class MatchedPairResponseDto {
  @Expose() @ApiProperty() prompt!: number;
  @Expose() @ApiProperty() answer!: number;
}

@Exclude()
export class QuizAnswerDto {
  @Expose() @ApiProperty({ type: Number, nullable: true }) choice!: number | null;
  @Expose()
  @ApiProperty({ type: Number, isArray: true, nullable: true })
  choices!: number[] | null;
  @Expose() @ApiProperty({ type: Boolean, nullable: true }) value!: boolean | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) text!: string | null;
  @Expose()
  @ApiProperty({ type: MatchedPairResponseDto, isArray: true, nullable: true })
  pairs!: MatchedPairResponseDto[] | null;

  static from(response: AttemptResponse | null): QuizAnswerDto | null {
    if (response === null) return null;

    return Object.assign(new QuizAnswerDto(), {
      choice: 'choice' in response ? response.choice : null,
      choices: 'choices' in response ? [...response.choices] : null,
      value: 'value' in response ? response.value : null,
      text: 'text' in response ? response.text : null,
      pairs:
        'pairs' in response
          ? response.pairs.map((pair) => Object.assign(new MatchedPairResponseDto(), pair))
          : null,
    });
  }
}

@Exclude()
export class QuizAttemptQuestionDto {
  @Expose() @ApiProperty() position!: number;

  @Expose()
  @ApiProperty({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  type!: QuestionType;

  @Expose() @ApiProperty() text!: string;
  @Expose() @ApiProperty() mark!: number;

  @Expose()
  @ApiProperty({
    type: QuizAttemptPartDto,
    isArray: true,
    description: 'Choices in the order this attempt shows them. Never says which is right.',
  })
  choices!: QuizAttemptPartDto[];

  @Expose()
  @ApiProperty({ type: QuizAttemptPartDto, isArray: true, description: 'Matching prompts.' })
  prompts!: QuizAttemptPartDto[];

  @Expose()
  @ApiProperty({ type: QuizAttemptPartDto, isArray: true, description: 'Matching answers.' })
  answers!: QuizAttemptPartDto[];

  @Expose()
  @ApiProperty({ type: QuizAnswerDto, nullable: true })
  response!: QuizAnswerDto | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  savedAt!: Date | null;

  static from(asked: AskedQuestion): QuizAttemptQuestionDto {
    const parts = presentedParts(asked.type, asked.answerKey, asked.row.presentedOrder);
    const dtos = (list: readonly PresentedPart[]) =>
      list.map((part) => Object.assign(new QuizAttemptPartDto(), part));

    return Object.assign(new QuizAttemptQuestionDto(), {
      position: asked.row.position,
      type: asked.type,
      text: asked.text,
      mark: Number(asked.row.mark),
      choices: dtos(parts.choices),
      prompts: dtos(parts.prompts),
      answers: dtos(parts.answers),
      response: QuizAnswerDto.from(asked.row.response),
      savedAt: asked.row.answeredAt,
    });
  }
}

@Exclude()
export class QuizAttemptResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) quizId!: string;
  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ enum: QUIZ_ATTEMPT_PROGRESS, enumName: 'QuizAttemptProgress' })
  state!: QuizAttemptProgress;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startedAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deadlineAt!: Date | null;

  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Whole seconds left on the server clock. Null: no time limit and no close.',
  })
  remainingSeconds!: number | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @Expose()
  @ApiProperty({
    enum: QUIZ_ATTEMPT_CLOSERS,
    enumName: 'QuizAttemptCloser',
    nullable: true,
    description: 'What closed it: the student, the time limit or the quiz closing.',
  })
  closedBy!: QuizAttemptCloser | null;

  @Expose() @ApiProperty({ enum: QUIZ_LAYOUTS, enumName: 'QuizLayout' }) layout!: QuizLayout;

  @Expose()
  @ApiProperty({
    description: 'Questions a random draw could not find when the attempt started.',
  })
  missingQuestions!: number;

  @Expose()
  @ApiProperty({
    type: QuizAttemptQuestionDto,
    isArray: true,
    description: 'The questions while the attempt runs; none once it has closed.',
  })
  questions!: QuizAttemptQuestionDto[];

  static from(view: AttemptView): QuizAttemptResponseDto {
    const { attempt } = view;
    const running = attempt.state === 'in_progress';

    return Object.assign(new QuizAttemptResponseDto(), {
      id: attempt.id,
      quizId: attempt.learningActivityId,
      attempt: attempt.attempt,
      state: attempt.state,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      remainingSeconds: running ? remainingSeconds(attempt.deadlineAt, view.now) : null,
      finishedAt: attempt.finishedAt,
      closedBy: attempt.closedBy,
      layout: view.layout,
      missingQuestions: attempt.missingQuestions,
      questions: view.questions.map((asked) => QuizAttemptQuestionDto.from(asked)),
    });
  }
}

@Exclude()
export class QuizAnswerSavedResponseDto {
  @Expose() @ApiProperty() position!: number;
  @Expose() @ApiProperty() answered!: boolean;
  @Expose()
  @ApiProperty({ type: QuizAnswerDto, nullable: true })
  response!: QuizAnswerDto | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  savedAt!: Date | null;

  @Expose() @ApiProperty({ type: Number, nullable: true }) remainingSeconds!: number | null;

  static from(saved: SavedAnswer): QuizAnswerSavedResponseDto {
    return Object.assign(new QuizAnswerSavedResponseDto(), {
      position: saved.question.position,
      answered: saved.question.response !== null,
      response: QuizAnswerDto.from(saved.question.response),
      savedAt: saved.question.answeredAt,
      remainingSeconds: remainingSeconds(saved.attempt.deadlineAt, saved.now),
    });
  }
}

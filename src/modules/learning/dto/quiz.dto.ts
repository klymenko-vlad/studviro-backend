import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  COMPLETION_RULES,
  QUIZ_GRADING_METHODS,
  QUIZ_LAYOUTS,
  QUIZ_REVIEW_TIMINGS,
  type CompletionRule,
  type QuizGradingMethod,
  type QuizLayout,
  type QuizReviewTiming,
} from '../../../database/schema';
import { MAX_ATTEMPT_LIMIT } from '../assignment-policy';
import { QUIZ_COMPLETION_RULES } from '../completion-rule';
import type { Gated } from '../learning-availability.service';
import {
  attemptStateAt,
  MAX_TIME_LIMIT_MINUTES,
  QUIZ_ATTEMPT_STATES,
  type QuizAttemptState,
} from '../quiz-policy';
import { reviewSettingsOf } from '../quiz-review';
import type { QuizEntry } from '../quizzes.repository';

import {
  AvailabilityDto,
  AvailabilityResponseDto,
  availabilityFields,
} from './availability.dto';

const MAX_NAME = 200;
const MAX_BRIEF = 20_000;
const MAX_POINTS = 100_000;

export class QuizReviewOptionsDto {
  @ApiPropertyOptional({
    enum: QUIZ_REVIEW_TIMINGS,
    enumName: 'QuizReviewTiming',
    description: 'Their own answers.',
  })
  @IsOptional()
  @IsIn(QUIZ_REVIEW_TIMINGS)
  responses?: QuizReviewTiming;

  @ApiPropertyOptional({
    enum: QUIZ_REVIEW_TIMINGS,
    enumName: 'QuizReviewTiming',
    description: 'Whether each answer was right, and the marks per question.',
  })
  @IsOptional()
  @IsIn(QUIZ_REVIEW_TIMINGS)
  correctness?: QuizReviewTiming;

  @ApiPropertyOptional({
    enum: QUIZ_REVIEW_TIMINGS,
    enumName: 'QuizReviewTiming',
    description: 'The right answers.',
  })
  @IsOptional()
  @IsIn(QUIZ_REVIEW_TIMINGS)
  correctAnswer?: QuizReviewTiming;

  @ApiPropertyOptional({
    enum: QUIZ_REVIEW_TIMINGS,
    enumName: 'QuizReviewTiming',
    description: 'General and per-choice feedback, and the marker’s comment.',
  })
  @IsOptional()
  @IsIn(QUIZ_REVIEW_TIMINGS)
  feedback?: QuizReviewTiming;

  @ApiPropertyOptional({
    enum: QUIZ_REVIEW_TIMINGS,
    enumName: 'QuizReviewTiming',
    description: 'The mark for each attempt and the quiz grade, in the gradebook too.',
  })
  @IsOptional()
  @IsIn(QUIZ_REVIEW_TIMINGS)
  overallMark?: QuizReviewTiming;
}

@Exclude()
export class QuizReviewOptionsResponseDto {
  @Expose()
  @ApiProperty({ enum: QUIZ_REVIEW_TIMINGS, enumName: 'QuizReviewTiming' })
  responses!: QuizReviewTiming;
  @Expose()
  @ApiProperty({ enum: QUIZ_REVIEW_TIMINGS, enumName: 'QuizReviewTiming' })
  correctness!: QuizReviewTiming;
  @Expose()
  @ApiProperty({ enum: QUIZ_REVIEW_TIMINGS, enumName: 'QuizReviewTiming' })
  correctAnswer!: QuizReviewTiming;
  @Expose()
  @ApiProperty({ enum: QUIZ_REVIEW_TIMINGS, enumName: 'QuizReviewTiming' })
  feedback!: QuizReviewTiming;
  @Expose()
  @ApiProperty({ enum: QUIZ_REVIEW_TIMINGS, enumName: 'QuizReviewTiming' })
  overallMark!: QuizReviewTiming;
}

export class CreateQuizDto extends AvailabilityDto {
  @ApiProperty({ maxLength: MAX_NAME, example: 'Week 1 quiz' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_BRIEF,
    description: 'What students read before they start.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_BRIEF)
  brief?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Attempts may start from this moment. Null: as soon as students can see it.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  opensAt?: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'No attempt runs past this moment. It is the quiz’s deadline.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  closesAt?: Date | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: MAX_TIME_LIMIT_MINUTES,
    description: 'Minutes an attempt may last. Null: no limit.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_TIME_LIMIT_MINUTES)
  timeLimitMinutes?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: MAX_ATTEMPT_LIMIT,
    description: 'Null means unlimited. Defaults to one.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_ATTEMPT_LIMIT)
  maxAttempts?: number | null;

  @ApiPropertyOptional({
    enum: QUIZ_GRADING_METHODS,
    enumName: 'QuizGradingMethod',
    description: 'Which attempt’s mark goes to the gradebook when there are several.',
  })
  @IsOptional()
  @IsIn(QUIZ_GRADING_METHODS)
  gradingMethod?: QuizGradingMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shuffleChoices?: boolean;

  @ApiPropertyOptional({
    enum: QUIZ_LAYOUTS,
    enumName: 'QuizLayout',
    description: 'One question per page (the default) or every question on one page.',
  })
  @IsOptional()
  @IsIn(QUIZ_LAYOUTS)
  layout?: QuizLayout;

  @ApiPropertyOptional({
    type: QuizReviewOptionsDto,
    description:
      'What a student sees of a closed attempt, and when. Unset options keep their value (on create: answers, right or wrong, feedback and the mark at once; the right answers once the quiz closes).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuizReviewOptionsDto)
  review?: QuizReviewOptionsDto;

  @ApiPropertyOptional({
    minimum: 0,
    exclusiveMinimum: true,
    maximum: MAX_POINTS,
    default: 10,
    description: 'What the quiz is worth in the gradebook; question marks are scaled to it.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(MAX_POINTS)
  maxPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  countsTowardFinalGrade?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  sectionId?: string | null;

  @ApiPropertyOptional({ enum: QUIZ_COMPLETION_RULES })
  @IsOptional()
  @IsIn(QUIZ_COMPLETION_RULES)
  completionRule?: (typeof QUIZ_COMPLETION_RULES)[number];

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_POINTS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(MAX_POINTS)
  completionPassPoints?: number | null;
}

export class UpdateQuizDto extends PartialType(CreateQuizDto) {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

@Exclude()
export class QuizSettingsResponseDto {
  @Expose() @ApiProperty({ type: Number, nullable: true }) timeLimitMinutes!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) maxAttempts!: number | null;

  @Expose()
  @ApiProperty({ enum: QUIZ_GRADING_METHODS, enumName: 'QuizGradingMethod' })
  gradingMethod!: QuizGradingMethod;

  @Expose() @ApiProperty() shuffleQuestions!: boolean;
  @Expose() @ApiProperty() shuffleChoices!: boolean;
  @Expose() @ApiProperty({ enum: QUIZ_LAYOUTS, enumName: 'QuizLayout' }) layout!: QuizLayout;

  @Expose()
  @ApiProperty({ type: QuizReviewOptionsResponseDto })
  review!: QuizReviewOptionsResponseDto;

  @Expose()
  @ApiProperty({ description: 'How many questions an attempt asks.' })
  questionCount!: number;

  @Expose()
  @ApiProperty({
    enum: QUIZ_ATTEMPT_STATES,
    enumName: 'QuizAttemptState',
    description: 'Whether attempts may start now, on the server clock.',
  })
  attempts!: QuizAttemptState;
}

@Exclude()
export class QuizResponseDto extends AvailabilityResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) learningSpaceId!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) assessmentId!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) brief!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  opensAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  closesAt!: Date | null;

  @Expose() @ApiProperty() maxPoints!: number;
  @Expose() @ApiProperty() countsTowardFinalGrade!: boolean;
  @Expose() @ApiProperty({ type: Number, nullable: true }) position!: number | null;
  @Expose() @ApiProperty() visible!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sectionId!: string | null;

  @Expose() @ApiProperty({ enum: COMPLETION_RULES }) completionRule!: CompletionRule;

  @Expose()
  @ApiProperty({ type: Number, nullable: true })
  completionPassPoints!: number | null;

  @Expose()
  @ApiProperty({
    type: QuizSettingsResponseDto,
    nullable: true,
    description: 'Null for a student who may see only the title.',
  })
  settings!: QuizSettingsResponseDto | null;

  static from(entry: Gated<QuizEntry>, now = new Date()): QuizResponseDto {
    const { activity, assessment, quiz, totals } = entry;

    return Object.assign(new QuizResponseDto(), {
      id: activity.id,
      learningSpaceId: activity.learningSpaceId,
      assessmentId: assessment.id,
      name: activity.name,
      brief: activity.brief,
      opensAt: activity.opensAt,
      closesAt: activity.dueAt,
      maxPoints: Number(assessment.maxPoints),
      countsTowardFinalGrade: assessment.countsTowardFinalGrade,
      position: activity.position,
      visible: activity.visible,
      sectionId: activity.sectionId,
      completionRule: activity.completionRule,
      completionPassPoints:
        activity.completionPassPoints === null ? null : Number(activity.completionPassPoints),
      settings:
        quiz === null
          ? null
          : Object.assign(new QuizSettingsResponseDto(), {
              timeLimitMinutes:
                quiz.timeLimitSeconds === null ? null : quiz.timeLimitSeconds / 60,
              maxAttempts: activity.maxAttempts,
              gradingMethod: quiz.gradingMethod,
              shuffleQuestions: quiz.shuffleQuestions,
              shuffleChoices: quiz.shuffleChoices,
              layout: quiz.layout,
              review: Object.assign(new QuizReviewOptionsResponseDto(), reviewSettingsOf(quiz)),
              questionCount: totals?.questionCount ?? 0,
              attempts: attemptStateAt(
                { opensAt: activity.opensAt, closesAt: activity.dueAt },
                now,
              ),
            }),
      ...availabilityFields(activity, entry.gate, now),
    });
  }
}

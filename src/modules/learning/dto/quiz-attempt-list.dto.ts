import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  QUIZ_ATTEMPT_CLOSERS,
  QUIZ_ATTEMPT_PROGRESS,
  type QuizAttempt,
  type QuizAttemptCloser,
  type QuizAttemptProgress,
} from '../../../database/schema';
import type {
  AttemptStanding,
  MyAttempt,
  MyAttempts,
  Paged,
} from '../quiz-attempt-lists.service';
import type { StudentAttempt } from '../quiz-attempt-pages.repository';
import { START_BLOCKS, type StartBlock } from '../quiz-policy';

import { QuizAttemptScoreDto } from './quiz-attempt-score.dto';

export class ListQuizAttemptsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: QUIZ_ATTEMPT_PROGRESS, enumName: 'QuizAttemptProgress' })
  @IsOptional()
  @IsIn(QUIZ_ATTEMPT_PROGRESS)
  state?: QuizAttemptProgress;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'True: only closed attempts waiting for a teacher’s mark. False: only final ones.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  needsMarking?: boolean;

  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to students whose name or e-mail contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class ListMyQuizAttemptsQueryDto extends OmitType(ListQuizAttemptsQueryDto, [
  'q',
  'needsMarking',
] as const) {}

@Exclude()
export class QuizAttemptSummaryDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() attempt!: number;

  @Expose()
  @ApiProperty({ enum: QUIZ_ATTEMPT_PROGRESS, enumName: 'QuizAttemptProgress' })
  state!: QuizAttemptProgress;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startedAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: QUIZ_ATTEMPT_CLOSERS, enumName: 'QuizAttemptCloser', nullable: true })
  closedBy!: QuizAttemptCloser | null;
}

@Exclude()
export class QuizAttemptReviewStateDto {
  @Expose()
  @ApiProperty({ description: 'Whether the attempt can be reviewed now, on the server clock.' })
  available!: boolean;

  @Expose()
  @ApiProperty({
    type: QuizAttemptScoreDto,
    nullable: true,
    description: 'Null while the quiz’s review options keep the mark back.',
  })
  score!: QuizAttemptScoreDto | null;
}

@Exclude()
export class MyQuizAttemptDto extends QuizAttemptSummaryDto {
  @Expose()
  @ApiProperty({ type: QuizAttemptReviewStateDto })
  review!: QuizAttemptReviewStateDto;

  static from(mine: MyAttempt): MyQuizAttemptDto {
    return Object.assign(new MyQuizAttemptDto(), {
      ...attemptFields(mine.attempt),
      review: Object.assign(new QuizAttemptReviewStateDto(), {
        available: mine.review.available,
        score: QuizAttemptScoreDto.from(mine.review.score),
      }),
    });
  }
}

@Exclude()
export class QuizAttemptStandingDto {
  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'Continue this.' })
  inProgressId!: string | null;

  @Expose() @ApiProperty() used!: number;
  @Expose() @ApiProperty({ type: Number, nullable: true }) maxAttempts!: number | null;

  @Expose()
  @ApiProperty({
    enum: START_BLOCKS,
    enumName: 'QuizStartBlock',
    nullable: true,
    description: 'Why a new attempt cannot start now; null when it can, or one is running.',
  })
  blockedBy!: StartBlock | null;

  static from(standing: AttemptStanding): QuizAttemptStandingDto {
    return Object.assign(new QuizAttemptStandingDto(), standing);
  }
}

@Exclude()
export class MyQuizAttemptPageResponseDto {
  @Expose()
  @ApiProperty({ type: MyQuizAttemptDto, isArray: true })
  items!: MyQuizAttemptDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;
  @Expose() @ApiProperty({ type: QuizAttemptStandingDto }) standing!: QuizAttemptStandingDto;

  static from(page: MyAttempts): MyQuizAttemptPageResponseDto {
    return Object.assign(new MyQuizAttemptPageResponseDto(), {
      items: page.items.map((mine) => MyQuizAttemptDto.from(mine)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
      standing: QuizAttemptStandingDto.from(page.standing),
    });
  }
}

@Exclude()
export class AttemptStudentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;
}

@Exclude()
export class QuizAttemptRowDto extends QuizAttemptSummaryDto {
  @Expose() @ApiProperty({ type: AttemptStudentDto }) student!: AttemptStudentDto;
  @Expose() @ApiProperty() maxMarks!: number;

  @Expose()
  @ApiProperty({ type: Number, nullable: true, description: 'Marks earned, once closed.' })
  rawMarks!: number | null;

  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Scaled to what the quiz is worth; provisional while it needs marking.',
  })
  points!: number | null;

  @Expose() @ApiProperty() needsMarking!: boolean;
  @Expose() @ApiProperty() missingQuestions!: number;

  static fromRow(row: StudentAttempt): QuizAttemptRowDto {
    const { attempt } = row;

    return Object.assign(new QuizAttemptRowDto(), {
      ...attemptFields(attempt),
      student: Object.assign(new AttemptStudentDto(), row.student),
      maxMarks: Number(attempt.maxMarks),
      rawMarks: attempt.rawMarks === null ? null : Number(attempt.rawMarks),
      points: attempt.points === null ? null : Number(attempt.points),
      needsMarking: attempt.needsMarking,
      missingQuestions: attempt.missingQuestions,
    });
  }
}

@Exclude()
export class QuizAttemptPageResponseDto {
  @Expose()
  @ApiProperty({ type: QuizAttemptRowDto, isArray: true })
  items!: QuizAttemptRowDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: Paged<StudentAttempt>): QuizAttemptPageResponseDto {
    return Object.assign(new QuizAttemptPageResponseDto(), {
      items: page.items.map((row) => QuizAttemptRowDto.fromRow(row)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}

function attemptFields(attempt: QuizAttempt) {
  return {
    id: attempt.id,
    attempt: attempt.attempt,
    state: attempt.state,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    closedBy: attempt.closedBy,
  };
}

import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  QUIZ_ATTEMPT_CLOSERS,
  QUIZ_ATTEMPT_PROGRESS,
  type QuizAttempt,
  type QuizAttemptCloser,
  type QuizAttemptProgress,
} from '../../../database/schema';
import type { AttemptStanding, MyAttempts, Paged } from '../quiz-attempt-lists.service';
import type { StudentAttempt } from '../quiz-attempt-pages.repository';
import { START_BLOCKS, type StartBlock } from '../quiz-policy';

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
] as const) {}

@Exclude()
export class MyQuizAttemptDto {
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

  static from(attempt: QuizAttempt): MyQuizAttemptDto {
    return Object.assign(new MyQuizAttemptDto(), attemptFields(attempt));
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
      items: page.items.map((attempt) => MyQuizAttemptDto.from(attempt)),
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
export class QuizAttemptRowDto extends MyQuizAttemptDto {
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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

import type { AttemptForMarking, MarkedQuestion } from '../quiz-attempt-marking.service';

import { AttemptStudentDto, QuizAttemptRowDto } from './quiz-attempt-list.dto';
import { QuizQuestionReviewDto } from './quiz-attempt-review.dto';
import { QuizAttemptScoreDto } from './quiz-attempt-score.dto';

const MAX_COMMENT = 5_000;

export class MarkQuizQuestionDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    description:
      'The mark, up to what the question is worth. Null takes a teacher’s mark away: an essay waits for marking again, any other question goes back to its automatic mark.',
  })
  @ValidateIf((_, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  mark!: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MAX_COMMENT,
    description:
      'A comment for an essay; the reason, required, for changing an automatic mark.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_COMMENT)
  comment?: string | null;
}

@Exclude()
export class MarkedQuizQuestionDto extends QuizQuestionReviewDto {
  @Expose()
  @ApiProperty({ type: Number, nullable: true, description: 'What marking by the key gave.' })
  autoMark!: number | null;

  @Expose()
  @ApiProperty({ type: Number, nullable: true, description: 'A teacher’s mark, which stands.' })
  manualMark!: number | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  markedAt!: Date | null;

  static fromMarked(question: MarkedQuestion): MarkedQuizQuestionDto {
    return Object.assign(
      new MarkedQuizQuestionDto(),
      QuizQuestionReviewDto.from(question.review),
      {
        autoMark: question.autoMark,
        manualMark: question.manualMark,
        markedAt: question.markedAt,
      },
    );
  }
}

@Exclude()
export class QuizAttemptMarkingResponseDto extends QuizAttemptRowDto {
  @Expose() @ApiProperty({ type: QuizAttemptScoreDto }) score!: QuizAttemptScoreDto;

  @Expose()
  @ApiProperty({
    type: MarkedQuizQuestionDto,
    isArray: true,
    description: 'Once it has closed.',
  })
  questions!: MarkedQuizQuestionDto[];

  static fromMarking(view: AttemptForMarking): QuizAttemptMarkingResponseDto {
    return Object.assign(new QuizAttemptMarkingResponseDto(), QuizAttemptRowDto.fromRow(view), {
      student: Object.assign(new AttemptStudentDto(), view.student),
      score: QuizAttemptScoreDto.from(view.score),
      questions: view.questions.map((question) => MarkedQuizQuestionDto.fromMarked(question)),
    });
  }
}

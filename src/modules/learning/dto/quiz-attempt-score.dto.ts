import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { AttemptScoreView } from '../attempt-score';

@Exclude()
export class QuizAttemptScoreDto {
  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Null while it waits for marking.',
  })
  rawMarks!: number | null;

  @Expose() @ApiProperty() maxMarks!: number;

  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Null while it waits for marking.',
  })
  points!: number | null;

  @Expose() @ApiProperty() maxPoints!: number;
  @Expose() @ApiProperty() awaitingMarking!: boolean;

  static from(score: AttemptScoreView | null): QuizAttemptScoreDto | null {
    return score === null ? null : Object.assign(new QuizAttemptScoreDto(), score);
  }
}

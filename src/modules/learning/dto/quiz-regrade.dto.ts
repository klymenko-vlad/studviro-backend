import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { RegradeSummary } from '../quiz-regrade.service';

@Exclude()
export class QuizRegradeResponseDto {
  @Expose()
  @ApiProperty({ description: 'Closed attempts that asked an earlier version of a question.' })
  outdatedAttempts!: number;

  @Expose()
  @ApiProperty({
    description:
      'Questions left as they were because the new version has a different number of choices or pairs.',
  })
  incompatible!: number;

  @Expose()
  @ApiProperty({ description: 'Attempts moved to the latest versions.' })
  regradedAttempts!: number;

  @Expose()
  @ApiProperty({ description: 'Attempts whose score changes.' })
  changedAttempts!: number;

  @Expose()
  @ApiProperty({ description: 'Students whose quiz grade changes.' })
  changedStudents!: number;

  @Expose()
  @ApiProperty({ description: 'The largest rise in a student’s grade, in points.' })
  largestRise!: number;

  @Expose()
  @ApiProperty({ description: 'The largest fall in a student’s grade, in points.' })
  largestFall!: number;

  @Expose() @ApiProperty({ description: 'False for a preview.' }) applied!: boolean;

  static from(summary: RegradeSummary): QuizRegradeResponseDto {
    return Object.assign(new QuizRegradeResponseDto(), summary);
  }
}

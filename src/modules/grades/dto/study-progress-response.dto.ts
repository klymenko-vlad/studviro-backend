import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { StudyProgress } from '../study-progress';

@Exclude()
export class StudyProgressResponseDto {
  @Expose() @ApiProperty() gradedCourses!: number;
  @Expose() @ApiProperty() passedCourses!: number;
  @Expose() @ApiProperty() failedCourses!: number;
  @Expose() @ApiProperty() creditsEarned!: number;
  @Expose() @ApiProperty() creditsAttempted!: number;

  @Expose()
  @ApiProperty({ type: Number, nullable: true })
  weightedAverage!: number | null;

  @Expose() @ApiProperty() awaitingRetake!: number;

  static from(progress: StudyProgress): StudyProgressResponseDto {
    return Object.assign(new StudyProgressResponseDto(), progress);
  }
}

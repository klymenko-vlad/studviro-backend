import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import type { ProgrammeStanding } from '../programme-standing';
import type { StudyProgress } from '../study-progress';

/** Where the student stands in one programme, rather than in the abstract. */
@Exclude()
export class ProgrammeStandingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) programId!: string;
  @Expose() @ApiProperty() programCode!: string;
  @Expose() @ApiProperty() programName!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) studyYear!: number | null;

  @Expose()
  @ApiProperty({ type: Number, nullable: true })
  standardLengthSemesters!: number | null;

  @Expose()
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Null when the programme has no recorded length — there is then no denominator, and the screen must not invent one.',
  })
  creditsRequired!: number | null;

  @Expose() @ApiProperty({ type: Number }) creditsEarned!: number;
  @Expose() @ApiProperty({ type: Number, nullable: true }) percentComplete!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) creditsRemaining!: number | null;

  @Expose()
  @ApiProperty({
    description: 'The credits are there. Says nothing about a final examination.',
  })
  creditsComplete!: boolean;
}

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

  @Expose()
  @Type(() => ProgrammeStandingDto)
  @ApiProperty({ type: ProgrammeStandingDto, isArray: true })
  programmes!: ProgrammeStanding[];

  static from(
    progress: StudyProgress & { programmes: ProgrammeStanding[] },
  ): StudyProgressResponseDto {
    return Object.assign(new StudyProgressResponseDto(), progress);
  }
}

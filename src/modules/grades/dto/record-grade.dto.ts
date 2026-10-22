import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

import { COURSE_GRADES, type CourseGrade } from '../../../database/schema';

const MAX_NOTE = 500;

export class RecordGradeDto {
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    description:
      'Which sitting the grade belongs to. Omitted, it lands on the student’s current attempt; a resit is recorded by naming the next one.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  attempt?: number;

  @ApiPropertyOptional({
    enum: [...COURSE_GRADES, null],
    nullable: true,
    description: 'Behind `grade:propose`. Null withdraws the proposal.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(COURSE_GRADES)
  proposedGrade?: CourseGrade | null;

  @ApiPropertyOptional({
    enum: [...COURSE_GRADES, null],
    nullable: true,
    description: 'Behind `grade:publish`. Null withdraws the published grade.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(COURSE_GRADES)
  officialGrade?: CourseGrade | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_NOTE })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_NOTE)
  conflictNote?: string | null;
}

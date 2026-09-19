import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import {
  ACADEMIC_TERM_KINDS,
  type AcademicTerm,
  type AcademicTermKind,
} from '../../../database/schema';

const MAX_CODE = 64;
const MAX_NAME = 200;
const MAX_ACADEMIC_YEAR = 32;

export class CreateAcademicTermDto {
  @ApiProperty({ maxLength: MAX_CODE, example: '2026W' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE)
  code!: string;

  @ApiProperty({ maxLength: MAX_NAME, example: 'Winter semester 2026/2027' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @ApiPropertyOptional({ enum: ACADEMIC_TERM_KINDS })
  @IsOptional()
  @IsIn(ACADEMIC_TERM_KINDS)
  kind?: AcademicTermKind;

  @ApiProperty({ maxLength: MAX_ACADEMIC_YEAR, example: '2026/2027' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ACADEMIC_YEAR)
  academicYear!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Left unset, the term never opens for self-service enrolment.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  enrollmentOpensAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  enrollmentClosesAt?: Date | null;
}

export class UpdateAcademicTermDto extends PartialType(CreateAcademicTermDto) {}

@Exclude()
export class AcademicTermResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ enum: ACADEMIC_TERM_KINDS }) kind!: AcademicTermKind;
  @Expose() @ApiProperty() academicYear!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrollmentOpensAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrollmentClosesAt!: Date | null;

  static fromEntity(entity: AcademicTerm): AcademicTermResponseDto {
    return Object.assign(new AcademicTermResponseDto(), entity);
  }
}

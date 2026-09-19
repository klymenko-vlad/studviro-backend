import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

import {
  PROGRAM_MEMBERSHIP_STATUSES,
  type ProgramMembershipStatus,
} from '../../../database/schema';
import type { ProgramMemberEntry } from '../program-memberships.service';

const MAX_STUDY_YEAR = 10;

export class AdmitToProgramDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: MAX_STUDY_YEAR })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_STUDY_YEAR)
  studyYear?: number | null;

  @ApiPropertyOptional({ enum: PROGRAM_MEMBERSHIP_STATUSES })
  @IsOptional()
  @IsIn(PROGRAM_MEMBERSHIP_STATUSES)
  status?: ProgramMembershipStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  startedAt?: Date | null;
}

export class UpdateProgramMembershipDto {
  @ApiPropertyOptional({
    enum: PROGRAM_MEMBERSHIP_STATUSES,
    description:
      'Anything other than `active` takes the `student` role away and stamps the end date.',
  })
  @IsOptional()
  @IsIn(PROGRAM_MEMBERSHIP_STATUSES)
  status?: ProgramMembershipStatus;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: MAX_STUDY_YEAR })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_STUDY_YEAR)
  studyYear?: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  endedAt?: Date | null;
}

@Exclude()
export class ProgramMemberResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;

  @Expose()
  @ApiProperty({ enum: PROGRAM_MEMBERSHIP_STATUSES })
  status!: ProgramMembershipStatus;

  @Expose() @ApiProperty({ type: Number, nullable: true }) studyYear!: number | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endedAt!: Date | null;

  static from(entry: ProgramMemberEntry): ProgramMemberResponseDto {
    return Object.assign(new ProgramMemberResponseDto(), entry);
  }
}

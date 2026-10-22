import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

import { EXAM_TERM_KINDS, type ExamTermKind } from '../../../database/schema';
import type { ExamTermEntry } from '../exam-term-administration.service';

const MAX_CAPACITY = 100_000;

export class CreateExamTermDto {
  @ApiPropertyOptional({ enum: EXAM_TERM_KINDS })
  @IsOptional()
  @IsIn(EXAM_TERM_KINDS)
  kind?: ExamTermKind;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  endsAt?: Date | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: MAX_CAPACITY,
    description: 'How many seats the room holds. Null means no limit.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_CAPACITY)
  capacity?: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  registrationOpensAt?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  registrationClosesAt?: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  roomId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Somebody who teaches this offering.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  examinerId?: string | null;
}

export class UpdateExamTermDto extends PartialType(CreateExamTermDto) {}

@Exclude()
export class ExamTermAdminResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: EXAM_TERM_KINDS }) kind!: ExamTermKind;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  endsAt!: Date | null;

  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;

  @Expose()
  @ApiProperty({ type: Number, description: 'Seats held right now.' })
  seatsTaken!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registrationOpensAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  registrationClosesAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @Expose() @ApiProperty({ format: 'uuid', nullable: true }) roomId!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) roomCode!: string | null;
  @Expose() @ApiProperty({ format: 'uuid', nullable: true }) examinerId!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) examinerName!: string | null;

  static from(entry: ExamTermEntry): ExamTermAdminResponseDto {
    return Object.assign(new ExamTermAdminResponseDto(), entry);
  }
}

@Exclude()
export class ExamTermRefDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  static of(id: string): ExamTermRefDto {
    return Object.assign(new ExamTermRefDto(), { id });
  }
}

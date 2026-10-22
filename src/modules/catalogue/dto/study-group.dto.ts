import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { STUDY_GROUP_KINDS, type StudyGroupKind } from '../../../database/schema';
import type { StudyGroupEntry, StudyGroupMember } from '../study-groups.service';

const MAX_CODE = 64;
const MAX_NAME = 200;
const MAX_CAPACITY = 1000;

export class CreateStudyGroupDto {
  @ApiProperty({ maxLength: MAX_CODE, example: 'S1' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE)
  code!: string;

  @ApiPropertyOptional({ enum: STUDY_GROUP_KINDS })
  @IsOptional()
  @IsIn(STUDY_GROUP_KINDS)
  kind?: StudyGroupKind;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_NAME })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_NAME)
  name?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_CAPACITY })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_CAPACITY)
  capacity?: number | null;
}

export class UpdateStudyGroupDto extends PartialType(CreateStudyGroupDto) {}

export class AddStudyGroupMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

@Exclude()
export class StudyGroupMemberDto {
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;
}

@Exclude()
export class StudyGroupResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: STUDY_GROUP_KINDS }) kind!: StudyGroupKind;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;

  @Expose()
  @Type(() => StudyGroupMemberDto)
  @ApiProperty({ type: StudyGroupMemberDto, isArray: true })
  members!: StudyGroupMember[];

  static from(entry: StudyGroupEntry): StudyGroupResponseDto {
    return Object.assign(new StudyGroupResponseDto(), entry);
  }
}

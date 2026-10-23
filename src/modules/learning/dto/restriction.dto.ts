import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  CONDITION_TYPES,
  LEAF_CONDITION_TYPES,
  RESTRICTED_ITEM_KINDS,
  RESTRICTION_MATCHES,
  type ConditionType,
  type LeafConditionType,
  type RestrictedItemKind,
  type RestrictionMatch,
} from '../../../database/schema';
import { MAX_CONDITIONS } from '../restriction';

const MAX_POINTS = 100_000;

class ConditionFieldsDto {
  @ApiPropertyOptional({ enum: [...RESTRICTED_ITEM_KINDS, null], nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(RESTRICTED_ITEM_KINDS)
  itemKind?: RestrictedItemKind | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The material or assignment for completed; the assignment for mark.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  itemId?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_POINTS })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(MAX_POINTS)
  atLeast?: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Date)
  @IsDate()
  from?: Date | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  groupId?: string | null;
}

export class LeafConditionDto extends ConditionFieldsDto {
  @ApiProperty({
    enum: LEAF_CONDITION_TYPES,
    description:
      'completed: another item is complete; mark: an assignment is marked at or above atLeast points; date: from a moment on; group: the student is in a study group.',
  })
  @IsIn(LEAF_CONDITION_TYPES)
  type!: LeafConditionType;
}

export class ConditionDto extends ConditionFieldsDto {
  @ApiProperty({
    enum: CONDITION_TYPES,
    description:
      'A leaf condition, or set: a group of leaf conditions with a match of its own.',
  })
  @IsIn(CONDITION_TYPES)
  type!: ConditionType;

  @ApiPropertyOptional({ enum: [...RESTRICTION_MATCHES, null], nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(RESTRICTION_MATCHES)
  match?: RestrictionMatch | null;

  @ApiPropertyOptional({ type: () => LeafConditionDto, isArray: true, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(MAX_CONDITIONS)
  @ValidateNested({ each: true })
  @Type(() => LeafConditionDto)
  conditions?: LeafConditionDto[] | null;
}

export class RestrictionDto {
  @ApiProperty({
    enum: RESTRICTION_MATCHES,
    description: 'Every condition, or any one of them.',
  })
  @IsIn(RESTRICTION_MATCHES)
  match!: RestrictionMatch;

  @ApiPropertyOptional({
    description:
      'A student who does not meet it sees nothing at all, rather than the title and what unlocks it.',
  })
  @IsOptional()
  @IsBoolean()
  hideWhenLocked?: boolean;

  @ApiProperty({
    type: () => ConditionDto,
    isArray: true,
    minItems: 1,
    maxItems: MAX_CONDITIONS,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CONDITIONS)
  @ValidateNested({ each: true })
  @Type(() => ConditionDto)
  conditions!: ConditionDto[];
}

export class AudienceDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    minItems: 1,
    maxItems: MAX_CONDITIONS,
    description: 'Study groups of the offering. A student in any one of them may open it.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CONDITIONS)
  @IsUUID('all', { each: true })
  groupIds!: string[];

  @ApiPropertyOptional({
    description:
      'Students in none of the groups see nothing at all, rather than the title and the groups it is for.',
  })
  @IsOptional()
  @IsBoolean()
  hideFromOthers?: boolean;
}

export class RestrictedDto {
  @ApiPropertyOptional({
    type: () => RestrictionDto,
    nullable: true,
    description:
      'Locked until these conditions hold. Null removes the conditions; the groups it is for stay.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => RestrictionDto)
  restriction?: RestrictionDto | null;

  @ApiPropertyOptional({
    type: () => AudienceDto,
    nullable: true,
    description:
      'Only for these study groups, on top of any conditions. Null makes it for every group again; the conditions stay.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => AudienceDto)
  audience?: AudienceDto | null;
}

@Exclude()
export class LeafConditionViewDto {
  @Expose() @ApiProperty({ enum: CONDITION_TYPES }) type!: ConditionType;

  @Expose()
  @ApiProperty({ enum: [...RESTRICTED_ITEM_KINDS, null], nullable: true })
  itemKind!: RestrictedItemKind | null;

  @Expose() @ApiProperty({ type: String, format: 'uuid', nullable: true }) itemId!:
    string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) itemTitle!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) atLeast!: number | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  from!: Date | null;

  @Expose() @ApiProperty({ type: String, format: 'uuid', nullable: true }) groupId!:
    string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) groupName!: string | null;

  @Expose()
  @ApiProperty({
    description: 'The item or group it refers to has been removed, so it can never be met.',
  })
  missing!: boolean;
}

@Exclude()
export class ConditionViewDto extends LeafConditionViewDto {
  @Expose()
  @ApiProperty({ enum: [...RESTRICTION_MATCHES, null], nullable: true })
  match!: RestrictionMatch | null;

  @Expose()
  @ApiProperty({ type: () => LeafConditionViewDto, isArray: true, nullable: true })
  conditions!: LeafConditionViewDto[] | null;
}

@Exclude()
export class AudienceGroupViewDto {
  @Expose() @ApiProperty({ format: 'uuid' }) groupId!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) groupName!: string | null;

  @Expose()
  @ApiProperty({ description: 'The group has been removed, so nobody is in it.' })
  missing!: boolean;
}

@Exclude()
export class AudienceViewDto {
  @Expose() @ApiProperty() hideFromOthers!: boolean;

  @Expose()
  @ApiProperty({ type: () => AudienceGroupViewDto, isArray: true })
  groups!: AudienceGroupViewDto[];
}

@Exclude()
export class RestrictionViewDto {
  @Expose() @ApiProperty({ enum: RESTRICTION_MATCHES }) match!: RestrictionMatch;
  @Expose() @ApiProperty() hideWhenLocked!: boolean;

  @Expose()
  @ApiProperty({
    description:
      'For a student: it is locked, and conditions are only those still unmet. For an author: always false, with every condition.',
  })
  locked!: boolean;

  @Expose()
  @ApiProperty({
    type: () => ConditionViewDto,
    isArray: true,
    description: 'Empty when the item is only for some groups and has no other conditions.',
  })
  conditions!: ConditionViewDto[];

  @Expose()
  @ApiProperty({
    type: () => AudienceViewDto,
    nullable: true,
    description:
      'The study groups it is for. A student sees it only while being in none of them is what keeps it locked.',
  })
  audience!: AudienceViewDto | null;
}

@Exclude()
export class RestrictionResponseDto {
  @Expose()
  @ApiProperty({
    type: () => RestrictionViewDto,
    nullable: true,
    description:
      'An author sees the whole restriction. A student sees it only while it keeps the item locked, as what is still needed.',
  })
  restriction!: RestrictionViewDto | null;
}

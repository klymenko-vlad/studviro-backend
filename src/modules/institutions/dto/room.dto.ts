import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
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

import type { Room } from '../../../database/schema';

const MAX_CODE = 64;
const MAX_NAME = 200;
const MAX_CAPACITY = 10_000;

export class CreateRoomDto {
  @ApiProperty({ maxLength: MAX_CODE, example: 'FEI-101' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CODE)
  code!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_NAME })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_NAME)
  name?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_NAME })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_NAME)
  building?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0, maximum: MAX_CAPACITY })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_CAPACITY)
  capacity?: number | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'The faculty or department the room belongs to.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  orgUnitId?: string | null;
}

export class UpdateRoomDto extends PartialType(CreateRoomDto) {}

@Exclude()
export class RoomResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) building!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
  @Expose() @ApiProperty({ format: 'uuid', nullable: true }) orgUnitId!: string | null;

  static fromEntity(entity: Room): RoomResponseDto {
    return Object.assign(new RoomResponseDto(), entity);
  }
}

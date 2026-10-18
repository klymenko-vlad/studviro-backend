import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

export const MAX_THREAD_TITLE = 200;
export const MAX_POST_BODY = 10_000;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateDiscussionThreadDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_THREAD_TITLE })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_THREAD_TITLE)
  title!: string;

  @ApiProperty({ minLength: 1, maxLength: MAX_POST_BODY })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_POST_BODY)
  body!: string;
}

export class CreateDiscussionPostDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_POST_BODY })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_POST_BODY)
  body!: string;
}

export class DiscussionVisibilityDto {
  @ApiProperty({ description: 'True hides the item from students; false restores it.' })
  @IsBoolean()
  hidden!: boolean;
}

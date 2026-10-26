import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MAX_POST_ATTACHMENTS } from '../discussion-attachments.service';

export const MAX_THREAD_TITLE = 200;
export const MAX_POST_BODY = 10_000;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class DiscussionAttachmentClaimDto {
  @ApiProperty({ description: 'The key from an attachment upload ticket.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  storageKey!: string;

  @ApiProperty({ maxLength: 255, example: 'graf.png' })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;
}

class WithAttachments {
  @ApiProperty({
    type: DiscussionAttachmentClaimDto,
    isArray: true,
    required: false,
    maxItems: MAX_POST_ATTACHMENTS,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_POST_ATTACHMENTS)
  @ValidateNested({ each: true })
  @Type(() => DiscussionAttachmentClaimDto)
  attachments?: DiscussionAttachmentClaimDto[];
}

export class CreateDiscussionThreadDto extends WithAttachments {
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

export class CreateDiscussionPostDto extends WithAttachments {
  @ApiProperty({ minLength: 1, maxLength: MAX_POST_BODY })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_POST_BODY)
  body!: string;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description:
      'Answer this post. A top-level post gathers the reply under it; a reply keeps the new one in the same group and quotes it.',
  })
  @IsOptional()
  @IsUUID()
  replyToPostId?: string;
}

export class DiscussionVisibilityDto {
  @ApiProperty({ description: 'True hides the item from students; false restores it.' })
  @IsBoolean()
  hidden!: boolean;
}

export class EditDiscussionThreadDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_THREAD_TITLE })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_THREAD_TITLE)
  title!: string;
}

export class EditDiscussionPostDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_POST_BODY })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_POST_BODY)
  body!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { CursorPageMetaDto } from '../../../common/dto/pagination.dto';
import { FILE_SCAN_STATUSES, type FileScanStatus } from '../../../database/schema';
import { SCAN_STATUS_DESCRIPTION } from '../../storage/scan-status.dto';
import type { PostPage, PostView } from '../discussion-posts.service';
import { POST_STATES, type PostState } from '../discussion-visibility';
import type { ThreadDetail, ThreadList } from '../discussions.service';

@Exclude()
export class DiscussionAuthorDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() displayName!: string;
}

@Exclude()
export class DiscussionThreadSummaryDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() title!: string;

  @Expose()
  @Type(() => DiscussionAuthorDto)
  @ApiProperty({ type: DiscussionAuthorDto })
  author!: DiscussionAuthorDto;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) lastActivityAt!: Date;
  @Expose() @ApiProperty() postCount!: number;
  @Expose() @ApiProperty({ description: 'Hidden by a moderator.' }) hidden!: boolean;
}

export class DiscussionThreadListDto {
  @ApiProperty() readonly canModerate: boolean;

  @Type(() => DiscussionThreadSummaryDto)
  @ApiProperty({
    type: DiscussionThreadSummaryDto,
    isArray: true,
    description: 'Most recently active first.',
  })
  readonly items: DiscussionThreadSummaryDto[];

  @ApiProperty({ type: CursorPageMetaDto }) readonly meta: CursorPageMetaDto;

  constructor(list: ThreadList, limit: number) {
    this.canModerate = list.canModerate;
    this.items = list.items.map((item) =>
      Object.assign(new DiscussionThreadSummaryDto(), item),
    );
    this.meta = new CursorPageMetaDto(limit, list.hasNextPage, list.nextCursor);
  }
}

@Exclude()
export class DiscussionPostAuthorDto extends DiscussionAuthorDto {
  @Expose() @ApiProperty({ description: 'Teaches this course offering.' }) isTeacher!: boolean;
}

@Exclude()
export class DiscussionAttachmentDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() filename!: string;
  @Expose() @ApiProperty() contentType!: string;
  @Expose() @ApiProperty() sizeBytes!: number;

  @Expose()
  @ApiProperty({ enum: FILE_SCAN_STATUSES, description: SCAN_STATUS_DESCRIPTION })
  scanStatus!: FileScanStatus;
}

@Exclude()
export class DiscussionQuoteDto {
  @Expose() @ApiProperty({ format: 'uuid' }) postId!: string;

  @Expose()
  @Type(() => DiscussionAuthorDto)
  @ApiProperty({ type: DiscussionAuthorDto })
  author!: DiscussionAuthorDto;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The start of the quoted text; null when it is deleted or withheld.',
  })
  excerpt!: string | null;

  @Expose() @ApiProperty({ enum: POST_STATES }) state!: PostState;
}

@Exclude()
export class DiscussionPostDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @Type(() => DiscussionPostAuthorDto)
  @ApiProperty({ type: DiscussionPostAuthorDto })
  author!: DiscussionPostAuthorDto;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null when deleted, or hidden from a reader who cannot restore it.',
  })
  body!: string | null;

  @Expose() @ApiProperty({ enum: POST_STATES }) state!: PostState;
  @Expose() @ApiProperty() mine!: boolean;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  @Expose()
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the author last changed the text; null if never.',
  })
  editedAt!: Date | null;

  @Expose()
  @Type(() => DiscussionAttachmentDto)
  @ApiProperty({
    type: DiscussionAttachmentDto,
    isArray: true,
    description: 'Empty when the text is withheld from this reader.',
  })
  attachments!: DiscussionAttachmentDto[];

  @Expose()
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'The top-level post this reply is gathered under; null for a top-level post.',
  })
  parentPostId!: string | null;

  @Expose()
  @ApiProperty({ description: 'Replies gathered under a top-level post; 0 for a reply.' })
  replyCount!: number;

  @Expose()
  @Type(() => DiscussionQuoteDto)
  @ApiProperty({
    type: DiscussionQuoteDto,
    nullable: true,
    description: 'The reply this one answers, inside the same group.',
  })
  quote!: DiscussionQuoteDto | null;

  static from(view: PostView): DiscussionPostDto {
    return Object.assign(new DiscussionPostDto(), view);
  }
}

export class DiscussionPostPageDto {
  @Type(() => DiscussionPostDto)
  @ApiProperty({ type: DiscussionPostDto, isArray: true, description: 'Oldest first.' })
  readonly items: DiscussionPostDto[];

  @ApiProperty({ type: CursorPageMetaDto }) readonly meta: CursorPageMetaDto;

  constructor(page: PostPage, limit: number) {
    this.items = page.items.map((item) => DiscussionPostDto.from(item));
    this.meta = new CursorPageMetaDto(limit, page.hasNextPage, page.nextCursor);
  }
}

@Exclude()
export class DiscussionThreadDto extends DiscussionThreadSummaryDto {
  @Expose() @ApiProperty() canModerate!: boolean;

  static from(detail: ThreadDetail): DiscussionThreadDto {
    return Object.assign(new DiscussionThreadDto(), detail);
  }
}

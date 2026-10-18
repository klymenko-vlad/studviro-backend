import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

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

@Exclude()
export class DiscussionThreadListDto {
  @Expose() @ApiProperty() canModerate!: boolean;

  @Expose()
  @Type(() => DiscussionThreadSummaryDto)
  @ApiProperty({ type: DiscussionThreadSummaryDto, isArray: true })
  threads!: DiscussionThreadSummaryDto[];

  static from(list: ThreadList): DiscussionThreadListDto {
    return Object.assign(new DiscussionThreadListDto(), list);
  }
}

@Exclude()
export class DiscussionPostAuthorDto extends DiscussionAuthorDto {
  @Expose() @ApiProperty({ description: 'Teaches this course offering.' }) isTeacher!: boolean;
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
}

@Exclude()
export class DiscussionThreadDto extends DiscussionThreadSummaryDto {
  @Expose() @ApiProperty() canModerate!: boolean;

  @Expose()
  @Type(() => DiscussionPostDto)
  @ApiProperty({ type: DiscussionPostDto, isArray: true })
  posts!: DiscussionPostDto[];

  static from(detail: ThreadDetail): DiscussionThreadDto {
    return Object.assign(new DiscussionThreadDto(), detail);
  }
}

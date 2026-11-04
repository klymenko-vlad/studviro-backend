import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  GROUP_CONTENT_VIAS,
  type GroupContent,
  type GroupContentVia,
} from '../group-content.service';
import { SIGHT_SUBJECT_KINDS, type SightSubjectKind } from '../sight-report.service';

@Exclude()
export class GroupContentGroupDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
}

@Exclude()
export class GroupContentItemDto {
  @Expose() @ApiProperty({ enum: SIGHT_SUBJECT_KINDS }) kind!: SightSubjectKind;
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) spaceId!: string;

  @Expose()
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'The section it sits in; for a section, the section itself. Null: the general area.',
  })
  sectionId!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) sectionTitle!: string | null;

  @Expose()
  @ApiProperty({
    enum: GROUP_CONTENT_VIAS,
    isArray: true,
    description:
      'audience: it is only for this group (and any others named with it); condition: a condition of its restriction asks for this group.',
  })
  via!: GroupContentVia[];

  @Expose()
  @ApiProperty({ description: 'Students outside its groups see nothing of it.' })
  hideFromOthers!: boolean;
}

@Exclude()
export class GroupContentResponseDto {
  @Expose() @ApiProperty({ type: GroupContentGroupDto }) group!: GroupContentGroupDto;

  @Expose()
  @ApiProperty({
    type: GroupContentItemDto,
    isArray: true,
    description: 'A page of them, in outline order.',
  })
  items!: GroupContentItemDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(content: GroupContent): GroupContentResponseDto {
    return Object.assign(new GroupContentResponseDto(), {
      group: Object.assign(new GroupContentGroupDto(), content.group),
      items: content.items.map((item) => Object.assign(new GroupContentItemDto(), item)),
      meta: new PageMetaDto(content.page, content.limit, content.total),
    });
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { CursorPageMetaDto } from '../../../common/dto/pagination.dto';
import type { TeacherOffering, TeacherOfferingsPage } from '../teacher-offerings.service';

@Exclude()
export class TeacherOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) offeringId!: string;
  @Expose() @ApiProperty() courseTitle!: string;
  @Expose() @ApiProperty() courseCode!: string;
  @Expose() @ApiProperty() termName!: string;

  @Expose()
  @ApiProperty({
    description:
      'Whether the caller may open this course page: they teach it, are or were enrolled on it, or administer offerings.',
  })
  viewerCanOpen!: boolean;
}

export class TeacherOfferingPageDto {
  @Type(() => TeacherOfferingDto)
  @ApiProperty({ type: TeacherOfferingDto, isArray: true, description: 'Newest term first.' })
  readonly items: TeacherOffering[];

  @ApiProperty({ type: CursorPageMetaDto })
  readonly meta: CursorPageMetaDto;

  constructor(page: TeacherOfferingsPage, limit: number) {
    this.items = page.items;
    this.meta = new CursorPageMetaDto(limit, page.hasNextPage, page.nextCursor);
  }
}

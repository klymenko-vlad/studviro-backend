import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  ACCESS_REASONS,
  ACCESS_SOURCES,
  type AccessReason,
  type AccessSource,
} from '../access-explanation';
import type { Sight } from '../learning-availability';
import {
  SIGHT_SUBJECT_KINDS,
  type SightReport,
  type SightSubjectKind,
} from '../sight-report.service';

import { RestrictionViewDto } from './restriction.dto';

const SIGHTS = ['full', 'title', 'none'] as const;

@Exclude()
export class StudentSightDto {
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty() email!: string;

  @Expose()
  @ApiProperty({
    enum: SIGHTS,
    description: 'full: can open it now; title: sees only its title; none: does not see it.',
  })
  sight!: Sight;

  @Expose()
  @ApiProperty({
    enum: [...ACCESS_REASONS, null],
    nullable: true,
    description:
      'Why not full: hidden by the author, scheduled (not open yet), ended, or locked by a restriction. Null when it is open.',
  })
  reason!: AccessReason | null;

  @Expose()
  @ApiProperty({
    enum: [...ACCESS_SOURCES, null],
    nullable: true,
    description: 'Whether the item itself or the section it sits in is what keeps it closed.',
  })
  source!: AccessSource | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  availableFrom!: Date | null;

  @Expose()
  @ApiProperty({
    type: () => RestrictionViewDto,
    nullable: true,
    description:
      'When locked: the conditions this student has not met, or the groups they are not in. Given even when the student is shown nothing.',
  })
  restriction!: RestrictionViewDto | null;
}

@Exclude()
export class SightReportResponseDto {
  @Expose() @ApiProperty({ enum: SIGHT_SUBJECT_KINDS }) kind!: SightSubjectKind;
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() title!: string;

  @Expose()
  @ApiProperty({ description: 'Students on the course, whatever the search narrows to.' })
  students!: number;

  @Expose() @ApiProperty() canOpen!: number;
  @Expose() @ApiProperty() seeTitle!: number;
  @Expose() @ApiProperty() seeNothing!: number;

  @Expose()
  @ApiProperty({ type: StudentSightDto, isArray: true })
  items!: StudentSightDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(report: SightReport): SightReportResponseDto {
    return Object.assign(new SightReportResponseDto(), {
      kind: report.kind,
      id: report.id,
      title: report.title,
      students: report.students,
      canOpen: report.canOpen,
      seeTitle: report.seeTitle,
      seeNothing: report.seeNothing,
      items: report.rows.map((row) =>
        Object.assign(new StudentSightDto(), {
          userId: row.userId,
          displayName: row.displayName,
          email: row.email,
          ...row.access,
        }),
      ),
      meta: new PageMetaDto(report.page, report.limit, report.total),
    });
  }
}

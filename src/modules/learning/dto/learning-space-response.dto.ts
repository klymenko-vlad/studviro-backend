import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import type { LearningSpaceRow } from '../learning-spaces.repository';
import type { LearningSpaceSummary } from '../learning-spaces.service';

@Exclude()
export class LearningSpaceDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) shortName!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @Expose() @ApiProperty() visible!: boolean;
  @Expose() @ApiProperty({ type: String, nullable: true }) externalId!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastSynchronizedAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  offeringId!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) courseCode!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) courseTitle!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) termCode!: string | null;
  @Expose() @ApiProperty() activityCount!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextDueAt!: Date | null;

  static fromRow(row: LearningSpaceRow): LearningSpaceDto {
    return Object.assign(new LearningSpaceDto(), row);
  }
}

@Exclude()
export class LearningSpaceListResponseDto {
  @Expose() @ApiProperty() total!: number;
  @Expose() @ApiProperty() linked!: number;
  @Expose() @ApiProperty() unlinked!: number;

  @Expose()
  @Type(() => LearningSpaceDto)
  @ApiProperty({ type: LearningSpaceDto, isArray: true })
  spaces!: LearningSpaceDto[];

  static fromSummary(summary: LearningSpaceSummary): LearningSpaceListResponseDto {
    return Object.assign(new LearningSpaceListResponseDto(), {
      total: summary.total,
      linked: summary.linked,
      unlinked: summary.unlinked,
      spaces: summary.spaces.map((row) => LearningSpaceDto.fromRow(row)),
    });
  }
}

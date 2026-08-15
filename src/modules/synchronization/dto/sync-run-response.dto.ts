import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  SYNC_RUN_MODES,
  SYNC_RUN_STATUSES,
  SYNC_RUN_TRIGGERS,
  type SyncRun,
  type SyncRunMode,
  type SyncRunStatus,
  type SyncRunTrigger,
} from '../../../database/schema';

@Exclude()
export class SyncRunResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;
  @Expose() @ApiProperty() connectorName!: string;
  @Expose() @ApiProperty({ enum: SYNC_RUN_MODES }) mode!: SyncRunMode;
  @Expose() @ApiProperty({ enum: SYNC_RUN_TRIGGERS }) trigger!: SyncRunTrigger;
  @Expose() @ApiProperty({ enum: SYNC_RUN_STATUSES }) status!: SyncRunStatus;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) queuedAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @Expose() @ApiProperty() fetched!: number;
  @Expose() @ApiProperty() created!: number;
  @Expose() @ApiProperty() updated!: number;
  @Expose() @ApiProperty() deleted!: number;
  @Expose() @ApiProperty() skipped!: number;
  @Expose() @ApiProperty() failed!: number;

  @Expose() @ApiProperty({ type: String, nullable: true }) errorCode!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;

  static fromEntity(run: SyncRun): SyncRunResponseDto {
    const dto = new SyncRunResponseDto();

    dto.id = run.id;
    dto.institutionId = run.institutionId;
    dto.connectorName = run.connectorName;
    dto.mode = run.mode;
    dto.trigger = run.trigger;
    dto.status = run.status;
    dto.queuedAt = run.queuedAt;
    dto.startedAt = run.startedAt;
    dto.finishedAt = run.finishedAt;
    dto.fetched = run.fetched;
    dto.created = run.created;
    dto.updated = run.updated;
    dto.deleted = run.deleted;
    dto.skipped = run.skipped;
    dto.failed = run.failed;
    dto.errorCode = run.errorCode;
    dto.errorMessage = run.errorMessage;

    return dto;
  }
}

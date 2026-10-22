import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import { CursorPageMetaDto } from '../../../common/dto/pagination.dto';
import type { AuditEvent } from '../../../database/schema';
import { AUDIT_ACTIONS, AUDIT_SUBJECT_TYPES } from '../audit-actions';

@Exclude()
export class AuditEventResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) institutionId!: string;
  @Expose() @ApiProperty({ enum: AUDIT_ACTIONS }) action!: string;
  @Expose() @ApiProperty({ enum: AUDIT_SUBJECT_TYPES }) subjectType!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) subjectId!: string;

  @Expose()
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Expose()
  @ApiPropertyOptional({ type: String, nullable: true })
  summary!: string | null;

  @Expose()
  @ApiPropertyOptional({ type: Object, nullable: true })
  before!: Record<string, unknown> | null;

  @Expose()
  @ApiPropertyOptional({ type: Object, nullable: true })
  after!: Record<string, unknown> | null;

  @Expose()
  @ApiPropertyOptional({ type: String, nullable: true })
  requestId!: string | null;

  @Expose() @ApiProperty({ format: 'date-time' }) occurredAt!: Date;

  static fromEntity(event: AuditEvent): AuditEventResponseDto {
    const dto = new AuditEventResponseDto();

    dto.id = event.id;
    dto.institutionId = event.institutionId;
    dto.action = event.action;
    dto.subjectType = event.subjectType;
    dto.subjectId = event.subjectId;
    dto.actorUserId = event.actorUserId;
    dto.summary = event.summary;
    dto.before = event.before ?? null;
    dto.after = event.after ?? null;
    dto.requestId = event.requestId;
    dto.occurredAt = event.occurredAt;

    return dto;
  }
}

export class AuditEventPageDto {
  @ApiProperty({ type: AuditEventResponseDto, isArray: true })
  readonly items: AuditEventResponseDto[];

  @ApiProperty({ type: CursorPageMetaDto })
  readonly meta: CursorPageMetaDto;

  constructor(items: AuditEventResponseDto[], meta: CursorPageMetaDto) {
    this.items = items;
    this.meta = meta;
  }
}

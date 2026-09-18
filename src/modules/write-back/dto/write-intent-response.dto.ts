import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  SOURCE_SYSTEMS,
  SOURCE_WRITE_INTENT_KINDS,
  SOURCE_WRITE_INTENT_STATES,
  type SourceSystem,
  type SourceWriteIntent,
  type SourceWriteIntentKind,
  type SourceWriteIntentState,
} from '../../../database/schema';

@Exclude()
export class WriteIntentResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ enum: SOURCE_SYSTEMS })
  targetSourceSystem!: SourceSystem;

  @Expose() @ApiProperty() connectorName!: string;
  @Expose() @ApiProperty({ enum: SOURCE_WRITE_INTENT_KINDS }) kind!: SourceWriteIntentKind;
  @Expose() @ApiProperty({ enum: SOURCE_WRITE_INTENT_STATES }) state!: SourceWriteIntentState;
  @Expose() @ApiProperty() canonicalTable!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) canonicalId!: string;
  @Expose() @ApiProperty() attempts!: number;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  nextAttemptAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: Date | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) lastErrorCode!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) lastErrorMessage!: string | null;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static fromEntity(entity: SourceWriteIntent): WriteIntentResponseDto {
    const dto = new WriteIntentResponseDto();

    dto.id = entity.id;
    dto.targetSourceSystem = entity.targetSourceSystem;
    dto.connectorName = entity.connectorName;
    dto.kind = entity.kind;
    dto.state = entity.state;
    dto.canonicalTable = entity.canonicalTable;
    dto.canonicalId = entity.canonicalId;
    dto.attempts = entity.attempts;
    dto.nextAttemptAt = entity.nextAttemptAt;
    dto.deliveredAt = entity.deliveredAt;
    dto.lastErrorCode = entity.lastErrorCode;
    dto.lastErrorMessage = entity.lastErrorMessage;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}

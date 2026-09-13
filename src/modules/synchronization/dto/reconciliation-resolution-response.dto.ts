import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  DISCREPANCY_KINDS,
  RECONCILIATION_ACTIONS,
  type DiscrepancyKind,
  type ReconciliationAction,
  type ReconciliationResolution,
} from '../../../database/schema';
import type { ResolutionOutcome } from '../reconciliation-resolution.service';
import { RECONCILED_TABLES, type ReconciledDomain } from '../reconciliation.types';

const RECONCILED_DOMAINS = Object.keys(RECONCILED_TABLES) as ReconciledDomain[];

@Exclude()
export class ReconciliationResolutionResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty({ enum: RECONCILED_DOMAINS }) domain!: ReconciledDomain;
  @Expose() @ApiProperty({ enum: DISCREPANCY_KINDS }) kind!: DiscrepancyKind;
  @Expose() @ApiProperty({ enum: RECONCILIATION_ACTIONS }) action!: ReconciliationAction;
  @Expose() @ApiProperty() connectorName!: string;

  @Expose() @ApiProperty({ type: String, nullable: true }) externalId!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) canonicalId!: string | null;
  @Expose() @ApiProperty() detail!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) resolvedById!: string | null;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) resolvedAt!: Date;

  @Expose()
  @ApiProperty({
    description:
      'True when the resolution only clears the way and a full synchronization run is what applies it.',
  })
  requiresFullSync!: boolean;

  static fromEntity(
    resolution: ReconciliationResolution,
    requiresFullSync = false,
  ): ReconciliationResolutionResponseDto {
    const dto = new ReconciliationResolutionResponseDto();

    dto.id = resolution.id;
    dto.domain = resolution.domain as ReconciledDomain;
    dto.kind = resolution.kind;
    dto.action = resolution.action;
    dto.connectorName = resolution.connectorName;
    dto.externalId = resolution.externalId;
    dto.canonicalId = resolution.canonicalId;
    dto.detail = resolution.detail;
    dto.resolvedById = resolution.resolvedById;
    dto.resolvedAt = resolution.resolvedAt;
    dto.requiresFullSync = requiresFullSync;

    return dto;
  }

  static fromOutcome(outcome: ResolutionOutcome): ReconciliationResolutionResponseDto {
    return this.fromEntity(outcome.resolution, outcome.requiresFullSync);
  }
}

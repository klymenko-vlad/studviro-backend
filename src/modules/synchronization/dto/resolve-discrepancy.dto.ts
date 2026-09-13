import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

import {
  DISCREPANCY_KINDS,
  RECONCILIATION_ACTIONS,
  type DiscrepancyKind,
  type ReconciliationAction,
} from '../../../database/schema';
import { RECONCILED_TABLES, type ReconciledDomain } from '../reconciliation.types';

const RECONCILED_DOMAINS = Object.keys(RECONCILED_TABLES) as ReconciledDomain[];

export class ResolveDiscrepancyDto {
  @ApiProperty({ enum: RECONCILED_DOMAINS })
  @IsIn(RECONCILED_DOMAINS)
  domain!: ReconciledDomain;

  @ApiProperty({ enum: DISCREPANCY_KINDS })
  @IsIn(DISCREPANCY_KINDS)
  kind!: DiscrepancyKind;

  @ApiProperty({
    enum: RECONCILIATION_ACTIONS,
    description:
      '`accept_source` yields to the source system; `keep_platform` detaches the row from it and keeps the platform copy.',
  })
  @IsIn(RECONCILIATION_ACTIONS)
  action!: ReconciliationAction;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  canonicalId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  externalId?: string | null;
}

import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import {
  DISCREPANCY_KINDS,
  RECONCILED_TABLES,
  RECONCILIATION_DOMAIN_STATUSES,
  RECONCILIATION_SOURCE_SYSTEMS,
  type Discrepancy,
  type DiscrepancyKind,
  type DomainReconciliation,
  type ReconciledDomain,
  type ReconciliationDomainStatus,
  type ReconciliationReport,
  type ReconciliationSourceSystem,
} from '../reconciliation.types';

const RECONCILED_DOMAINS = Object.keys(RECONCILED_TABLES) as ReconciledDomain[];

@Exclude()
export class DiscrepancyResponseDto {
  @Expose() @ApiProperty({ enum: DISCREPANCY_KINDS }) kind!: DiscrepancyKind;
  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null when the platform row carries no external identifier.',
  })
  externalId!: string | null;

  @Expose()
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The canonical row, when one exists.',
  })
  canonicalId!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  sourceUpdatedAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  platformUpdatedAt!: Date | null;

  @Expose() @ApiProperty() detail!: string;

  static from(discrepancy: Discrepancy): DiscrepancyResponseDto {
    const dto = new DiscrepancyResponseDto();

    dto.kind = discrepancy.kind;
    dto.externalId = discrepancy.externalId;
    dto.canonicalId = discrepancy.canonicalId;
    dto.sourceUpdatedAt = discrepancy.sourceUpdatedAt;
    dto.platformUpdatedAt = discrepancy.platformUpdatedAt;
    dto.detail = discrepancy.detail;

    return dto;
  }
}

@Exclude()
export class DomainReconciliationResponseDto {
  @Expose() @ApiProperty({ enum: RECONCILED_DOMAINS }) domain!: ReconciledDomain;

  @Expose()
  @ApiProperty({ enum: RECONCILIATION_DOMAIN_STATUSES })
  status!: ReconciliationDomainStatus;

  @Expose() @ApiProperty() sourceCount!: number;
  @Expose() @ApiProperty() platformCount!: number;
  @Expose() @ApiProperty() matched!: number;
  @Expose() @ApiProperty() discrepancyCount!: number;

  @Expose()
  @ApiProperty({ type: DiscrepancyResponseDto, isArray: true })
  discrepancies!: DiscrepancyResponseDto[];

  @Expose()
  @ApiProperty({ description: 'More discrepancies exist than the report lists.' })
  truncated!: boolean;

  @Expose() @ApiProperty({ type: String, nullable: true }) errorMessage!: string | null;

  static from(domain: DomainReconciliation): DomainReconciliationResponseDto {
    const dto = new DomainReconciliationResponseDto();

    dto.domain = domain.domain;
    dto.status = domain.status;
    dto.sourceCount = domain.sourceCount;
    dto.platformCount = domain.platformCount;
    dto.matched = domain.matched;
    dto.discrepancyCount = domain.discrepancyCount;
    dto.discrepancies = domain.discrepancies.map((one) => DiscrepancyResponseDto.from(one));
    dto.truncated = domain.truncated;
    dto.errorMessage = domain.errorMessage;

    return dto;
  }
}

@Exclude()
export class ReconciliationReportResponseDto {
  @Expose()
  @ApiProperty({ enum: RECONCILIATION_SOURCE_SYSTEMS })
  sourceSystem!: ReconciliationSourceSystem;

  @Expose() @ApiProperty() connectorName!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) checkedAt!: Date;
  @Expose() @ApiProperty() discrepancyCount!: number;

  @Expose()
  @ApiProperty({ type: DomainReconciliationResponseDto, isArray: true })
  domains!: DomainReconciliationResponseDto[];

  static from(report: ReconciliationReport): ReconciliationReportResponseDto {
    const dto = new ReconciliationReportResponseDto();

    dto.sourceSystem = report.sourceSystem;
    dto.connectorName = report.connectorName;
    dto.checkedAt = report.checkedAt;
    dto.discrepancyCount = report.discrepancyCount;
    dto.domains = report.domains.map((domain) => DomainReconciliationResponseDto.from(domain));

    return dto;
  }
}

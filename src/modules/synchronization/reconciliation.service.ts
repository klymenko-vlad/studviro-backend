import { Inject, Injectable } from '@nestjs/common';

import { InvalidInputError } from '../../common/errors/domain.error';
import type { SourceSystem } from '../../database/schema';
import type { AcademicSystemConnector } from '../connectors/academic-system.connector';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import type { ConnectorRecord } from '../connectors/connector.types';
import { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

import { CanonicalRepositories } from './canonical.repositories';
import { ACADEMIC_IMPORTERS, type AcademicImporter } from './importers/academic.importer';
import type { ProvenanceSnapshot } from './provenance.repository';
import {
  isReconciled,
  tableFor,
  type Discrepancy,
  type DomainReconciliation,
  type ReconciledDomain,
  type ReconciliationReport,
} from './reconciliation.types';
import type { SyncTarget } from './sync.types';

const ACADEMIC_SOURCE: SourceSystem = 'sis';

/** How many discrepancies a domain reports before the rest are only counted. */
export const MAX_DISCREPANCIES_PER_DOMAIN = 25;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Compares the source population against the canonical one and reports where
 * they disagree. It reads both sides and writes neither: resolution is step 48,
 * and deciding a winner here would hide the disagreement rather than surface it
 * (ADR 0015).
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly configuration: InstitutionConfigurationService,
    private readonly registry: ConnectorRegistry,
    private readonly repositories: CanonicalRepositories,
    @Inject(ACADEMIC_IMPORTERS) private readonly importers: readonly AcademicImporter[],
  ) {}

  async academicTarget(institutionId: string): Promise<SyncTarget> {
    const { connectorName } = await this.academicConnector(institutionId);

    return { institutionId, sourceSystem: ACADEMIC_SOURCE, connectorName };
  }

  async report(institutionId: string): Promise<ReconciliationReport> {
    const { connector, connectorName } = await this.academicConnector(institutionId);
    const target: SyncTarget = {
      institutionId,
      sourceSystem: ACADEMIC_SOURCE,
      connectorName,
    };
    const capabilities = connector.capabilities();
    const domains: DomainReconciliation[] = [];

    for (const importer of this.importers) {
      if (!isReconciled(importer.domain)) continue;

      domains.push(
        capabilities[importer.capability]
          ? await this.reconcile(importer, importer.domain, connector, target)
          : this.skipped(importer.domain),
      );
    }

    return {
      institutionId,
      connectorName,
      checkedAt: new Date(),
      discrepancyCount: domains.reduce((total, domain) => total + domain.discrepancyCount, 0),
      domains,
    };
  }

  private async reconcile(
    importer: AcademicImporter,
    domain: ReconciledDomain,
    connector: AcademicSystemConnector,
    target: SyncTarget,
  ): Promise<DomainReconciliation> {
    let records: ConnectorRecord<unknown>[];
    try {
      // No `changedSince`: reconciliation compares populations, so a partial
      // window would report every unchanged row as missing from the source.
      records = await importer.fetch(connector, {});
    } catch (error) {
      return { ...this.skipped(domain), status: 'failed', errorMessage: messageOf(error) };
    }

    const rows = await this.repositories.of(tableFor(domain)).listProvenance(target);

    return this.compare(domain, records, rows);
  }

  private compare(
    domain: ReconciledDomain,
    records: readonly ConnectorRecord<unknown>[],
    rows: readonly ProvenanceSnapshot[],
  ): DomainReconciliation {
    const live = records.filter((record) => !record.deleted);
    const bySource = new Map(live.map((record) => [record.externalId, record]));
    const byPlatform = new Map<string, ProvenanceSnapshot>();
    for (const row of rows) {
      if (row.externalId !== null) byPlatform.set(row.externalId, row);
    }
    const discrepancies: Discrepancy[] = [];
    let matched = 0;

    for (const record of live) {
      const row = byPlatform.get(record.externalId);
      if (!row) {
        discrepancies.push({
          kind: 'missing_in_platform',
          externalId: record.externalId,
          canonicalId: null,
          sourceUpdatedAt: record.sourceUpdatedAt,
          platformUpdatedAt: null,
          detail: 'The source holds this record and the platform has no live row for it.',
        });
        continue;
      }

      matched += 1;

      if (row.synchronizationStatus !== null && row.synchronizationStatus !== 'in_sync') {
        discrepancies.push({
          kind: 'conflict',
          externalId: record.externalId,
          canonicalId: row.id,
          sourceUpdatedAt: record.sourceUpdatedAt,
          platformUpdatedAt: row.sourceUpdatedAt,
          detail: `The row is marked "${row.synchronizationStatus}" rather than in sync.`,
        });
        continue;
      }

      if (!row.sourceUpdatedAt || row.sourceUpdatedAt < record.sourceUpdatedAt) {
        discrepancies.push({
          kind: 'stale',
          externalId: record.externalId,
          canonicalId: row.id,
          sourceUpdatedAt: record.sourceUpdatedAt,
          platformUpdatedAt: row.sourceUpdatedAt,
          detail: 'The source has changed since the platform last took this row in.',
        });
      }
    }

    for (const row of rows) {
      // A row that claims this source but carries no external identifier cannot be
      // matched against anything, and the next import will neither update nor
      // tombstone it. That is a conflict, not a record the source dropped.
      if (row.externalId === null) {
        discrepancies.push({
          kind: 'conflict',
          externalId: null,
          canonicalId: row.id,
          sourceUpdatedAt: null,
          platformUpdatedAt: row.sourceUpdatedAt,
          detail:
            'The row claims this source but carries no external identifier, so no import can ever match it.',
        });
        continue;
      }

      if (bySource.has(row.externalId)) continue;

      discrepancies.push({
        kind: 'missing_in_source',
        externalId: row.externalId,
        canonicalId: row.id,
        sourceUpdatedAt: null,
        platformUpdatedAt: row.sourceUpdatedAt,
        detail: 'The platform holds a live row the source no longer offers.',
      });
    }

    return {
      domain,
      status: 'checked',
      sourceCount: live.length,
      platformCount: rows.length,
      matched,
      discrepancyCount: discrepancies.length,
      discrepancies: discrepancies.slice(0, MAX_DISCREPANCIES_PER_DOMAIN),
      truncated: discrepancies.length > MAX_DISCREPANCIES_PER_DOMAIN,
      errorMessage: null,
    };
  }

  private skipped(domain: ReconciledDomain): DomainReconciliation {
    return {
      domain,
      status: 'skipped',
      sourceCount: 0,
      platformCount: 0,
      matched: 0,
      discrepancyCount: 0,
      discrepancies: [],
      truncated: false,
      errorMessage: null,
    };
  }

  private async academicConnector(
    institutionId: string,
  ): Promise<{ connector: AcademicSystemConnector; connectorName: string }> {
    const { connectors } = await this.configuration.resolve(institutionId);
    const connectorName = connectors.academicSystem;

    if (!connectorName) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_CONFIGURED',
        'This institution has no academic system connector configured',
      );
    }

    const connector = this.registry.academicSystem(connectorName);
    if (!connector) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_INSTALLED',
        `No academic connector named "${connectorName}" is installed`,
        { connectorName },
      );
    }

    return { connector, connectorName };
  }
}

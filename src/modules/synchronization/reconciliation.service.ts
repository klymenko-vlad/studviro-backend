import { Inject, Injectable } from '@nestjs/common';

import { InvalidInputError } from '../../common/errors/domain.error';
import type { AcademicSystemConnector } from '../connectors/academic-system.connector';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import type { ConnectorRecord } from '../connectors/connector.types';
import type { LearningSystemConnector } from '../connectors/learning-system.connector';
import { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

import { CanonicalRepositories } from './canonical.repositories';
import { ACADEMIC_IMPORTERS, type AcademicImporter } from './importers/academic.importer';
import { LEARNING_IMPORTERS, type LearningImporter } from './importers/learning.importer';
import type { SourceImporter } from './importers/source.importer';
import type { ProvenanceSnapshot } from './provenance.repository';
import {
  isReconciledIn,
  tableFor,
  type Discrepancy,
  type DomainReconciliation,
  type ReconciledDomain,
  type ReconciliationReport,
  type ReconciliationSourceSystem,
} from './reconciliation.types';
import type { SyncTarget } from './sync.types';

/** How many discrepancies a domain reports before the rest are only counted. */
export const MAX_DISCREPANCIES_PER_DOMAIN = 25;

type AnyConnector = AcademicSystemConnector | LearningSystemConnector;
type AnyImporter = SourceImporter<never, string>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Compares the source population against the canonical one and reports where
 * they disagree. It reads both sides and writes neither: resolution is step 48,
 * and deciding a winner here would hide the disagreement rather than surface it
 * (ADR 0015).
 *
 * Both halves of the model are reconcilable. Which half is asked for is a
 * parameter, exactly as it is for a sync run: each has its own connector, its
 * own capability set and its own importers, and a row is only ever compared
 * against the source that owns it.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly configuration: InstitutionConfigurationService,
    private readonly registry: ConnectorRegistry,
    private readonly repositories: CanonicalRepositories,
    @Inject(ACADEMIC_IMPORTERS) private readonly academicImporters: readonly AcademicImporter[],
    @Inject(LEARNING_IMPORTERS) private readonly learningImporters: readonly LearningImporter[],
  ) {}

  async targetFor(
    institutionId: string,
    sourceSystem: ReconciliationSourceSystem,
  ): Promise<SyncTarget> {
    const { connectorName } = await this.connectorFor(institutionId, sourceSystem);

    return { institutionId, sourceSystem, connectorName };
  }

  async report(
    institutionId: string,
    sourceSystem: ReconciliationSourceSystem,
  ): Promise<ReconciliationReport> {
    const { connector, connectorName } = await this.connectorFor(institutionId, sourceSystem);
    const target: SyncTarget = { institutionId, sourceSystem, connectorName };
    const capabilities: Record<string, boolean | undefined> = connector.capabilities();
    const domains: DomainReconciliation[] = [];

    for (const importer of this.importersFor(sourceSystem)) {
      if (!isReconciledIn(importer.domain, sourceSystem)) continue;
      const domain: ReconciledDomain = importer.domain as ReconciledDomain;

      domains.push(
        capabilities[importer.capability]
          ? await this.reconcile(importer, domain, connector, target)
          : this.skipped(domain),
      );
    }

    return {
      institutionId,
      sourceSystem,
      connectorName,
      checkedAt: new Date(),
      discrepancyCount: domains.reduce((total, domain) => total + domain.discrepancyCount, 0),
      domains,
    };
  }

  private importersFor(sourceSystem: ReconciliationSourceSystem): readonly AnyImporter[] {
    return sourceSystem === 'lms' ? this.learningImporters : this.academicImporters;
  }

  private async reconcile(
    importer: AnyImporter,
    domain: ReconciledDomain,
    connector: AnyConnector,
    target: SyncTarget,
  ): Promise<DomainReconciliation> {
    let records: ConnectorRecord<unknown>[];
    try {
      // No `changedSince`: reconciliation compares populations, so a partial
      // window would report every unchanged row as missing from the source.
      records = await importer.fetch(connector as never, {});
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
          // A `pending` row is normally one an `accept_source` resolution cleared
          // the way for. Reporting it as a fresh conflict reads as a new problem
          // rather than as the decision awaiting the run that applies it.
          detail:
            row.synchronizationStatus === 'pending'
              ? 'The platform row is waiting to be overwritten — run a full synchronization to apply the source.'
              : `The row is marked "${row.synchronizationStatus}" rather than in sync.`,
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

  private async connectorFor(
    institutionId: string,
    sourceSystem: ReconciliationSourceSystem,
  ): Promise<{ connector: AnyConnector; connectorName: string }> {
    const { connectors } = await this.configuration.resolve(institutionId);
    const connectorName =
      sourceSystem === 'lms' ? connectors.learningSystem : connectors.academicSystem;

    if (!connectorName) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_CONFIGURED',
        sourceSystem === 'lms'
          ? 'This institution has no learning system connector configured'
          : 'This institution has no academic system connector configured',
        { sourceSystem },
      );
    }

    const connector =
      sourceSystem === 'lms'
        ? this.registry.learningSystem(connectorName)
        : this.registry.academicSystem(connectorName);

    if (!connector) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_INSTALLED',
        `No ${sourceSystem === 'lms' ? 'learning' : 'academic'} connector named "${connectorName}" is installed`,
        { connectorName, sourceSystem },
      );
    }

    return { connector, connectorName };
  }
}

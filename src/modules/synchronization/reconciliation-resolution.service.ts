import { Injectable } from '@nestjs/common';

import { InvalidInputError } from '../../common/errors/domain.error';
import type {
  DiscrepancyKind,
  ReconciliationAction,
  ReconciliationResolution,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { CanonicalRepositories } from './canonical.repositories';
import { ReconciliationResolutionRepository } from './reconciliation-resolution.repository';
import { ReconciliationService } from './reconciliation.service';
import { tableFor, type ReconciledDomain } from './reconciliation.types';
import type { SyncTarget } from './sync.types';

export interface ResolveDiscrepancyInput {
  readonly domain: ReconciledDomain;
  readonly kind: DiscrepancyKind;
  readonly action: ReconciliationAction;
  readonly canonicalId: string | null;
  readonly externalId: string | null;
}

export interface ResolutionOutcome {
  readonly resolution: ReconciliationResolution;
  /**
   * `accept_source` only clears the way for the next import; the incremental
   * watermark may not offer the record again, so a full run is what applies it.
   */
  readonly requiresFullSync: boolean;
}

interface CanonicalRowShape {
  readonly id: string;
  readonly sourceSystem: string;
  readonly externalId: string | null;
}

@Injectable()
export class ReconciliationResolutionService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly reconciliation: ReconciliationService,
    private readonly repositories: CanonicalRepositories,
    private readonly resolutions: ReconciliationResolutionRepository,
  ) {}

  listRecent(institutionId: string, limit: number): Promise<ReconciliationResolution[]> {
    return this.resolutions.findRecent(institutionId, limit);
  }

  async resolve(
    institutionId: string,
    resolvedById: string,
    input: ResolveDiscrepancyInput,
  ): Promise<ResolutionOutcome> {
    const target = await this.reconciliation.academicTarget(institutionId);

    if (input.kind === 'missing_in_platform') {
      throw new InvalidInputError(
        'RECONCILIATION_NOT_RESOLVABLE',
        'The platform holds no row for this record, so there is nothing to resolve. Run a full synchronization to take it in.',
        { kind: input.kind },
      );
    }

    const canonicalId = input.canonicalId;
    if (!canonicalId) {
      throw new InvalidInputError(
        'RECONCILIATION_ROW_REQUIRED',
        'Resolving this discrepancy needs the canonical row it concerns',
        { kind: input.kind },
      );
    }

    return this.txHost.run(async () => {
      const row = await this.loadRow(target, input.domain, canonicalId);
      const detail = await this.apply(input, row);

      const resolution = await this.resolutions.create({
        institutionId,
        sourceSystem: target.sourceSystem,
        connectorName: target.connectorName,
        domain: input.domain,
        kind: input.kind,
        action: input.action,
        externalId: row.externalId ?? input.externalId,
        canonicalId: row.id,
        detail,
        resolvedById,
      });

      return { resolution, requiresFullSync: input.action === 'accept_source' };
    });
  }

  private async loadRow(
    target: SyncTarget,
    domain: ReconciledDomain,
    canonicalId: string,
  ): Promise<CanonicalRowShape> {
    const found = (await this.repositories
      .of(tableFor(domain))
      .findByIdIn(target.institutionId, canonicalId, { consistent: true })) as
      CanonicalRowShape | undefined;

    if (!found) {
      throw new InvalidInputError(
        'RECONCILIATION_ROW_NOT_FOUND',
        'No live row with that identifier exists in this domain for this institution',
        { domain, canonicalId },
      );
    }

    if (found.sourceSystem !== target.sourceSystem) {
      throw new InvalidInputError(
        'RECONCILIATION_ROW_NOT_SOURCED',
        'That row is not owned by the academic source, so reconciliation has no say over it',
        { domain, canonicalId },
      );
    }

    return found;
  }

  private async apply(input: ResolveDiscrepancyInput, row: CanonicalRowShape): Promise<string> {
    const repository = this.repositories.of(tableFor(input.domain));

    if (input.action === 'keep_platform') {
      await repository.update(row.id, {
        sourceSystem: 'platform',
        externalId: null,
        sourceVersion: null,
        synchronizationStatus: 'in_sync',
        lastSynchronizedAt: null,
      } as never);

      return 'Kept the platform row and detached it from the source, so no import will match it again.';
    }

    if (input.kind === 'missing_in_source') {
      await repository.softDelete(row.id);

      return 'Accepted the source and removed the platform row it no longer offers.';
    }

    await repository.update(row.id, {
      synchronizationStatus: 'pending',
      sourceUpdatedAt: null,
      lastSynchronizedAt: null,
    } as never);

    return 'Accepted the source and marked the platform row pending, so the next import overwrites it.';
  }
}

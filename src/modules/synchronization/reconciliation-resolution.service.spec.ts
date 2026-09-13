import { describe, expect, it, vi } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';
import type { TransactionHost } from '../../database/transaction.host';

import type { CanonicalRepositories } from './canonical.repositories';
import type { ReconciliationResolutionRepository } from './reconciliation-resolution.repository';
import {
  ReconciliationResolutionService,
  type ResolveDiscrepancyInput,
} from './reconciliation-resolution.service';
import type { ReconciliationService } from './reconciliation.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const ACTOR = '22222222-2222-2222-2222-222222222222';
const ROW = '33333333-3333-3333-3333-333333333333';

function serviceWith(
  options: {
    row?: { id: string; sourceSystem: string; externalId: string | null } | null;
  } = {},
) {
  const row =
    options.row === undefined
      ? { id: ROW, sourceSystem: 'sis', externalId: 'C-1' }
      : options.row;
  const canonical = {
    findByIdIn: vi.fn().mockResolvedValue(row ?? undefined),
    update: vi.fn().mockResolvedValue({}),
    softDelete: vi.fn().mockResolvedValue({}),
  };
  const create = vi.fn().mockImplementation((values: object) => ({ id: 'r-1', ...values }));
  const findRecent = vi.fn().mockResolvedValue([]);

  return {
    canonical,
    create,
    findRecent,
    service: new ReconciliationResolutionService(
      { run: <T>(fn: (tx: unknown) => Promise<T>) => fn(undefined) } as TransactionHost,
      {
        academicTarget: vi.fn().mockResolvedValue({
          institutionId: INSTITUTION,
          sourceSystem: 'sis',
          connectorName: 'mock-sis',
        }),
      } as unknown as ReconciliationService,
      { of: vi.fn().mockReturnValue(canonical) } as unknown as CanonicalRepositories,
      { create, findRecent } as unknown as ReconciliationResolutionRepository,
    ),
  };
}

function input(overrides: Partial<ResolveDiscrepancyInput> = {}): ResolveDiscrepancyInput {
  return {
    domain: 'courses',
    kind: 'stale',
    action: 'accept_source',
    canonicalId: ROW,
    externalId: 'C-1',
    ...overrides,
  };
}

describe('ReconciliationResolutionService', () => {
  it('accepting the source on a stale row marks it pending so the next import overwrites it', async () => {
    const { service, canonical } = serviceWith({});

    const outcome = await service.resolve(INSTITUTION, ACTOR, input());

    expect(canonical.update).toHaveBeenCalledWith(ROW, {
      synchronizationStatus: 'pending',
      sourceUpdatedAt: null,
      lastSynchronizedAt: null,
    });
    expect(outcome.requiresFullSync).toBe(true);
  });

  it('accepting the source on a row the source dropped removes the platform row', async () => {
    const { service, canonical } = serviceWith({});

    await service.resolve(INSTITUTION, ACTOR, input({ kind: 'missing_in_source' }));

    expect(canonical.softDelete).toHaveBeenCalledWith(ROW);
    expect(canonical.update).not.toHaveBeenCalled();
  });

  it('keeping the platform row detaches it from the source so no import matches it again', async () => {
    const { service, canonical } = serviceWith({});

    const outcome = await service.resolve(
      INSTITUTION,
      ACTOR,
      input({ action: 'keep_platform', kind: 'conflict' }),
    );

    expect(canonical.update).toHaveBeenCalledWith(ROW, {
      sourceSystem: 'platform',
      externalId: null,
      sourceVersion: null,
      synchronizationStatus: 'in_sync',
      lastSynchronizedAt: null,
    });
    expect(canonical.softDelete).not.toHaveBeenCalled();
    expect(outcome.requiresFullSync).toBe(false);
  });

  it('records who resolved what, against the connector that reported it', async () => {
    const { service, create } = serviceWith({});

    await service.resolve(INSTITUTION, ACTOR, input());

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: INSTITUTION,
        sourceSystem: 'sis',
        connectorName: 'mock-sis',
        domain: 'courses',
        kind: 'stale',
        action: 'accept_source',
        externalId: 'C-1',
        canonicalId: ROW,
        resolvedById: ACTOR,
      }),
    );
  });

  it('refuses a record the platform never took in, because there is nothing to act on', async () => {
    const { service, canonical, create } = serviceWith({});

    await expect(
      service.resolve(INSTITUTION, ACTOR, input({ kind: 'missing_in_platform' })),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_NOT_RESOLVABLE' });
    expect(canonical.update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a resolution that names no canonical row', async () => {
    const { service } = serviceWith({});

    await expect(
      service.resolve(INSTITUTION, ACTOR, input({ canonicalId: null })),
    ).rejects.toMatchObject({ code: 'RECONCILIATION_ROW_REQUIRED' });
  });

  it('refuses a canonical row that is not in this institution', async () => {
    const { service, create } = serviceWith({ row: null });

    await expect(service.resolve(INSTITUTION, ACTOR, input())).rejects.toBeInstanceOf(
      InvalidInputError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a platform-authored row, which the source never claimed', async () => {
    const { service } = serviceWith({
      row: { id: ROW, sourceSystem: 'platform', externalId: null },
    });

    await expect(service.resolve(INSTITUTION, ACTOR, input())).rejects.toMatchObject({
      code: 'RECONCILIATION_ROW_NOT_SOURCED',
    });
  });

  it('falls back to the reported external id when the row carries none', async () => {
    const { service, create } = serviceWith({
      row: { id: ROW, sourceSystem: 'sis', externalId: null },
    });

    await service.resolve(INSTITUTION, ACTOR, input({ kind: 'conflict', externalId: 'C-9' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'C-9' }));
  });

  it('lists the most recent resolutions for the institution', async () => {
    const { service, findRecent } = serviceWith({});

    await service.listRecent(INSTITUTION, 10);

    expect(findRecent).toHaveBeenCalledWith(INSTITUTION, 10);
  });
});

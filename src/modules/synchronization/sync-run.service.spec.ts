import { describe, expect, it, vi } from 'vitest';

import type { SyncRun } from '../../database/schema';

import type { SyncDomainResultRepository } from './sync-domain-result.repository';
import type { SyncRunRepository } from './sync-run.repository';
import { SyncRunService } from './sync-run.service';
import type { SyncWatermarkRepository } from './sync-watermark.repository';
import { emptyCounts, type DomainOutcome } from './sync.types';

const RUN: SyncRun = {
  id: 'run-1',
  institutionId: 'institution-1',
  sourceSystem: 'sis',
  connectorName: 'mock-sis',
} as SyncRun;

const outcome = (overrides: Partial<DomainOutcome>): DomainOutcome => ({
  domain: 'courses',
  status: 'succeeded',
  watermark: new Date('2026-03-01T00:00:00.000Z'),
  durationMs: 5,
  errorMessage: null,
  ...emptyCounts(),
  ...overrides,
});

function serviceWith() {
  const runs = { create: vi.fn(), update: vi.fn().mockResolvedValue(RUN) };
  const domainResults = { record: vi.fn() };
  const watermarks = { record: vi.fn() };

  return {
    runs,
    domainResults,
    watermarks,
    service: new SyncRunService(
      runs as unknown as SyncRunRepository,
      domainResults as unknown as SyncDomainResultRepository,
      watermarks as unknown as SyncWatermarkRepository,
    ),
  };
}

describe('SyncRunService', () => {
  describe('recordDomain', () => {
    it('stores the domain result and moves the watermark forward', async () => {
      const { service, domainResults, watermarks } = serviceWith();

      await service.recordDomain(RUN, outcome({ created: 3, fetched: 3 }));

      expect(domainResults.record).toHaveBeenCalledWith(
        expect.objectContaining({ runId: 'run-1', domain: 'courses', created: 3 }),
      );
      expect(watermarks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'courses',
          sourceUpdatedAt: new Date('2026-03-01T00:00:00.000Z'),
          lastStatus: 'succeeded',
        }),
      );
    });

    it('leaves the watermark untouched for a domain the connector cannot serve', async () => {
      const { service, domainResults, watermarks } = serviceWith();

      await service.recordDomain(RUN, outcome({ status: 'skipped', watermark: null }));

      expect(domainResults.record).toHaveBeenCalledOnce();
      expect(watermarks.record).not.toHaveBeenCalled();
    });

    it('records a failure without claiming the domain ever succeeded', async () => {
      const { service, watermarks } = serviceWith();

      await service.recordDomain(
        RUN,
        outcome({ status: 'failed', failed: 2, errorMessage: 'boom' }),
      );

      const [values] = watermarks.record.mock.calls[0]!;
      expect(values).toMatchObject({ lastStatus: 'failed', lastErrorMessage: 'boom' });
      expect(values).not.toHaveProperty('lastSucceededAt');
    });
  });

  describe('finish', () => {
    it('sums the domain counters onto the run', async () => {
      const { service, runs } = serviceWith();

      await service.finish('run-1', [
        outcome({ fetched: 2, created: 2 }),
        outcome({ domain: 'enrollments', fetched: 3, updated: 3 }),
      ]);

      expect(runs.update).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: 'succeeded', fetched: 5, created: 2, updated: 3 }),
      );
    });

    it('is partial when some domains failed and others did not', async () => {
      const { service, runs } = serviceWith();

      await service.finish('run-1', [
        outcome({}),
        outcome({ domain: 'enrollments', status: 'failed' }),
      ]);

      expect(runs.update).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: 'partial' }),
      );
    });

    it('is failed when no attempted domain succeeded', async () => {
      const { service, runs } = serviceWith();

      await service.finish('run-1', [
        outcome({ status: 'failed' }),
        outcome({ domain: 'enrollments', status: 'skipped' }),
      ]);

      expect(runs.update).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('is succeeded when every domain the connector serves succeeded', async () => {
      const { service, runs } = serviceWith();

      await service.finish('run-1', [
        outcome({}),
        outcome({ domain: 'examTerms', status: 'skipped' }),
      ]);

      expect(runs.update).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: 'succeeded' }),
      );
    });
  });
});

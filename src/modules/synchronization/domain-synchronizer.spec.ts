import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { AcademicSystemConnector } from '../connectors/academic-system.connector';
import type { ConnectorQuery, ConnectorRecord } from '../connectors/connector.types';

import { DomainSynchronizer } from './domain-synchronizer';
import type { AcademicImporter } from './importers/academic.importer';
import type { SyncSession } from './sync-session';
import type { ApplyOutcome } from './sync.types';

const logger = {
  setContext: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
} as unknown as PinoLogger;

const record = (externalId: string, sourceUpdatedAt: string): ConnectorRecord<unknown> => ({
  externalId,
  sourceVersion: sourceUpdatedAt,
  sourceUpdatedAt: new Date(sourceUpdatedAt),
  deleted: false,
  data: {},
});

function importerWith(
  records: ConnectorRecord<unknown>[],
  apply: (record: ConnectorRecord<unknown>) => Promise<ApplyOutcome>,
): AcademicImporter & { queries: ConnectorQuery[] } {
  const queries: ConnectorQuery[] = [];

  return {
    domain: 'courses',
    capability: 'courses.read',
    queries,
    fetch: (_connector: AcademicSystemConnector, query: ConnectorQuery) => {
      queries.push(query);

      return Promise.resolve(records);
    },
    apply,
  };
}

const connector = {} as AcademicSystemConnector;
const session = {} as SyncSession;

describe('DomainSynchronizer', () => {
  const synchronizer = new DomainSynchronizer(logger);

  it('counts each record by what applying it did and advances the watermark', async () => {
    const outcomes: ApplyOutcome[] = ['created', 'updated', 'skipped'];
    const importer = importerWith(
      [
        record('a', '2026-01-01T00:00:00.000Z'),
        record('b', '2026-03-01T00:00:00.000Z'),
        record('c', '2026-02-01T00:00:00.000Z'),
      ],
      () => Promise.resolve(outcomes.shift() ?? 'skipped'),
    );

    const outcome = await synchronizer.run(importer, connector, session, null);

    expect(outcome).toMatchObject({
      domain: 'courses',
      status: 'succeeded',
      fetched: 3,
      created: 1,
      updated: 1,
      skipped: 1,
      failed: 0,
    });
    expect(outcome.watermark).toEqual(new Date('2026-03-01T00:00:00.000Z'));
  });

  it('asks the connector only for what changed since the stored watermark', async () => {
    const changedSince = new Date('2026-02-01T00:00:00.000Z');
    const importer = importerWith([], () => Promise.resolve('skipped'));

    await synchronizer.run(importer, connector, session, changedSince);

    expect(importer.queries).toEqual([{ changedSince }]);
  });

  it('holds the watermark back when a record failed, so it is offered again', async () => {
    const importer = importerWith(
      [record('a', '2026-01-01T00:00:00.000Z'), record('b', '2026-03-01T00:00:00.000Z')],
      (candidate) =>
        candidate.externalId === 'b'
          ? Promise.reject(new Error('unresolved reference'))
          : Promise.resolve('created'),
    );
    const changedSince = new Date('2025-12-01T00:00:00.000Z');

    const outcome = await synchronizer.run(importer, connector, session, changedSince);

    expect(outcome.status).toBe('partial');
    expect(outcome.failed).toBe(1);
    expect(outcome.watermark).toEqual(changedSince);
    expect(outcome.errorMessage).toBe('unresolved reference');
  });

  it('reports a domain where nothing applied at all as failed', async () => {
    const importer = importerWith([record('a', '2026-01-01T00:00:00.000Z')], () =>
      Promise.reject(new Error('boom')),
    );

    const outcome = await synchronizer.run(importer, connector, session, null);

    expect(outcome.status).toBe('failed');
    expect(outcome.created + outcome.updated + outcome.deleted).toBe(0);
  });

  it('turns an unreachable connector into a failed domain rather than an exception', async () => {
    const importer: AcademicImporter = {
      domain: 'courses',
      capability: 'courses.read',
      fetch: () => Promise.reject(new Error('connection refused')),
      apply: () => Promise.resolve('created'),
    };

    const outcome = await synchronizer.run(importer, connector, session, null);

    expect(outcome).toMatchObject({
      status: 'failed',
      fetched: 0,
      errorMessage: 'connection refused',
    });
  });
});

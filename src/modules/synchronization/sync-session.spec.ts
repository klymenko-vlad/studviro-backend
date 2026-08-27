import { describe, expect, it, vi } from 'vitest';

import type { ConnectorRecord } from '../connectors/connector.types';
import type { ExternalIdentitiesRepository } from '../identity/external-identities.repository';

import type { CanonicalRepositories } from './canonical.repositories';
import { SyncSession, UnresolvedReferenceError } from './sync-session';
import type { SyncTarget } from './sync.types';

const TARGET: SyncTarget = {
  institutionId: 'institution-1',
  sourceSystem: 'sis',
  connectorName: 'mock-sis',
};

const record = (
  overrides: Partial<ConnectorRecord<unknown>> = {},
): ConnectorRecord<unknown> => ({
  externalId: 'course-1',
  sourceVersion: '1',
  sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
  deleted: false,
  data: {},
  ...overrides,
});

function sessionWith(repository: Record<string, unknown>, identity?: { userId: string }) {
  const repositories = { of: vi.fn().mockReturnValue(repository) };
  const identities = { findBySubject: vi.fn().mockResolvedValue(identity) };

  return {
    repositories,
    identities,
    session: new SyncSession(
      TARGET,
      repositories as unknown as CanonicalRepositories,
      identities as unknown as ExternalIdentitiesRepository,
      new Date('2026-06-01T00:00:00.000Z'),
    ),
  };
}

describe('SyncSession', () => {
  it('maps a record and remembers the row it wrote, so later domains need no query', async () => {
    const repository = {
      applyRecord: vi.fn().mockResolvedValue({ id: 'course-row', outcome: 'created' }),
      findIdByExternalId: vi.fn(),
    };
    const { session } = sessionWith(repository);

    await session.apply('courses', record(), () => Promise.resolve({ code: 'INF1' } as never));

    await expect(session.reference('courses', 'course-1')).resolves.toBe('course-row');
    expect(repository.findIdByExternalId).not.toHaveBeenCalled();
  });

  it('does not map a tombstone, because its references may already be gone', async () => {
    const repository = {
      applyRecord: vi.fn().mockResolvedValue({ id: 'course-row', outcome: 'deleted' }),
      findIdByExternalId: vi.fn(),
    };
    const { session } = sessionWith(repository);
    const map = vi.fn();

    const outcome = await session.apply('courses', record({ deleted: true }), map);

    expect(outcome).toBe('deleted');
    expect(map).not.toHaveBeenCalled();
    await expect(session.reference('courses', 'course-1')).resolves.toBeNull();
  });

  it('looks a reference up once and caches the answer', async () => {
    const repository = { findIdByExternalId: vi.fn().mockResolvedValue('term-row') };
    const { session } = sessionWith(repository);

    await session.reference('academicTerms', 'term-1');
    await session.reference('academicTerms', 'term-1');

    expect(repository.findIdByExternalId).toHaveBeenCalledOnce();
  });

  it('refuses to write a row whose required reference was never synchronized', async () => {
    const repository = { findIdByExternalId: vi.fn().mockResolvedValue(null) };
    const { session } = sessionWith(repository);

    await expect(session.requireReference('courses', 'missing')).rejects.toBeInstanceOf(
      UnresolvedReferenceError,
    );
  });

  it('resolves a person through the external identity the connector issued', async () => {
    const { session, identities } = sessionWith({}, { userId: 'user-1' });

    await expect(session.user('person-1')).resolves.toBe('user-1');
    expect(identities.findBySubject).toHaveBeenCalledWith(
      'institution-1',
      'mock-sis',
      'person-1',
    );
  });

  it('fails a record that names a person no identity points at', async () => {
    const { session } = sessionWith({});

    await expect(session.requireUser('person-1')).rejects.toBeInstanceOf(
      UnresolvedReferenceError,
    );
  });
});

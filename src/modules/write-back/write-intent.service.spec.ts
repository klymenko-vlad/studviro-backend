import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceWriteIntent } from '../../database/schema';

import type { WriteIntentRepository } from './write-intent.repository';
import { WriteIntentService } from './write-intent.service';
import type { EnqueueWriteIntent } from './write-intent.types';

const intent = (overrides: Partial<SourceWriteIntent> = {}): SourceWriteIntent =>
  ({
    id: 'intent-1',
    institutionId: 'institution-1',
    canonicalId: 'registration-1',
    state: 'pending',
    attempts: 0,
    ...overrides,
  }) as SourceWriteIntent;

const input = (overrides: Partial<EnqueueWriteIntent> = {}): EnqueueWriteIntent => ({
  institutionId: 'institution-1',
  targetSourceSystem: 'sis',
  connectorName: 'mock-sis',
  kind: 'exam_registration.create',
  canonicalTable: 'exam_registrations',
  canonicalId: 'registration-1',
  payload: {},
  actorId: 'student-1',
  ...overrides,
});

describe('WriteIntentService', () => {
  const findQueuedFor = vi.fn();
  const softDelete = vi.fn();
  const create = vi.fn();

  const repository = { findQueuedFor, softDelete, create } as unknown as WriteIntentRepository;
  let service: WriteIntentService;

  beforeEach(() => {
    vi.clearAllMocks();
    findQueuedFor.mockResolvedValue(undefined);
    create.mockResolvedValue(intent());
    service = new WriteIntentService(repository);
  });

  it('queues an intent when the canonical row has none in flight', async () => {
    await expect(service.enqueue(input())).resolves.toEqual({
      kind: 'queued',
      intentId: 'intent-1',
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ state: 'pending' }));
  });

  it('collapses a second act against a still-queued first one, and queues nothing', async () => {
    findQueuedFor.mockResolvedValue(intent({ id: 'intent-0' }));

    await expect(service.enqueue(input({ kind: 'exam_registration.cancel' }))).resolves.toEqual(
      { kind: 'collapsed' },
    );
    expect(softDelete).toHaveBeenCalledWith('intent-0');
    expect(create).not.toHaveBeenCalled();
  });

  it('claims an intent by moving it in flight and counting the attempt', async () => {
    const update = vi.fn().mockResolvedValue(intent({ state: 'in_flight' }));
    service = new WriteIntentService({
      findQueuedFor,
      update,
    } as unknown as WriteIntentRepository);

    await service.claim(intent({ attempts: 2 }));

    expect(update).toHaveBeenCalledWith('intent-1', {
      state: 'in_flight',
      attempts: 3,
      nextAttemptAt: null,
    });
  });
});

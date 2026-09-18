import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExamRegistration } from '../../database/schema';
import type { QueueProducer } from '../../queue/queue.producer';

import { ExamRegistrationWriteBackService } from './exam-registration-write-back.service';
import type { ExamRegistrationWriteRepository } from './exam-registration-write.repository';
import type { WriteIntentService } from './write-intent.service';
import type { WriteTargetService } from './write-target.service';

const registration = {
  id: 'registration-1',
  institutionId: 'institution-1',
} as ExamRegistration;

describe('ExamRegistrationWriteBackService', () => {
  const academic = vi.fn();
  const findContext = vi.fn();
  const markPending = vi.fn();
  const enqueue = vi.fn();
  const enqueueSynchronization = vi.fn();

  const build = () =>
    new ExamRegistrationWriteBackService(
      { enqueue } as unknown as WriteIntentService,
      { findContext, markPending } as unknown as ExamRegistrationWriteRepository,
      { academic } as unknown as WriteTargetService,
      { enqueueSynchronization } as unknown as QueueProducer,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    academic.mockResolvedValue({ connectorName: 'mock-sis', connector: {} });
    findContext.mockResolvedValue({
      registrationId: 'registration-1',
      registrationExternalId: null,
      examTermExternalId: 'EXT-OFF-1-regular',
      personExternalId: 'PER-1',
    });
    enqueue.mockResolvedValue({ kind: 'queued', intentId: 'intent-1' });
  });

  it('queues the write and marks the registration pending until it lands', async () => {
    await expect(build().enqueueCreate(registration, 'student-1')).resolves.toEqual({
      kind: 'queued',
      intentId: 'intent-1',
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'exam_registration.create',
        canonicalTable: 'exam_registrations',
        canonicalId: 'registration-1',
        payload: {
          examTermExternalId: 'EXT-OFF-1-regular',
          personExternalId: 'PER-1',
          registrationExternalId: null,
        },
      }),
    );
    expect(markPending).toHaveBeenCalledWith('registration-1');
  });

  it('queues nothing when the connector does not declare the write capability', async () => {
    academic.mockResolvedValue(null);

    await expect(build().enqueueCreate(registration, 'student-1')).resolves.toEqual({
      kind: 'not_writable',
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(markPending).not.toHaveBeenCalled();
  });

  it('queues nothing when the exam term was never imported from the source', async () => {
    findContext.mockResolvedValue({
      registrationId: 'registration-1',
      registrationExternalId: null,
      examTermExternalId: null,
      personExternalId: 'PER-1',
    });

    await expect(build().enqueueCreate(registration, 'student-1')).resolves.toEqual({
      kind: 'not_writable',
    });
  });

  it('queues nothing when the student has no identity in the source', async () => {
    findContext.mockResolvedValue({
      registrationId: 'registration-1',
      registrationExternalId: null,
      examTermExternalId: 'EXT-OFF-1-regular',
      personExternalId: null,
    });

    await expect(build().enqueueCancel(registration, 'student-1')).resolves.toEqual({
      kind: 'not_writable',
    });
  });

  it('wakes the worker only for an intent that was actually queued', async () => {
    const service = build();

    await service.publish('institution-1', { kind: 'queued', intentId: 'intent-1' });
    await service.publish('institution-1', { kind: 'collapsed' });
    await service.publish('institution-1', { kind: 'not_writable' });

    expect(enqueueSynchronization).toHaveBeenCalledExactlyOnceWith('writeBack', {
      institutionId: 'institution-1',
      intentId: 'intent-1',
    });
  });
});

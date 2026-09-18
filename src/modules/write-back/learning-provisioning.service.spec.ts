import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueueProducer } from '../../queue/queue.producer';

import type { LearningProvisioningRepository } from './learning-provisioning.repository';
import { LearningProvisioningService } from './learning-provisioning.service';
import type { WriteIntentService } from './write-intent.service';
import type { WriteTargetService } from './write-target.service';

describe('LearningProvisioningService', () => {
  const findOfferingsNeedingSpace = vi.fn();
  const findEnrollmentsNeedingProvisioning = vi.fn();
  const enqueue = vi.fn();
  const learning = vi.fn();
  const enqueueSynchronization = vi.fn();

  const logger = { setContext: vi.fn(), info: vi.fn() } as unknown as PinoLogger;

  let service: LearningProvisioningService;
  let nextIntent = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    nextIntent = 0;
    findOfferingsNeedingSpace.mockResolvedValue([]);
    findEnrollmentsNeedingProvisioning.mockResolvedValue([]);
    learning.mockResolvedValue({ connectorName: 'mock-lms', connector: {} });
    enqueue.mockImplementation(() =>
      Promise.resolve({ kind: 'queued', intentId: `intent-${++nextIntent}` }),
    );

    service = new LearningProvisioningService(
      {
        findOfferingsNeedingSpace,
        findEnrollmentsNeedingProvisioning,
      } as unknown as LearningProvisioningRepository,
      { enqueue } as unknown as WriteIntentService,
      { learning } as unknown as WriteTargetService,
      { enqueueSynchronization } as unknown as QueueProducer,
      logger,
    );
  });

  it('queues nothing when the LMS already knows everything', async () => {
    await expect(service.enqueuePending('institution-1')).resolves.toEqual({
      spaces: 0,
      enrollments: 0,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues a space for an offering the LMS has none for', async () => {
    findOfferingsNeedingSpace.mockResolvedValue([
      {
        offeringId: 'offering-1',
        externalId: 'OFF-1',
        code: 'INF/ALG/22',
        title: 'Algorithms',
      },
    ]);

    await expect(service.enqueuePending('institution-1')).resolves.toMatchObject({
      spaces: 1,
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'learning_space.provision',
        targetSourceSystem: 'lms',
        canonicalTable: 'course_offerings',
        canonicalId: 'offering-1',
        payload: {
          courseOfferingExternalId: 'OFF-1',
          code: 'INF/ALG/22',
          name: 'Algorithms',
        },
      }),
    );
  });

  it('queues an enrolment the LMS has never been told about', async () => {
    findEnrollmentsNeedingProvisioning.mockResolvedValue([
      {
        enrollmentId: 'enrollment-1',
        courseExternalId: 'LMS-OFF-1',
        personExternalId: 'PER-1',
      },
    ]);

    await expect(service.enqueuePending('institution-1')).resolves.toMatchObject({
      enrollments: 1,
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'learning_enrollment.upsert',
        canonicalTable: 'enrollments',
        canonicalId: 'enrollment-1',
      }),
    );
  });

  it('wakes the worker once per intent it actually queued', async () => {
    findOfferingsNeedingSpace.mockResolvedValue([
      { offeringId: 'offering-1', externalId: 'OFF-1', code: 'A', title: 'A' },
      { offeringId: 'offering-2', externalId: 'OFF-2', code: 'B', title: 'B' },
    ]);

    await service.enqueuePending('institution-1');

    expect(enqueueSynchronization).toHaveBeenCalledTimes(2);
  });

  it('counts a collapsed intent as not queued and does not wake the worker for it', async () => {
    findOfferingsNeedingSpace.mockResolvedValue([
      { offeringId: 'offering-1', externalId: 'OFF-1', code: 'A', title: 'A' },
    ]);
    enqueue.mockResolvedValue({ kind: 'collapsed' });

    await expect(service.enqueuePending('institution-1')).resolves.toMatchObject({
      spaces: 0,
    });
    expect(enqueueSynchronization).not.toHaveBeenCalled();
  });

  it('queues nothing where the connector cannot provision', async () => {
    learning.mockResolvedValue(null);
    findOfferingsNeedingSpace.mockResolvedValue([
      { offeringId: 'offering-1', externalId: 'OFF-1', code: 'A', title: 'A' },
    ]);

    await expect(service.enqueuePending('institution-1')).resolves.toEqual({
      spaces: 0,
      enrollments: 0,
    });
    expect(findOfferingsNeedingSpace).not.toHaveBeenCalled();
  });
});

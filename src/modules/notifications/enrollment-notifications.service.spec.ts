import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Enrollment } from '../../database/schema';

import { EnrollmentNotificationsService } from './enrollment-notifications.service';
import type { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

const INSTITUTION = 'institution-1';
const NOW = new Date('2026-02-01T00:00:00.000Z');

const enrollment = (status: Enrollment['status']) =>
  ({
    id: 'enrollment-1',
    userId: 'student-1',
    courseOfferingId: 'offering-1',
    status,
  }) as Enrollment;

describe('EnrollmentNotificationsService', () => {
  const emit = vi.fn();
  let service: EnrollmentNotificationsService;

  const apply = (change: Partial<NotificationChange<Enrollment>>) =>
    service.applied(INSTITUTION, change as NotificationChange<Enrollment>, NOW);

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EnrollmentNotificationsService({
      emit,
    } as unknown as NotificationEmitterService);
  });

  it('tells the student their place is confirmed', async () => {
    await apply({
      previous: enrollment('requested'),
      current: enrollment('active'),
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'enrollment_confirmed', recipients: ['student-1'] }),
    );
  });

  it('tells the student their request was refused', async () => {
    await apply({
      previous: enrollment('requested'),
      current: enrollment('rejected'),
    });

    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'enrollment_rejected' }));
  });

  it('tells the student they were withdrawn from the course', async () => {
    await apply({
      previous: enrollment('active'),
      current: enrollment('withdrawn'),
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'enrollment_withdrawn',
        courseOfferingId: 'offering-1',
        recipients: ['student-1'],
      }),
    );
  });

  it('says nothing when the outcome has not moved', async () => {
    await apply({
      previous: enrollment('active'),
      current: enrollment('active'),
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a status that is not an outcome', async () => {
    await apply({ previous: null, current: enrollment('provisioning') });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a row that was removed', async () => {
    await apply({ removed: true, previous: enrollment('active'), current: null });

    expect(emit).not.toHaveBeenCalled();
  });
});

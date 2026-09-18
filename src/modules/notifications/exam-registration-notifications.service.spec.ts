import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExamRegistration } from '../../database/schema';

import { ExamRegistrationNotificationsService } from './exam-registration-notifications.service';
import type { NotificationEmitterService } from './notification-emitter.service';

const registration = {
  id: 'registration-1',
  institutionId: 'institution-1',
  examTermId: 'exam-1',
  userId: 'student-1',
} as ExamRegistration;

const NOW = new Date('2026-05-20T09:00:00.000Z');

describe('ExamRegistrationNotificationsService', () => {
  const emit = vi.fn();
  let service: ExamRegistrationNotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ExamRegistrationNotificationsService({
      emit,
    } as unknown as NotificationEmitterService);
  });

  it('confirms the student’s own registration to the student alone', async () => {
    await service.confirmed(registration, NOW);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'exam_registration_confirmed',
        recipients: ['student-1'],
        examTermId: 'exam-1',
      }),
    );
  });

  it('confirms a cancellation the student made themselves', async () => {
    await service.cancelled(registration, NOW);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exam_registration_cancelled' }),
    );
  });

  it('says why the university refused, rather than reversing the act in silence', async () => {
    await service.refused(
      registration,
      'A retake seat is assigned by the study department',
      NOW,
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'exam_registration_refused',
        payload: { reason: 'A retake seat is assigned by the study department' },
      }),
    );
  });

  it('is a platform event, not one the source system authored', async () => {
    await service.confirmed(registration, NOW);

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ sourceSystem: 'platform' }),
      }),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearningActivity } from '../../database/schema';

import type { LearningActivityAudienceRepository } from './learning-activity-audience.repository';
import {
  LearningActivityNotificationsService,
  type SubmissionMark,
} from './learning-activity-notifications.service';
import type { NotificationEmitterService } from './notification-emitter.service';
import type { NotificationChange } from './notification-emitter.types';

const INSTITUTION = 'institution-1';

const activity = (overrides: Partial<LearningActivity> = {}): LearningActivity =>
  ({
    id: 'activity-1',
    institutionId: 'institution-1',
    learningSpaceId: 'space-1',
    type: 'assignment',
    name: 'Assignment 1',
    dueAt: new Date('2026-11-05T21:00:00.000Z'),
    visible: true,
    ...overrides,
  }) as LearningActivity;

const change = (
  overrides: Partial<NotificationChange<LearningActivity>>,
): NotificationChange<LearningActivity> => ({
  previous: activity(),
  current: activity(),
  ...overrides,
});

describe(LearningActivityNotificationsService.name, () => {
  const emit = vi.fn();
  const findOfferingOfSpace = vi.fn();
  const emitter = { emit } as unknown as NotificationEmitterService;
  const audience = {
    findOfferingOfSpace,
  } as unknown as LearningActivityAudienceRepository;

  let service: LearningActivityNotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    emit.mockResolvedValue(1);
    findOfferingOfSpace.mockResolvedValue('offering-1');
    service = new LearningActivityNotificationsService(emitter, audience);
  });

  const AT = new Date('2026-10-20T09:00:00.000Z');
  const announced = (overrides: Partial<LearningActivity> = {}) =>
    activity({ announcedAt: new Date('2026-10-01T09:00:00.000Z'), ...overrides });

  const rescheduled = (overrides: Partial<NotificationChange<LearningActivity>>) =>
    service.rescheduled(INSTITUTION, change(overrides), AT);

  describe('publishing', () => {
    it('announces a deadline against the offering its space belongs to', async () => {
      await service.published(INSTITUTION, activity(), AT);

      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assignment_due_published',
          subjectId: 'activity-1',
          courseOfferingId: 'offering-1',
          learningActivityId: 'activity-1',
          payload: expect.objectContaining({
            dueAt: '2026-11-05T21:00:00.000Z',
            activityName: 'Assignment 1',
            activityType: 'assignment',
          }),
        }),
      );
    });

    it('says nothing about an activity that carries no deadline', async () => {
      await service.published(INSTITUTION, activity({ dueAt: null }), AT);

      expect(emit).not.toHaveBeenCalled();
    });

    it('says nothing when the learning space is matched to no course offering', async () => {
      findOfferingOfSpace.mockResolvedValue(null);

      await service.published(INSTITUTION, activity(), AT);

      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('rescheduling', () => {
    it('reports a moved deadline with the date it moved from', async () => {
      await rescheduled({
        previous: announced(),
        current: announced({ dueAt: new Date('2026-11-12T21:00:00.000Z') }),
      });

      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assignment_due_rescheduled',
          payload: expect.objectContaining({
            dueAt: '2026-11-12T21:00:00.000Z',
            previousDueAt: '2026-11-05T21:00:00.000Z',
          }),
        }),
      );
    });

    it('says nothing about a deadline nobody was told of', async () => {
      await rescheduled({
        previous: activity({ announcedAt: null }),
        current: activity({ announcedAt: null, dueAt: new Date('2026-11-12T21:00:00.000Z') }),
      });

      expect(emit).not.toHaveBeenCalled();
    });

    it('says nothing when a deadline is unchanged', async () => {
      await rescheduled({ previous: announced(), current: announced() });

      expect(emit).not.toHaveBeenCalled();
    });

    it('says nothing when a deadline is added or taken away', async () => {
      await rescheduled({ previous: announced({ dueAt: null }), current: announced() });
      await rescheduled({ previous: announced(), current: announced({ dueAt: null }) });

      expect(emit).not.toHaveBeenCalled();
    });

    it('says nothing about a newly created, removed or hidden activity', async () => {
      await rescheduled({ previous: null, current: announced() });
      await rescheduled({ removed: true, previous: announced(), current: null });
      await rescheduled({
        previous: announced(),
        current: announced({ visible: false, dueAt: new Date('2026-11-12T21:00:00.000Z') }),
      });

      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('a mark', () => {
    const mark: SubmissionMark = {
      submissionId: 'submission-1',
      learningActivityId: 'activity-1',
      learningSpaceId: 'space-1',
      activityName: 'Assignment 1',
      recipientId: 'student-1',
      points: 17.5,
      maxPoints: 20,
    };

    const marked = (overrides: Partial<SubmissionMark> = {}) =>
      service.marked(
        INSTITUTION,
        { ...mark, ...overrides },
        new Date('2026-10-20T09:00:00.000Z'),
      );

    it('reaches the one person whose work it is, with the points out of the total', async () => {
      await marked();

      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'submission_marked',
          subjectId: 'submission-1',
          courseOfferingId: 'offering-1',
          learningActivityId: 'activity-1',
          recipients: ['student-1'],
          payload: { activityName: 'Assignment 1', grade: '17.5 / 20' },
        }),
      );
    });

    it('gives the points alone when the assignment is worth no fixed total', async () => {
      await marked({ maxPoints: null });

      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ grade: '17.5' }) }),
      );
    });

    it('says nothing when work is returned without a mark', async () => {
      await marked({ points: null });

      expect(emit).not.toHaveBeenCalled();
    });
  });
});

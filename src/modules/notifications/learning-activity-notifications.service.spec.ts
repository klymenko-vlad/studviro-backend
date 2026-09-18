import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearningActivity } from '../../database/schema';

import type { LearningActivityAudienceRepository } from './learning-activity-audience.repository';
import { LearningActivityNotificationsService } from './learning-activity-notifications.service';
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

  const applied = (overrides: Partial<NotificationChange<LearningActivity>>) =>
    service.applied(INSTITUTION, change(overrides), new Date('2026-10-20T09:00:00.000Z'));

  it('announces a newly imported deadline against the offering its space belongs to', async () => {
    await applied({ previous: null, current: activity() });

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

  it('reports a moved deadline with the date it moved from', async () => {
    await applied({
      previous: activity(),
      current: activity({ dueAt: new Date('2026-11-12T21:00:00.000Z') }),
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

  it('announces an activity that gains a deadline it did not have', async () => {
    await applied({ previous: activity({ dueAt: null }), current: activity() });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'assignment_due_published' }),
    );
  });

  it('says nothing about an activity that carries no deadline', async () => {
    await applied({
      previous: null,
      current: activity({ dueAt: null, type: 'resource' }),
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing when a deadline is unchanged', async () => {
    await applied({ previous: activity(), current: activity() });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a hidden activity students cannot see', async () => {
    await applied({
      previous: null,
      current: activity({ visible: false }),
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a change with nothing on either side', async () => {
    await applied({ previous: activity(), current: null });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a tombstoned activity', async () => {
    await applied({ removed: true, previous: activity(), current: null });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing when the learning space is matched to no course offering', async () => {
    findOfferingOfSpace.mockResolvedValue(null);

    await applied({ previous: null, current: activity() });

    expect(emit).not.toHaveBeenCalled();
  });
});

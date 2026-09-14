import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LearningActivity } from '../../database/schema';
import type { AppliedChange, SyncTarget } from '../synchronization/sync.types';

import type { LearningActivityAudienceRepository } from './learning-activity-audience.repository';
import { LearningActivityNotificationsService } from './learning-activity-notifications.service';
import type { NotificationEmitterService } from './notification-emitter.service';

const TARGET: SyncTarget = {
  institutionId: 'institution-1',
  sourceSystem: 'lms',
  connectorName: 'mock-lms',
};

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
  overrides: Partial<AppliedChange<LearningActivity>>,
): AppliedChange<LearningActivity> => ({
  outcome: 'updated',
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

  const applied = (overrides: Partial<AppliedChange<LearningActivity>>) =>
    service.applied(TARGET, change(overrides), new Date('2026-10-20T09:00:00.000Z'));

  it('announces a newly imported deadline against the offering its space belongs to', async () => {
    await applied({ outcome: 'created', previous: null, current: activity() });

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
      outcome: 'created',
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
      outcome: 'created',
      previous: null,
      current: activity({ visible: false }),
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing when the record was skipped by the stale-write guard', async () => {
    await applied({ outcome: 'skipped', previous: activity(), current: null });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing about a tombstoned activity', async () => {
    await applied({ outcome: 'deleted', previous: activity(), current: null });

    expect(emit).not.toHaveBeenCalled();
  });

  it('says nothing when the learning space is matched to no course offering', async () => {
    findOfferingOfSpace.mockResolvedValue(null);

    await applied({ outcome: 'created', previous: null, current: activity() });

    expect(emit).not.toHaveBeenCalled();
  });
});

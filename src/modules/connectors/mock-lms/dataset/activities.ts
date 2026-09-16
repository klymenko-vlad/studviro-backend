import type { LearningActivityType } from '../../../../database/schema';
import type { ConnectorRecord } from '../../connector.types';
import type { LmsActivity } from '../../learning-system.records';
import { addDays, addHours, atUtcHour } from '../../mock-sis/calendar';
import { record } from '../../mock-sis/dataset/record';
import { createRandom, seedFrom } from '../../mock-sis/deterministic-random';
import type { MockLmsOptions } from '../mock-lms.options';

import type { SpaceContext } from './spaces';

const ROTATION = ['resource', 'assignment', 'quiz', 'forum', 'workshop'] as const;

const TITLES: Readonly<Record<LearningActivityType, string>> = {
  resource: 'Lecture notes',
  assignment: 'Assignment',
  quiz: 'Quiz',
  forum: 'Discussion forum',
  workshop: 'Peer review',
  other: 'Activity',
};

const DEADLINE_HOUR = 21;
const OPENS_DAYS_BEFORE_DUE = 7;

function typeAt(position: number): LearningActivityType {
  return ROTATION[position % ROTATION.length] ?? 'other';
}

export function isAssessable(type: LearningActivityType): boolean {
  return type === 'assignment' || type === 'quiz' || type === 'workshop';
}

/** The day teaching began, `weeksElapsed` behind the anchor. */
export function teachingStart(options: MockLmsOptions): Date {
  return addDays(options.anchor, -options.weeksElapsed * 7);
}

export interface ActivityContext {
  readonly externalId: string;
  readonly space: SpaceContext;
  readonly type: LearningActivityType;
  readonly position: number;
  readonly title: string;
  readonly dueAt: Date | null;
}

export function planActivities(
  spaces: readonly SpaceContext[],
  options: MockLmsOptions,
): ActivityContext[] {
  const start = teachingStart(options);

  return spaces.flatMap((space) => {
    const random = createRandom(seedFrom(space.externalId));
    const weekStep = Math.max(
      1,
      Math.floor(options.teachingWeeks / options.activitiesPerSpace),
    );

    return Array.from({ length: options.activitiesPerSpace }, (_, position) => {
      const type = typeAt(space.index + position);

      return {
        externalId: `${space.externalId}-A${position + 1}`,
        space,
        type,
        position,
        title: `${TITLES[type]} ${position + 1}`,
        dueAt: isAssessable(type)
          ? atUtcHour(
              addDays(start, (position + 1) * weekStep * 7 + random.int(0, 3)),
              DEADLINE_HOUR,
            )
          : null,
      };
    });
  });
}

export function learningActivityRecords(
  activities: readonly ActivityContext[],
  options: MockLmsOptions,
): ConnectorRecord<LmsActivity>[] {
  return activities.map((activity) => {
    const { space, position, dueAt } = activity;

    return record<LmsActivity>(
      activity.externalId,
      addHours(options.anchor, space.index + position),
      {
        courseExternalId: space.externalId,
        type: activity.type,
        title: activity.title,
        url: `${options.baseUrl}/mod/${activity.type}/view.php?idnumber=${activity.externalId}`,
        opensAt: dueAt ? addDays(dueAt, -OPENS_DAYS_BEFORE_DUE) : null,
        dueAt,
      },
    );
  });
}

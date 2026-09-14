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

function isDated(type: LearningActivityType): boolean {
  return type === 'assignment' || type === 'quiz' || type === 'workshop';
}

export function learningActivityRecords(
  spaces: readonly SpaceContext[],
  options: MockLmsOptions,
): ConnectorRecord<LmsActivity>[] {
  return spaces.flatMap((space) => {
    const random = createRandom(seedFrom(space.externalId));
    const weekStep = Math.max(
      1,
      Math.floor(options.teachingWeeks / options.activitiesPerSpace),
    );

    return Array.from({ length: options.activitiesPerSpace }, (_, position) => {
      const type = typeAt(space.index + position);
      const dueAt = isDated(type)
        ? atUtcHour(
            addDays(options.anchor, (position + 1) * weekStep * 7 + random.int(0, 3)),
            DEADLINE_HOUR,
          )
        : null;

      return record<LmsActivity>(
        `${space.externalId}-A${position + 1}`,
        addHours(options.anchor, space.index + position),
        {
          courseExternalId: space.externalId,
          type,
          title: `${TITLES[type]} ${position + 1}`,
          url: `${options.baseUrl}/mod/${type}/view.php?idnumber=${space.externalId}-A${position + 1}`,
          opensAt: dueAt ? addDays(dueAt, -OPENS_DAYS_BEFORE_DUE) : null,
          dueAt,
        },
      );
    });
  });
}

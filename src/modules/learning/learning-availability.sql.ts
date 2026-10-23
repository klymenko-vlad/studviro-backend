import { and, eq, gt, isNull, lte, or, type SQL } from 'drizzle-orm';

import { learningSections } from '../../database/schema';
import type { learningActivities, learningMaterials } from '../../database/schema';

type Windowed = typeof learningActivities | typeof learningMaterials | typeof learningSections;

export function openAt(table: Windowed, now: Date): SQL | undefined {
  return and(
    or(isNull(table.availableFrom), lte(table.availableFrom, now)),
    or(isNull(table.availableUntil), gt(table.availableUntil, now)),
  );
}

export function joinedSectionOpenAt(now: Date): SQL | undefined {
  return or(
    isNull(learningSections.id),
    and(eq(learningSections.visible, true), openAt(learningSections, now)),
  );
}

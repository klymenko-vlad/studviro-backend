import { InvalidInputError } from '../../common/errors/domain.error';

export const MAX_PLANNER_RANGE_DAYS = 92;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlannerRange {
  readonly from: Date;
  readonly to: Date;
}

export function assertPlannerRange({ from, to }: PlannerRange): void {
  const span = to.getTime() - from.getTime();

  if (span <= 0) {
    throw new InvalidInputError(
      'PLANNER_RANGE_INVALID',
      'The end of the range must come after its start',
    );
  }

  if (span > MAX_PLANNER_RANGE_DAYS * DAY_MS) {
    throw new InvalidInputError(
      'PLANNER_RANGE_TOO_LONG',
      `A planner range may cover at most ${MAX_PLANNER_RANGE_DAYS} days`,
      { maxDays: MAX_PLANNER_RANGE_DAYS },
    );
  }
}

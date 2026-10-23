import { InvalidInputError } from '../../common/errors/domain.error';

export const AVAILABILITY_STATES = ['open', 'scheduled', 'ended'] as const;
export type Availability = (typeof AVAILABILITY_STATES)[number];

export type Sight = 'full' | 'title' | 'none';

export interface AvailabilityWindow {
  readonly availableFrom?: Date | null;
  readonly availableUntil?: Date | null;
}

export interface Schedulable {
  readonly visible: boolean;
  readonly availableFrom: Date | null;
  readonly availableUntil: Date | null;
  readonly hiddenUntilAvailable: boolean;
}

export function availabilityAt(window: AvailabilityWindow, now: Date): Availability {
  if (window.availableFrom && now.getTime() < window.availableFrom.getTime()) {
    return 'scheduled';
  }
  if (window.availableUntil && now.getTime() >= window.availableUntil.getTime()) {
    return 'ended';
  }

  return 'open';
}

export function ownSight(item: Schedulable, now: Date): Sight {
  if (!item.visible) return 'none';

  switch (availabilityAt(item, now)) {
    case 'open':
      return 'full';
    case 'scheduled':
      return item.hiddenUntilAvailable ? 'none' : 'title';
    case 'ended':
      return 'none';
  }
}

export function assertAvailabilityWindow({
  availableFrom,
  availableUntil,
}: AvailabilityWindow): void {
  if (!availableFrom || !availableUntil) return;

  if (availableUntil.getTime() <= availableFrom.getTime()) {
    throw new InvalidInputError(
      'AVAILABILITY_WINDOW_INVALID',
      'Something becomes available before it stops being available',
      { availableFrom, availableUntil },
    );
  }
}

export function teaserOf<T extends object>(row: T, blanked: readonly (keyof T)[]): T {
  return { ...row, ...Object.fromEntries(blanked.map((key) => [key, null])) };
}

export function availabilityChanges(
  changes: AvailabilityWindow & { hiddenUntilAvailable?: boolean },
) {
  return {
    ...(changes.availableFrom === undefined ? {} : { availableFrom: changes.availableFrom }),
    ...(changes.availableUntil === undefined ? {} : { availableUntil: changes.availableUntil }),
    ...(changes.hiddenUntilAvailable === undefined
      ? {}
      : { hiddenUntilAvailable: changes.hiddenUntilAvailable }),
  };
}

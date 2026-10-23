import type { Restriction } from '../../database/schema';

import { availabilityAt, type Schedulable, type Sight } from './learning-availability';
import { verdictOf, type StudentFacts } from './restriction-verdict';
import { viewOf, type RestrictionNames, type RestrictionView } from './restriction-view';

export const ACCESS_REASONS = ['hidden', 'scheduled', 'ended', 'locked'] as const;
export type AccessReason = (typeof ACCESS_REASONS)[number];

export const ACCESS_SOURCES = ['item', 'section'] as const;
export type AccessSource = (typeof ACCESS_SOURCES)[number];

export interface Access {
  readonly sight: Sight;
  readonly reason: AccessReason | null;
  readonly source: AccessSource | null;
  readonly availableFrom: Date | null;
  readonly restriction: RestrictionView | null;
}

export interface Explainable extends Schedulable {
  readonly restriction: Restriction | null;
}

export const OPEN: Access = {
  sight: 'full',
  reason: null,
  source: null,
  availableFrom: null,
  restriction: null,
};

export function explainOwn(
  subject: Explainable,
  facts: StudentFacts,
  names: RestrictionNames,
  now: Date,
): Access {
  const closed = (reason: AccessReason): Access => ({
    ...OPEN,
    sight: 'none',
    reason,
    source: 'item',
  });

  if (!subject.visible) return closed('hidden');

  const availability = availabilityAt(subject, now);
  if (availability === 'ended') return closed('ended');

  const scheduled: Access = {
    ...OPEN,
    sight: subject.hiddenUntilAvailable ? 'none' : 'title',
    reason: 'scheduled',
    source: 'item',
    availableFrom: subject.availableFrom,
  };
  if (availability === 'scheduled' && scheduled.sight === 'none') return scheduled;

  const { restriction } = subject;
  const verdict = restriction ? verdictOf(restriction, facts, now) : null;
  if (!restriction || !verdict || verdict.open) {
    return availability === 'scheduled' ? scheduled : OPEN;
  }

  const hidden = verdict.outside
    ? (restriction.audience?.hideFromOthers ?? false)
    : restriction.hideWhenLocked;

  return {
    sight: hidden ? 'none' : 'title',
    reason: 'locked',
    source: 'item',
    availableFrom: availability === 'scheduled' ? subject.availableFrom : null,
    restriction: viewOf(restriction, verdict.unmet, names, true, verdict.outside),
  };
}

export function withinSection(section: Access, own: Access): Access {
  if (section.sight === 'full') return own;

  return { ...section, sight: 'none', source: 'section' };
}

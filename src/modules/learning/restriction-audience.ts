import { InvalidInputError } from '../../common/errors/domain.error';
import type { Audience, Restriction } from '../../database/schema';

import { MAX_CONDITIONS } from './restriction';

export interface AudienceInput {
  readonly groupIds: readonly string[];
  readonly hideFromOthers?: boolean;
}

export function parseAudience(
  input: AudienceInput | null | undefined,
): Audience | null | undefined {
  if (input === undefined || input === null) return input;

  const groupIds = [...new Set(input.groupIds)];
  if (groupIds.length === 0 || groupIds.length > MAX_CONDITIONS) {
    throw new InvalidInputError(
      'RESTRICTION_AUDIENCE_SIZE',
      `Content is for between 1 and ${MAX_CONDITIONS} groups`,
      { count: groupIds.length },
    );
  }

  return { groupIds, hideFromOthers: input.hideFromOthers ?? false };
}

export function composeRestriction(
  existing: Restriction | null,
  conditions: Restriction | null | undefined,
  audience: Audience | null | undefined,
): Restriction | null | undefined {
  if (conditions === undefined && audience === undefined) return undefined;

  const ownConditions =
    conditions === undefined ? conditionsOf(existing) : (conditions ?? null);
  const ownAudience = audience === undefined ? (existing?.audience ?? null) : audience;

  if (ownAudience === null) return ownConditions;

  return {
    ...(ownConditions ?? { match: 'all', hideWhenLocked: false, conditions: [] }),
    audience: ownAudience,
  };
}

export function conditionsOf(restriction: Restriction | null): Restriction | null {
  if (!restriction || restriction.conditions.length === 0) return null;

  return {
    match: restriction.match,
    hideWhenLocked: restriction.hideWhenLocked,
    conditions: restriction.conditions,
  };
}

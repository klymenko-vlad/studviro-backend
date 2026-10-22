import { describe, expect, it } from 'vitest';

import { CANONICAL_ROLES } from '../../database/schema';

import { DERIVED_ROLES, GRANTABLE_ROLES, isDerivedRole } from './authorization.constants';

describe('authorization constants', () => {
  it('excludes every derived role from the grantable set', () => {
    for (const role of DERIVED_ROLES) {
      expect(GRANTABLE_ROLES).not.toContain(role);
    }
  });

  it('covers every canonical role between the two sets, with no overlap', () => {
    expect(new Set([...DERIVED_ROLES, ...GRANTABLE_ROLES])).toEqual(new Set(CANONICAL_ROLES));
    expect(
      DERIVED_ROLES.some((role) => (GRANTABLE_ROLES as readonly string[]).includes(role)),
    ).toBe(false);
  });

  it('flags student, teacher and teaching_assistant as derived', () => {
    expect(isDerivedRole('student')).toBe(true);
    expect(isDerivedRole('teacher')).toBe(true);
    expect(isDerivedRole('teaching_assistant')).toBe(true);
    expect(isDerivedRole('registrar')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { CANONICAL_ROLES } from '../../database/schema';

import { grants, permissionsForRoles, PERMISSIONS, ROLE_PERMISSIONS } from './permissions';

describe('permissions', () => {
  it('defines a permission set for every canonical role', () => {
    for (const role of CANONICAL_ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it('grants only permissions drawn from the catalogue', () => {
    const catalogue = new Set<string>(PERMISSIONS);

    for (const role of CANONICAL_ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(catalogue).toContain(permission);
      }
    }
  });

  it('gives an institution admin every permission', () => {
    for (const permission of PERMISSIONS) {
      expect(grants('institution_admin', permission)).toBe(true);
    }
  });

  it('lets a student read their own academic data but not change it', () => {
    expect(grants('student', 'grade:read')).toBe(true);
    expect(grants('student', 'grade:propose')).toBe(false);
    expect(grants('student', 'enrollment:manage')).toBe(false);
  });

  it('lets a student register themselves for an exam term', () => {
    expect(grants('student', 'exam:register')).toBe(true);
    expect(grants('teacher', 'exam:register')).toBe(true);
  });

  it('separates proposing a grade from publishing one', () => {
    expect(grants('teaching_assistant', 'grade:propose')).toBe(true);
    expect(grants('teaching_assistant', 'grade:publish')).toBe(false);
    expect(grants('teacher', 'grade:publish')).toBe(true);
  });

  it('reserves role assignment for roles that administer people', () => {
    expect(grants('teacher', 'role:assign')).toBe(false);
    expect(grants('org_unit_manager', 'role:assign')).toBe(true);
  });

  it('reserves connector configuration for the institution admin', () => {
    for (const role of CANONICAL_ROLES) {
      if (role === 'institution_admin') continue;

      expect(grants(role, 'connector:configure')).toBe(false);
    }
  });

  it('unions the permissions of several roles', () => {
    const combined = permissionsForRoles(['student', 'teaching_assistant']);

    expect(combined.has('grade:read')).toBe(true);
    expect(combined.has('grade:propose')).toBe(true);
    expect(combined.has('institution:manage')).toBe(false);
  });

  it('grants nothing for an empty role set', () => {
    expect(permissionsForRoles([]).size).toBe(0);
  });
});

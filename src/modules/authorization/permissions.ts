import type { CanonicalRole } from '../../database/schema';

export const PERMISSIONS = [
  'program:read',
  'program:manage',
  'course:read',
  'course:manage',
  'offering:read',
  'offering:manage',
  'enrollment:read',
  'enrollment:manage',
  'grade:read',
  'grade:propose',
  'grade:publish',
  'schedule:read',
  'schedule:manage',
  'role:read',
  'role:assign',
  'institution:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READS = [
  'program:read',
  'course:read',
  'offering:read',
  'enrollment:read',
  'grade:read',
  'schedule:read',
] as const satisfies readonly Permission[];

const TEACHING = [
  ...READS,
  'role:read',
  'grade:propose',
  'grade:publish',
] as const satisfies readonly Permission[];

const COURSE_ADMINISTRATION = [
  ...TEACHING,
  'course:manage',
  'offering:manage',
  'schedule:manage',
  'enrollment:manage',
] as const satisfies readonly Permission[];

export const ROLE_PERMISSIONS: Readonly<Record<CanonicalRole, readonly Permission[]>> = {
  student: READS,
  teaching_assistant: [...READS, 'grade:propose'],
  teacher: TEACHING,
  course_coordinator: COURSE_ADMINISTRATION,
  program_coordinator: [...COURSE_ADMINISTRATION, 'program:manage'],
  registrar: [...READS, 'role:read', 'enrollment:manage', 'grade:publish'],
  org_unit_manager: [...COURSE_ADMINISTRATION, 'program:manage', 'role:assign'],
  institution_admin: PERMISSIONS,
};

export function grants(role: CanonicalRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsForRoles(roles: Iterable<CanonicalRole>): ReadonlySet<Permission> {
  const granted = new Set<Permission>();

  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }

  return granted;
}

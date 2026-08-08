import { isNull, sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, provenance, timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { users } from './users';

export const CANONICAL_ROLES = [
  'student',
  'teacher',
  'teaching_assistant',
  'course_coordinator',
  'program_coordinator',
  'registrar',
  'org_unit_manager',
  'institution_admin',
] as const;
export type CanonicalRole = (typeof CANONICAL_ROLES)[number];
export const canonicalRole = pgEnum('canonical_role', CANONICAL_ROLES);

export const ROLE_SCOPE_TYPES = [
  'institution',
  'org_unit',
  'program',
  'course_offering',
] as const;
export type RoleScopeType = (typeof ROLE_SCOPE_TYPES)[number];
export const roleScopeType = pgEnum('role_scope_type', ROLE_SCOPE_TYPES);

export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: canonicalRole('role').notNull(),
    scopeType: roleScopeType('scope_type').notNull(),
    scopeId: uuid('scope_id'),
    validFrom: timestampColumn('valid_from'),
    validUntil: timestampColumn('valid_until'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('role_assignments_unique_idx')
      .on(table.institutionId, table.userId, table.role, table.scopeType, table.scopeId)
      .where(isNull(table.deletedAt)),
    index('role_assignments_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
    index('role_assignments_scope_idx')
      .on(table.institutionId, table.scopeType, table.scopeId)
      .where(isNull(table.deletedAt)),
    check(
      'role_assignments_scope_id_matches_type',
      sql`(${table.scopeType} = 'institution') = (${table.scopeId} is null)`,
    ),
  ],
);

export type RoleAssignment = typeof roleAssignments.$inferSelect;
export type NewRoleAssignment = typeof roleAssignments.$inferInsert;

import { describe, expect, it, vi } from 'vitest';

import type { RoleAssignment, User } from '../../database/schema';
import type { DerivedRolesRepository } from '../authorization/derived-roles.repository';
import type { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';
import type { UsersRepository } from '../users/users.repository';

import { PeopleService } from './people.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const ADMIN = '22222222-2222-2222-2222-222222222222';
const STUDENT = '33333333-3333-3333-3333-333333333333';

const user = (id: string, email: string): User =>
  ({ id, email, displayName: email, status: 'active' }) as User;

const grantedAssignment = (userId: string): RoleAssignment =>
  ({
    id: `a-${userId}`,
    institutionId: INSTITUTION,
    userId,
    role: 'institution_admin',
    scopeType: 'institution',
    scopeId: null,
    validFrom: null,
    validUntil: null,
  }) as RoleAssignment;

function serviceWith(
  granted: RoleAssignment[],
  derived: Map<string, unknown[]>,
  people: User[],
) {
  const assignments = { findManyIn: vi.fn().mockResolvedValue(granted) };
  const derivedRoles = { findAllForInstitution: vi.fn().mockResolvedValue(derived) };
  const users = { findByIds: vi.fn().mockResolvedValue(people) };

  return {
    assignments,
    derivedRoles,
    users,
    service: new PeopleService(
      users as unknown as UsersRepository,
      assignments as unknown as RoleAssignmentsRepository,
      derivedRoles as unknown as DerivedRolesRepository,
    ),
  };
}

describe('PeopleService', () => {
  it('lists a person once with their granted roles', async () => {
    const { service } = serviceWith([grantedAssignment(ADMIN)], new Map(), [
      user(ADMIN, 'admin@upjs.sk'),
    ]);

    const listed = await service.listForInstitution(INSTITUTION);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.roles).toMatchObject([{ role: 'institution_admin', source: 'granted' }]);
  });

  it('lists a person who only has a derived role', async () => {
    const { service } = serviceWith(
      [],
      new Map([
        [STUDENT, [{ role: 'student', scope: { type: 'institution', id: INSTITUTION } }]],
      ]),
      [user(STUDENT, 'student@upjs.sk')],
    );

    const listed = await service.listForInstitution(INSTITUTION);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.roles).toMatchObject([{ role: 'student', source: 'derived' }]);
  });

  it('merges granted and derived roles for the same person', async () => {
    const { service } = serviceWith(
      [grantedAssignment(STUDENT)],
      new Map([
        [STUDENT, [{ role: 'student', scope: { type: 'institution', id: INSTITUTION } }]],
      ]),
      [user(STUDENT, 'student@upjs.sk')],
    );

    const listed = await service.listForInstitution(INSTITUTION);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.roles).toHaveLength(2);
  });

  it('returns an empty list for an institution with nobody in it', async () => {
    const { service, users } = serviceWith([], new Map(), []);

    await expect(service.listForInstitution(INSTITUTION)).resolves.toEqual([]);
    expect(users.findByIds).not.toHaveBeenCalled();
  });
});

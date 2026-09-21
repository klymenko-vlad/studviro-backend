import { describe, expect, it, vi } from 'vitest';

import type { RoleAssignment, User } from '../../database/schema';
import type { DerivedRolesRepository } from '../authorization/derived-roles.repository';
import type { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';

import type { ListPeopleQueryDto } from './dto/list-people.query.dto';
import type { PeopleRepository } from './people.repository';
import { PeopleService } from './people.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const ADMIN = '22222222-2222-2222-2222-222222222222';
const STUDENT = '33333333-3333-3333-3333-333333333333';

const user = (id: string, email: string, displayName = email): User =>
  ({ id, email, displayName, status: 'active' }) as User;

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

const query = (overrides: Partial<ListPeopleQueryDto> = {}): ListPeopleQueryDto => ({
  limit: 20,
  order: 'desc',
  ...overrides,
});

function serviceWith(
  granted: RoleAssignment[],
  derived: Map<string, unknown[]>,
  people: User[],
  hasNextPage = false,
) {
  const assignments = { findManyIn: vi.fn().mockResolvedValue(granted) };
  const derivedRoles = { findForUsers: vi.fn().mockResolvedValue(derived) };
  const repository = { findPage: vi.fn().mockResolvedValue({ people, hasNextPage }) };

  return {
    assignments,
    derivedRoles,
    repository,
    service: new PeopleService(
      repository as unknown as PeopleRepository,
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

    const page = await service.listForInstitution(INSTITUTION, query());

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.roles).toMatchObject([
      { role: 'institution_admin', source: 'granted' },
    ]);
  });

  it('lists a person who only has a derived role', async () => {
    const { service } = serviceWith(
      [],
      new Map([
        [STUDENT, [{ role: 'student', scope: { type: 'institution', id: INSTITUTION } }]],
      ]),
      [user(STUDENT, 'student@upjs.sk')],
    );

    const page = await service.listForInstitution(INSTITUTION, query());

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.roles).toMatchObject([{ role: 'student', source: 'derived' }]);
  });

  it('merges granted and derived roles for the same person', async () => {
    const { service } = serviceWith(
      [grantedAssignment(STUDENT)],
      new Map([
        [STUDENT, [{ role: 'student', scope: { type: 'institution', id: INSTITUTION } }]],
      ]),
      [user(STUDENT, 'student@upjs.sk')],
    );

    const page = await service.listForInstitution(INSTITUTION, query());

    expect(page.items[0]?.roles).toHaveLength(2);
  });

  it('answers with an empty page for an institution with nobody in it', async () => {
    const { service, assignments, derivedRoles } = serviceWith([], new Map(), []);

    const page = await service.listForInstitution(INSTITUTION, query());

    expect(page.items).toEqual([]);
    expect(page.meta).toMatchObject({ hasNextPage: false, nextCursor: null });
    // Nobody on the page means no roles to look up for anybody.
    expect(assignments.findManyIn).not.toHaveBeenCalled();
    expect(derivedRoles.findForUsers).not.toHaveBeenCalled();
  });

  describe('the page it hands back', () => {
    const twoPeople = () => [
      user(ADMIN, 'admin@upjs.sk', 'Anna Bartošová'),
      user(STUDENT, 'student@upjs.sk', 'Boris Cibuľa'),
    ];

    it('carries a cursor built from the last row when there is more', async () => {
      const { service } = serviceWith([], new Map(), twoPeople(), true);

      const page = await service.listForInstitution(INSTITUTION, query({ limit: 2 }));

      expect(page.meta).toMatchObject({ limit: 2, hasNextPage: true });
      const decoded = JSON.parse(
        Buffer.from(page.meta.nextCursor ?? '', 'base64url').toString('utf8'),
      ) as { v: string; i: string };
      expect(decoded).toEqual({ v: 'Boris Cibuľa', i: STUDENT });
    });

    it('carries no cursor on the last page, so a client knows to stop', async () => {
      const { service } = serviceWith([], new Map(), twoPeople(), false);

      const page = await service.listForInstitution(INSTITUTION, query({ limit: 2 }));

      expect(page.meta.nextCursor).toBeNull();
    });

    it('asks the repository only for the people on this page', async () => {
      const { service, repository } = serviceWith([], new Map(), twoPeople());

      await service.listForInstitution(INSTITUTION, query({ limit: 2, cursor: 'c', q: 'ann' }));

      expect(repository.findPage).toHaveBeenCalledWith(INSTITUTION, {
        limit: 2,
        cursor: 'c',
        search: 'ann',
      });
    });

    it('looks up roles for exactly those people, not the whole institution', async () => {
      const { service, derivedRoles } = serviceWith([], new Map(), twoPeople());

      await service.listForInstitution(INSTITUTION, query());

      expect(derivedRoles.findForUsers).toHaveBeenCalledWith(INSTITUTION, [ADMIN, STUDENT]);
    });

    it('keeps the order the repository chose', async () => {
      const { service } = serviceWith([], new Map(), twoPeople());

      const page = await service.listForInstitution(INSTITUTION, query());

      expect(page.items.map((entry) => entry.displayName)).toEqual([
        'Anna Bartošová',
        'Boris Cibuľa',
      ]);
    });
  });
});

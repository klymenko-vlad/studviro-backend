import { describe, expect, it, vi } from 'vitest';

import type { Institution, RoleAssignment } from '../../database/schema';
import type { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';
import type { UsersRepository } from '../users/users.repository';

import type { InstitutionsRepository } from './institutions.repository';
import { InstitutionsService } from './institutions.service';

const UPJS = '11111111-1111-1111-1111-111111111111';
const TUKE = '99999999-9999-9999-9999-999999999999';
const USER = '44444444-4444-4444-4444-444444444444';

const institution = (id: string, code: string): Institution =>
  ({ id, code, name: code.toUpperCase(), defaultLocale: 'en' }) as Institution;

const assignment = (institutionId: string): RoleAssignment =>
  ({ id: `a-${institutionId}`, institutionId, userId: USER }) as RoleAssignment;

function serviceWith(
  assignments: RoleAssignment[],
  institutions: Institution[],
  options: { userExists?: boolean } = {},
) {
  const roleAssignments = {
    findActiveForUserAnywhere: vi.fn().mockResolvedValue(assignments),
    create: vi.fn().mockResolvedValue(assignment(institutions[0]?.id ?? UPJS)),
  };
  const repository = {
    findByIds: vi.fn().mockResolvedValue(institutions),
    findByIdOrFail: vi.fn().mockResolvedValue(institutions[0]),
    create: vi.fn().mockResolvedValue(institutions[0] ?? institution(UPJS, 'upjs')),
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(undefined)),
  };
  const users = {
    existsById: vi.fn().mockResolvedValue(options.userExists ?? true),
  };

  return {
    repository,
    roleAssignments,
    users,
    service: new InstitutionsService(
      repository as unknown as InstitutionsRepository,
      roleAssignments as unknown as RoleAssignmentsRepository,
      users as unknown as UsersRepository,
    ),
  };
}

describe('InstitutionsService', () => {
  it('lists the institutions the user holds a role in', async () => {
    const { service } = serviceWith([assignment(UPJS)], [institution(UPJS, 'upjs')]);

    const listed = await service.listForUser(USER);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.code).toBe('upjs');
  });

  it('asks for each institution once even when several roles point at it', async () => {
    const { service, repository } = serviceWith(
      [assignment(UPJS), assignment(UPJS), assignment(TUKE)],
      [institution(UPJS, 'upjs'), institution(TUKE, 'tuke')],
    );

    await service.listForUser(USER);

    expect(repository.findByIds).toHaveBeenCalledWith([UPJS, TUKE], expect.anything());
  });

  it('returns nothing, and asks for nothing, when the user holds no roles', async () => {
    const { service, repository } = serviceWith([], []);

    await expect(service.listForUser(USER)).resolves.toEqual([]);
    expect(repository.findByIds).not.toHaveBeenCalled();
  });

  it('exposes a single institution by id', async () => {
    const { service } = serviceWith([], [institution(UPJS, 'upjs')]);

    await expect(service.findOne(UPJS)).resolves.toMatchObject({ id: UPJS, code: 'upjs' });
  });

  it('creates an institution and grants its first admin', async () => {
    const { service, repository, roleAssignments } = serviceWith(
      [],
      [institution(UPJS, 'upjs')],
    );

    const created = await service.create({
      code: 'upjs',
      name: 'UPJŠ',
      firstAdminUserId: USER,
    });

    expect(created.code).toBe('upjs');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'upjs' }),
      undefined,
    );
    expect(roleAssignments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: UPJS,
        userId: USER,
        role: 'institution_admin',
        scopeType: 'institution',
        scopeId: null,
      }),
      undefined,
    );
  });

  it('refuses to create an institution for a user that does not exist', async () => {
    const { service } = serviceWith([], [institution(UPJS, 'upjs')], { userExists: false });

    await expect(
      service.create({ code: 'upjs', name: 'UPJŠ', firstAdminUserId: USER }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('rejects a duplicate institution code as a conflict', async () => {
    const { service, repository } = serviceWith([], [institution(UPJS, 'upjs')]);
    repository.create.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );

    await expect(
      service.create({ code: 'upjs', name: 'UPJŠ', firstAdminUserId: USER }),
    ).rejects.toMatchObject({ code: 'INSTITUTION_CODE_TAKEN' });
  });
});

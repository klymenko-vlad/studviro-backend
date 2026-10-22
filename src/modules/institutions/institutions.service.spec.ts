import { describe, expect, it, vi } from 'vitest';

import type { Institution, RoleAssignment } from '../../database/schema';
import type { DerivedRolesRepository } from '../authorization/derived-roles.repository';
import type { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';
import type { InvitationMailer } from '../invitations/invitation-mailer';
import type { InvitationsService } from '../invitations/invitations.service';
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
  const invitations = {
    createForNewInstitution: vi
      .fn()
      .mockResolvedValue({ invitation: { id: 'invitation-1' }, token: 'raw-token' }),
    isDevToken: vi.fn().mockReturnValue(true),
  };

  const derivedRoles = { institutionsFor: vi.fn().mockResolvedValue([]) };
  const invitationMailer = { send: vi.fn() };

  return {
    repository,
    roleAssignments,
    derivedRoles,
    users,
    invitations,
    service: new InstitutionsService(
      repository as unknown as InstitutionsRepository,
      roleAssignments as unknown as RoleAssignmentsRepository,
      derivedRoles as unknown as DerivedRolesRepository,
      users as unknown as UsersRepository,
      invitations as unknown as InvitationsService,
      invitationMailer as unknown as InvitationMailer,
    ),
    invitationMailer,
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

  it('lists an institution the user belongs to through an academic record alone', async () => {
    const { service, derivedRoles } = serviceWith([], [institution(TUKE, 'tuke')]);
    derivedRoles.institutionsFor.mockResolvedValue([TUKE]);

    const listed = await service.listForUser(USER);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.code).toBe('tuke');
  });

  it('asks for an institution once when a grant and an academic record both name it', async () => {
    const { service, repository, derivedRoles } = serviceWith(
      [assignment(UPJS)],
      [institution(UPJS, 'upjs')],
    );
    derivedRoles.institutionsFor.mockResolvedValue([UPJS]);

    await service.listForUser(USER);

    expect(repository.findByIds).toHaveBeenCalledWith([UPJS], expect.anything());
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

  it('creates an institution_admin invitation instead when given an email', async () => {
    const { service, invitations, roleAssignments } = serviceWith(
      [],
      [institution(UPJS, 'upjs')],
    );

    const created = await service.create({
      code: 'upjs',
      name: 'UPJŠ',
      firstAdminEmail: 'admin@upjs.sk',
    });

    expect(invitations.createForNewInstitution).toHaveBeenCalledWith(
      UPJS,
      'admin@upjs.sk',
      undefined,
    );
    expect(created.firstAdminInvitationDevToken).toBe('raw-token');
    expect(roleAssignments.create).not.toHaveBeenCalled();
  });

  it('mails the first administrator their invitation once the institution exists', async () => {
    const { service, invitationMailer } = serviceWith([], [institution(UPJS, 'upjs')]);

    await service.create({
      code: 'upjs',
      name: 'UPJŠ',
      defaultLocale: 'sk',
      timezone: 'Europe/Bratislava',
      firstAdminEmail: 'admin@upjs.sk',
    });

    expect(invitationMailer.send).toHaveBeenCalledWith({ id: 'invitation-1' }, 'raw-token');
  });

  it('hides the invitation token outside development', async () => {
    const { service, invitations } = serviceWith([], [institution(UPJS, 'upjs')]);
    invitations.isDevToken.mockReturnValue(false);

    const created = await service.create({
      code: 'upjs',
      name: 'UPJŠ',
      firstAdminEmail: 'admin@upjs.sk',
    });

    expect(created.firstAdminInvitationDevToken).toBeUndefined();
  });

  it('rejects a request naming both firstAdminUserId and firstAdminEmail', async () => {
    const { service } = serviceWith([], [institution(UPJS, 'upjs')]);

    await expect(
      service.create({
        code: 'upjs',
        name: 'UPJŠ',
        firstAdminUserId: USER,
        firstAdminEmail: 'admin@upjs.sk',
      }),
    ).rejects.toMatchObject({ code: 'FIRST_ADMIN_IDENTIFIER_REQUIRED' });
  });

  it('rejects a request naming neither firstAdminUserId nor firstAdminEmail', async () => {
    const { service } = serviceWith([], [institution(UPJS, 'upjs')]);

    await expect(service.create({ code: 'upjs', name: 'UPJŠ' })).rejects.toMatchObject({
      code: 'FIRST_ADMIN_IDENTIFIER_REQUIRED',
    });
  });
});

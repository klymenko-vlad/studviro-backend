import { describe, expect, it, vi } from 'vitest';

import type { Institution, RoleAssignment } from '../../database/schema';
import type { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';

import type { InstitutionsRepository } from './institutions.repository';
import { InstitutionsService } from './institutions.service';

const UPJS = '11111111-1111-1111-1111-111111111111';
const TUKE = '99999999-9999-9999-9999-999999999999';
const USER = '44444444-4444-4444-4444-444444444444';

const institution = (id: string, code: string): Institution =>
  ({ id, code, name: code.toUpperCase(), defaultLocale: 'en' }) as Institution;

const assignment = (institutionId: string): RoleAssignment =>
  ({ id: `a-${institutionId}`, institutionId, userId: USER }) as RoleAssignment;

function serviceWith(assignments: RoleAssignment[], institutions: Institution[]) {
  const roleAssignments = {
    findActiveForUserAnywhere: vi.fn().mockResolvedValue(assignments),
  };
  const repository = {
    findByIds: vi.fn().mockResolvedValue(institutions),
    findByIdOrFail: vi.fn().mockResolvedValue(institutions[0]),
  };

  return {
    repository,
    roleAssignments,
    service: new InstitutionsService(
      repository as unknown as InstitutionsRepository,
      roleAssignments as unknown as RoleAssignmentsRepository,
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
});

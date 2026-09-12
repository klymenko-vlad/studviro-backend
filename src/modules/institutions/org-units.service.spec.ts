import { describe, expect, it, vi } from 'vitest';

import type { OrgUnit } from '../../database/schema';

import type { OrgUnitsRepository } from './org-units.repository';
import { OrgUnitsService } from './org-units.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';

const orgUnit = (id: string, code: string): OrgUnit =>
  ({
    id,
    institutionId: INSTITUTION,
    parentId: null,
    type: 'faculty',
    code,
    name: code.toUpperCase(),
  }) as OrgUnit;

describe('OrgUnitsService', () => {
  it('lists the org units of an institution', async () => {
    const repository = {
      findManyIn: vi.fn().mockResolvedValue([orgUnit('a', 'fmfi')]),
    };
    const service = new OrgUnitsService(repository as unknown as OrgUnitsRepository);

    const listed = await service.listForInstitution(INSTITUTION);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.code).toBe('fmfi');
    expect(repository.findManyIn).toHaveBeenCalledWith(INSTITUTION, expect.anything());
  });

  it('returns an empty list for an institution with no org units', async () => {
    const repository = { findManyIn: vi.fn().mockResolvedValue([]) };
    const service = new OrgUnitsService(repository as unknown as OrgUnitsRepository);

    await expect(service.listForInstitution(INSTITUTION)).resolves.toEqual([]);
  });

  it('exposes a single org unit by id', async () => {
    const repository = {
      findByIdInOrFail: vi.fn().mockResolvedValue(orgUnit('a', 'fmfi')),
    };
    const service = new OrgUnitsService(repository as unknown as OrgUnitsRepository);

    await expect(service.findOne(INSTITUTION, 'a')).resolves.toMatchObject({ code: 'fmfi' });
  });
});

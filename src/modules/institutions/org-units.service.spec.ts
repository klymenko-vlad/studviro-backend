import { describe, expect, it, vi } from 'vitest';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
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

describe('OrgUnitsService writes', () => {
  const repo = () => ({
    findManyIn: vi.fn().mockResolvedValue([]),
    findByIdIn: vi.fn().mockResolvedValue(orgUnit('unit-1', 'fei')),
    findByIdInOrFail: vi.fn(),
    create: vi.fn().mockImplementation((value: unknown) => Promise.resolve(value)),
    update: vi
      .fn()
      .mockImplementation((id: string, value: object) =>
        Promise.resolve({ ...orgUnit(id, 'fei'), ...value }),
      ),
    softDelete: vi.fn(),
    assertCodeFree: vi.fn(),
    countChildren: vi.fn().mockResolvedValue(0),
    countDependants: vi.fn().mockResolvedValue(0),
    ancestorsOf: vi.fn().mockResolvedValue([]),
    hasLiveUnit: vi.fn().mockResolvedValue(true),
  });

  const make = (overrides: Partial<ReturnType<typeof repo>> = {}) => {
    const repository = { ...repo(), ...overrides };

    return {
      repository,
      service: new OrgUnitsService(repository as unknown as OrgUnitsRepository),
    };
  };

  it('creates a root unit when no parent is given', async () => {
    const { repository, service } = make();

    await service.create(INSTITUTION, { code: 'FEI', name: 'Faculty' });

    expect(repository.assertCodeFree).toHaveBeenCalledWith(INSTITUTION, 'FEI');
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId: INSTITUTION, parentId: null }),
    );
  });

  it('refuses a parent that is not a live unit of this institution', async () => {
    const { service } = make({ hasLiveUnit: vi.fn().mockResolvedValue(false) });

    await expect(
      service.create(INSTITUTION, { code: 'KPI', name: 'Dept', parentId: 'elsewhere' }),
    ).rejects.toThrow(EntityNotFoundError);
  });

  it('refuses to make a unit its own parent', async () => {
    const { service } = make();

    await expect(service.update(INSTITUTION, 'unit-1', { parentId: 'unit-1' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('refuses to move a unit under its own descendant', async () => {
    const { service } = make({
      ancestorsOf: vi.fn().mockResolvedValue(['child', 'unit-1', 'root']),
    });

    await expect(service.update(INSTITUTION, 'unit-1', { parentId: 'child' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('allows a move that does not close a ring', async () => {
    const { repository, service } = make({
      ancestorsOf: vi.fn().mockResolvedValue(['root']),
    });

    await service.update(INSTITUTION, 'unit-1', { parentId: 'sibling' });

    expect(repository.update).toHaveBeenCalledWith('unit-1', { parentId: 'sibling' });
  });

  it('only checks the code when the patch changes it', async () => {
    const { repository, service } = make();

    await service.update(INSTITUTION, 'unit-1', { name: 'Renamed' });

    expect(repository.assertCodeFree).not.toHaveBeenCalled();
  });

  it('refuses to retire a unit that still has units under it', async () => {
    const { repository, service } = make({ countChildren: vi.fn().mockResolvedValue(2) });

    await expect(service.remove(INSTITUTION, 'unit-1')).rejects.toThrow(ConflictError);
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('refuses to retire a unit programmes, courses or rooms still belong to', async () => {
    const { repository, service } = make({ countDependants: vi.fn().mockResolvedValue(5) });

    await expect(service.remove(INSTITUTION, 'unit-1')).rejects.toThrow(ConflictError);
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('retires a leaf nothing belongs to', async () => {
    const { repository, service } = make();

    await service.remove(INSTITUTION, 'unit-1');

    expect(repository.softDelete).toHaveBeenCalledWith('unit-1');
  });

  it('404s on a unit in another institution', async () => {
    const { service } = make({ findByIdIn: vi.fn().mockResolvedValue(undefined) });

    await expect(service.update(INSTITUTION, 'unit-1', { name: 'x' })).rejects.toThrow(
      EntityNotFoundError,
    );
    await expect(service.remove(INSTITUTION, 'unit-1')).rejects.toThrow(EntityNotFoundError);
  });
});

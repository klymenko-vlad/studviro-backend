import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';

import type { OrgUnitsRepository } from './org-units.repository';
import type { RoomsRepository } from './rooms.repository';
import { RoomsService } from './rooms.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';

describe('RoomsService', () => {
  const rooms = {
    listFor: vi.fn(),
    findByIdIn: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    assertCodeFree: vi.fn(),
    countBookings: vi.fn(),
  };
  const orgUnits = { hasLiveUnit: vi.fn() };

  let service: RoomsService;

  beforeEach(() => {
    vi.clearAllMocks();
    rooms.create.mockImplementation((value: unknown) => Promise.resolve(value));
    rooms.update.mockImplementation((_id: string, value: unknown) => Promise.resolve(value));
    rooms.findByIdIn.mockResolvedValue({ id: 'room-1' });
    rooms.countBookings.mockResolvedValue(0);
    orgUnits.hasLiveUnit.mockResolvedValue(true);

    service = new RoomsService(
      rooms as unknown as RoomsRepository,
      orgUnits as unknown as OrgUnitsRepository,
    );
  });

  it('creates a room, defaulting everything optional to null', async () => {
    await service.create(INSTITUTION, { code: 'FEI-101' });

    expect(rooms.create).toHaveBeenCalledWith({
      institutionId: INSTITUTION,
      code: 'FEI-101',
      name: null,
      building: null,
      capacity: null,
      orgUnitId: null,
    });
  });

  it('refuses an org unit that is not a live unit of this institution', async () => {
    orgUnits.hasLiveUnit.mockResolvedValue(false);

    await expect(
      service.create(INSTITUTION, { code: 'FEI-101', orgUnitId: 'elsewhere' }),
    ).rejects.toThrow(EntityNotFoundError);
    expect(rooms.create).not.toHaveBeenCalled();
  });

  it('keeps a capacity of zero rather than reading it as absent', async () => {
    await service.create(INSTITUTION, { code: 'STORE', capacity: 0 });

    expect(rooms.create).toHaveBeenCalledWith(expect.objectContaining({ capacity: 0 }));
  });

  it('only checks the code when the patch changes it', async () => {
    await service.update(INSTITUTION, 'room-1', { capacity: 40 });

    expect(rooms.assertCodeFree).not.toHaveBeenCalled();
    expect(rooms.update).toHaveBeenCalledWith('room-1', { capacity: 40 });
  });

  it('refuses to take a room out of service while classes are booked into it', async () => {
    rooms.countBookings.mockResolvedValue(12);

    await expect(service.remove(INSTITUTION, 'room-1')).rejects.toThrow(ConflictError);
    expect(rooms.softDelete).not.toHaveBeenCalled();
  });

  it('retires an unbooked room', async () => {
    await service.remove(INSTITUTION, 'room-1');

    expect(rooms.softDelete).toHaveBeenCalledWith('room-1');
  });

  it('404s on a room in another institution', async () => {
    rooms.findByIdIn.mockResolvedValue(undefined);

    await expect(service.update(INSTITUTION, 'room-1', { code: 'x' })).rejects.toThrow(
      EntityNotFoundError,
    );
    await expect(service.remove(INSTITUTION, 'room-1')).rejects.toThrow(EntityNotFoundError);
  });
});

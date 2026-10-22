import { Injectable } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import type { Room } from '../../database/schema';

import { OrgUnitsRepository } from './org-units.repository';
import { RoomsRepository } from './rooms.repository';

export interface RoomInput {
  readonly code: string;
  readonly name?: string | null;
  readonly building?: string | null;
  readonly capacity?: number | null;
  readonly orgUnitId?: string | null;
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly rooms: RoomsRepository,
    private readonly orgUnits: OrgUnitsRepository,
  ) {}

  list(institutionId: string): Promise<Room[]> {
    return this.rooms.listFor(institutionId);
  }

  async create(institutionId: string, input: RoomInput): Promise<Room> {
    await this.rooms.assertCodeFree(institutionId, input.code);
    await this.assertOrgUnit(institutionId, input.orgUnitId ?? null);

    return this.rooms.create({
      institutionId,
      code: input.code,
      name: input.name ?? null,
      building: input.building ?? null,
      capacity: input.capacity ?? null,
      orgUnitId: input.orgUnitId ?? null,
    });
  }

  async update(institutionId: string, id: string, input: Partial<RoomInput>): Promise<Room> {
    const existing = await this.rooms.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('room', id);

    if (input.code !== undefined) {
      await this.rooms.assertCodeFree(institutionId, input.code, id);
    }

    if (input.orgUnitId !== undefined) {
      await this.assertOrgUnit(institutionId, input.orgUnitId);
    }

    return this.rooms.update(id, definedOnly(input));
  }

  async remove(institutionId: string, id: string): Promise<void> {
    const existing = await this.rooms.findByIdIn(institutionId, id, { consistent: true });
    if (!existing) throw new EntityNotFoundError('room', id);

    const bookings = await this.rooms.countBookings(id);
    if (bookings > 0) {
      throw new ConflictError(
        'ROOM_IN_USE',
        'Classes or exams are still booked into this room',
        { bookings },
      );
    }

    await this.rooms.softDelete(id);
  }

  private async assertOrgUnit(institutionId: string, orgUnitId: string | null): Promise<void> {
    if (orgUnitId === null) return;

    const exists = await this.orgUnits.hasLiveUnit(institutionId, orgUnitId);
    if (!exists) throw new EntityNotFoundError('org_unit', orgUnitId);
  }
}

function definedOnly<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

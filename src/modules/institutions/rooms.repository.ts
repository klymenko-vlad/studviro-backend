import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import { ConflictError } from '../../common/errors/domain.error';
import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import { examTerms, rooms, timetableEvents, type Room } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class RoomsRepository extends InstitutionScopedRepository<typeof rooms> {
  protected override readonly sortable = { code: rooms.code, building: rooms.building };

  constructor(txHost: TransactionHost) {
    super(txHost, rooms);
  }

  listFor(institutionId: string): Promise<Room[]> {
    return this.findManyIn(institutionId, { orderBy: asc(rooms.code) });
  }

  async assertCodeFree(institutionId: string, code: string, exceptId?: string): Promise<void> {
    const taken = await this.existsIn(
      institutionId,
      and(eq(rooms.code, code), exceptId ? ne(rooms.id, exceptId) : undefined),
      { consistent: true },
    );

    if (taken) {
      throw new ConflictError('ROOM_CODE_TAKEN', 'Another room already has that code', {
        code,
      });
    }
  }

  /**
   * A room a class or an exam is booked into. Retiring it would leave those
   * bookings pointing at nothing an administrator can see.
   */
  async countBookings(roomId: string): Promise<number> {
    const reader = this.txHost.reader();
    const [events, exams] = await Promise.all([
      reader
        .select({ id: timetableEvents.id })
        .from(timetableEvents)
        .where(and(eq(timetableEvents.roomId, roomId), isNull(timetableEvents.deletedAt))),
      reader
        .select({ id: examTerms.id })
        .from(examTerms)
        .where(and(eq(examTerms.roomId, roomId), isNull(examTerms.deletedAt))),
    ]);

    return events.length + exams.length;
  }
}

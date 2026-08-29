import { Injectable } from '@nestjs/common';

import { InvalidInputError } from '../../common/errors/domain.error';
import type {
  SourceSystem,
  StudyGroupKind,
  SynchronizationStatus,
  TimetableEventType,
} from '../../database/schema';

import {
  MyTimetableEventsRepository,
  type MyTimetableEventFilter,
  type MyTimetableEventRow,
} from './my-timetable-events.repository';

export const TIMETABLE_ATTENDANCES = ['enrolled', 'teaching'] as const;
export type TimetableAttendance = (typeof TIMETABLE_ATTENDANCES)[number];

export const MAX_TIMETABLE_RANGE_DAYS = 92;

export interface MyTimetableEvent {
  id: string;
  type: TimetableEventType;
  title: string | null;
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
  isCancelled: boolean;
  attendance: TimetableAttendance;
  room: { id: string; code: string; name: string | null; building: string | null } | null;
  studyGroup: {
    id: string;
    code: string;
    name: string | null;
    kind: StudyGroupKind;
  } | null;
  offering: { id: string };
  course: { id: string; code: string; title: string };
  term: { id: string; code: string; name: string };
  provenance: {
    sourceSystem: SourceSystem;
    externalId: string | null;
    sourceUpdatedAt: Date | null;
    lastSynchronizedAt: Date | null;
    synchronizationStatus: SynchronizationStatus;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MyTimetableEventsService {
  constructor(private readonly repository: MyTimetableEventsRepository) {}

  async listMine(
    institutionId: string,
    userId: string,
    filter: MyTimetableEventFilter,
  ): Promise<MyTimetableEvent[]> {
    assertRange(filter);

    const rows = await this.repository.findMyEvents(institutionId, userId, filter);

    return rows.map((row) => this.compose(row));
  }

  private compose(row: MyTimetableEventRow): MyTimetableEvent {
    return {
      id: row.eventId,
      type: row.type,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      cancelledAt: row.cancelledAt,
      isCancelled: row.cancelledAt !== null,
      attendance: row.teaching ? 'teaching' : 'enrolled',
      room:
        row.roomId === null
          ? null
          : {
              id: row.roomId,
              code: row.roomCode ?? '',
              name: row.roomName,
              building: row.roomBuilding,
            },
      studyGroup:
        row.studyGroupId === null
          ? null
          : {
              id: row.studyGroupId,
              code: row.studyGroupCode ?? '',
              name: row.studyGroupName,
              kind: row.studyGroupKind ?? 'other',
            },
      offering: { id: row.offeringId },
      course: { id: row.courseId, code: row.courseCode, title: row.courseTitle },
      term: { id: row.termId, code: row.termCode, name: row.termName },
      provenance: {
        sourceSystem: row.sourceSystem,
        externalId: row.externalId,
        sourceUpdatedAt: row.sourceUpdatedAt,
        lastSynchronizedAt: row.lastSynchronizedAt,
        synchronizationStatus: row.synchronizationStatus,
      },
    };
  }
}

function assertRange({ from, to }: MyTimetableEventFilter): void {
  const span = to.getTime() - from.getTime();

  if (span <= 0) {
    throw new InvalidInputError(
      'TIMETABLE_RANGE_INVALID',
      'The end of the range must come after its start',
    );
  }

  if (span > MAX_TIMETABLE_RANGE_DAYS * DAY_MS) {
    throw new InvalidInputError(
      'TIMETABLE_RANGE_TOO_LONG',
      `A timetable range may cover at most ${MAX_TIMETABLE_RANGE_DAYS} days`,
      { maxDays: MAX_TIMETABLE_RANGE_DAYS },
    );
  }
}

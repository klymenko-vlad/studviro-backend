import type { SisExamTerm, SisTimetableEvent } from '../../academic-system.records';
import type { ConnectorRecord } from '../../connector.types';
import { addDays, addHours, addWeeks, atUtcHour } from '../calendar';
import type { MockSisOptions } from '../mock-sis.options';

import type { OfferingContext } from './offerings';
import { record, stamp } from './record';

const WEEKLY_SLOTS = [
  { suffix: 'L', type: 'lecture', dayOfWeek: 0, hour: 9, hours: 2 },
  { suffix: 'S', type: 'seminar', dayOfWeek: 2, hour: 13, hours: 2 },
] as const satisfies readonly {
  suffix: string;
  type: SisTimetableEvent['type'];
  dayOfWeek: number;
  hour: number;
  hours: number;
}[];

const RETAKE_WEEKS_LATER = 3;

export function timetableEventRecords(
  offerings: readonly OfferingContext[],
  options: MockSisOptions,
): ConnectorRecord<SisTimetableEvent>[] {
  return offerings
    .filter((offering) => offering.term.yearOffset === 0)
    .flatMap((offering, index) =>
      WEEKLY_SLOTS.flatMap((slot) =>
        Array.from({ length: options.teachingWeeks }, (_, week) => {
          const startsAt = atUtcHour(
            addDays(addWeeks(offering.term.startsAt, week), slot.dayOfWeek),
            slot.hour,
          );

          return record<SisTimetableEvent>(
            `TTE-${offering.externalId}-${slot.suffix}${week + 1}`,
            stamp(options.anchor, 'schedule', index + week),
            {
              courseOfferingExternalId: offering.externalId,
              studyGroupExternalId:
                slot.type === 'seminar' ? `GRP-${offering.externalId}-1` : null,
              roomExternalId: roomFor(offering, index + week),
              type: slot.type,
              title: offering.course.title,
              startsAt,
              endsAt: addHours(startsAt, slot.hours),
            },
          );
        }),
      ),
    );
}

export function examTermRecords(
  offerings: readonly OfferingContext[],
  options: MockSisOptions,
): ConnectorRecord<SisExamTerm>[] {
  return offerings.flatMap((offering, index) => {
    const examinerExternalId = offering.course.teachers[0]?.externalId ?? '';
    const regularStart = atUtcHour(
      addWeeks(offering.term.startsAt, options.teachingWeeks + 1),
      9,
    );

    return (
      [
        ['regular', regularStart],
        ['first_retake', addWeeks(regularStart, RETAKE_WEEKS_LATER)],
      ] as const
    ).map(([kind, startsAt]) =>
      record<SisExamTerm>(
        `EXT-${offering.externalId}-${kind}`,
        stamp(options.anchor, 'schedule', index),
        {
          courseOfferingExternalId: offering.externalId,
          roomExternalId: roomFor(offering, index),
          examinerExternalId,
          kind,
          startsAt,
          endsAt: addHours(startsAt, 3),
          capacity: options.studentsPerProgram,
          registrationOpensAt: addDays(startsAt, -21),
          registrationClosesAt: addDays(startsAt, -2),
        },
      ),
    );
  });
}

function roomFor(offering: OfferingContext, index: number): string {
  const rooms = offering.faculty.rooms;

  return rooms[index % rooms.length]?.externalId ?? '';
}

import type { CourseGrade, CourseOfferingStatus, EnrollmentStatus } from '../schema';

import { addDays, addHours, addWeeks, atUtcHour } from './calendar';
import { createRandom } from './deterministic-random';
import type { DemoSeedOptions } from './options';
import type {
  DemoPlan,
  PlannedCourse,
  PlannedFaculty,
  PlannedProgram,
  PlannedRoom,
  PlannedStudent,
  PlannedTerm,
} from './plan';

const GROUPS_PER_OFFERING = 2;
const RETAKE_WEEKS_LATER = 3;

/**
 * Deliberately generous. A three-week window would leave every exam term in the
 * demo closed for most of the term, and a screen that can only say "not open
 * yet" demonstrates nothing.
 */
const REGISTRATION_OPENS_DAYS_BEFORE = -60;

const WEEKLY_SLOTS = [
  { suffix: 'L', type: 'lecture', dayOfWeek: 0, hour: 9, hours: 2 },
  { suffix: 'S', type: 'seminar', dayOfWeek: 2, hour: 13, hours: 2 },
] as const;

export interface PlannedOffering {
  readonly key: string;
  readonly term: PlannedTerm;
  readonly course: PlannedCourse;
  readonly program: PlannedProgram;
  readonly faculty: PlannedFaculty;
  readonly status: CourseOfferingStatus;
}

export interface PlannedEnrollment {
  readonly key: string;
  readonly offering: PlannedOffering;
  readonly student: PlannedStudent;
  readonly status: EnrollmentStatus;
  readonly enrolledAt: Date;
}

export interface PlannedStudyGroup {
  readonly key: string;
  readonly offering: PlannedOffering;
  readonly code: string;
  readonly capacity: number;
  readonly memberKeys: readonly string[];
}

export interface PlannedTimetableEvent {
  readonly offering: PlannedOffering;
  readonly studyGroupKey: string | null;
  readonly roomKey: string;
  readonly type: 'lecture' | 'seminar';
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface PlannedExamTerm {
  readonly offering: PlannedOffering;
  readonly roomKey: string;
  readonly examinerKey: string;
  readonly kind: 'regular' | 'first_retake';
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly capacity: number;
  readonly registrationOpensAt: Date;
  readonly registrationClosesAt: Date;
}

export interface PlannedResult {
  readonly enrollment: PlannedEnrollment;
  readonly grade: CourseGrade;
  readonly recordedAt: Date;
}

export function planOfferings(plan: DemoPlan, anchor: Date): PlannedOffering[] {
  return plan.terms.flatMap((term) =>
    plan.faculties.flatMap((faculty) =>
      faculty.programs.flatMap((program) =>
        program.courses
          .filter((course) => course.termKind === term.kind)
          .map((course) => ({
            key: `OFF-${course.key}-${term.code}`,
            term,
            course,
            program,
            faculty,
            status: offeringStatus(term, anchor),
          })),
      ),
    ),
  );
}

function offeringStatus(term: PlannedTerm, anchor: Date): CourseOfferingStatus {
  if (term.isPast) return 'closed';

  return term.startsAt <= anchor ? 'running' : 'open';
}

export function planEnrollments(
  offerings: readonly PlannedOffering[],
  anchor: Date,
): PlannedEnrollment[] {
  return offerings.flatMap((offering) =>
    offering.program.students
      .filter(
        (student) => student.studyYear + offering.term.yearOffset === offering.course.studyYear,
      )
      .map((student, index) => ({
        key: `ENR-${offering.key}-${student.person.key}`,
        offering,
        student,
        status: enrollmentStatus(offering, anchor),
        enrolledAt: addDays(offering.term.enrollmentOpensAt, index % 14),
      })),
  );
}

function enrollmentStatus(offering: PlannedOffering, anchor: Date): EnrollmentStatus {
  if (offering.term.isPast) return 'completed';

  return offering.term.startsAt <= anchor ? 'active' : 'requested';
}

export function planStudyGroups(
  enrollments: readonly PlannedEnrollment[],
): PlannedStudyGroup[] {
  const byOffering = new Map<string, PlannedEnrollment[]>();

  for (const enrollment of enrollments) {
    const bucket = byOffering.get(enrollment.offering.key);
    if (bucket) bucket.push(enrollment);
    else byOffering.set(enrollment.offering.key, [enrollment]);
  }

  return [...byOffering.values()].flatMap((members) =>
    Array.from({ length: GROUPS_PER_OFFERING }, (_, group) => {
      const offering = members[0]?.offering;
      if (!offering) throw new Error('an offering bucket cannot be empty');

      return {
        key: `GRP-${offering.key}-${group + 1}`,
        offering,
        code: `S${group + 1}`,
        capacity: Math.ceil(members.length / GROUPS_PER_OFFERING),
        memberKeys: members
          .filter((_, position) => position % GROUPS_PER_OFFERING === group)
          .map((member) => member.student.person.key),
      };
    }),
  );
}

/**
 * Only the current academic year gets a timetable. A past year's week-by-week
 * schedule is a great deal of rows nobody opens.
 */
export function planTimetableEvents(
  offerings: readonly PlannedOffering[],
  options: DemoSeedOptions,
): PlannedTimetableEvent[] {
  return offerings
    .filter((offering) => offering.term.yearOffset === 0)
    .flatMap((offering, index) =>
      WEEKLY_SLOTS.flatMap((slot) =>
        Array.from({ length: options.teachingWeeks }, (_, week) => {
          const startsAt = atUtcHour(
            addDays(addWeeks(offering.term.startsAt, week), slot.dayOfWeek),
            slot.hour,
          );

          return {
            offering,
            studyGroupKey: slot.type === 'seminar' ? `GRP-${offering.key}-1` : null,
            roomKey: roomFor(offering, index + week).key,
            type: slot.type,
            title: offering.course.title,
            startsAt,
            endsAt: addHours(startsAt, slot.hours),
          };
        }),
      ),
    );
}

export function planExamTerms(
  offerings: readonly PlannedOffering[],
  options: DemoSeedOptions,
): PlannedExamTerm[] {
  return offerings.flatMap((offering, index) => {
    const examiner = offering.course.teachers[0];
    if (!examiner) throw new Error(`course ${offering.course.code} has no teacher`);

    const regularStart = atUtcHour(
      addWeeks(offering.term.startsAt, options.teachingWeeks + 1),
      9,
    );

    return (
      [
        ['regular', regularStart],
        ['first_retake', addWeeks(regularStart, RETAKE_WEEKS_LATER)],
      ] as const
    ).map(([kind, startsAt]) => ({
      offering,
      roomKey: roomFor(offering, index).key,
      examinerKey: examiner.key,
      kind,
      startsAt,
      endsAt: addHours(startsAt, 3),
      capacity: options.studentsPerProgram,
      registrationOpensAt: addDays(startsAt, REGISTRATION_OPENS_DAYS_BEFORE),
      registrationClosesAt: addDays(startsAt, -2),
    }));
  });
}

const GRADE_DISTRIBUTION = [
  'A',
  'A',
  'B',
  'B',
  'B',
  'C',
  'C',
  'C',
  'D',
  'D',
  'E',
  'FX',
] as const satisfies readonly CourseGrade[];

/** Only finished terms carry an official result. */
export function planResults(
  enrollments: readonly PlannedEnrollment[],
  options: DemoSeedOptions,
): PlannedResult[] {
  const random = createRandom(options.seed + 7321);

  return enrollments
    .filter((enrollment) => enrollment.offering.term.isPast)
    .map((enrollment, index) => ({
      enrollment,
      grade: random.pick(GRADE_DISTRIBUTION),
      recordedAt: addDays(enrollment.offering.term.endsAt, -(index % 21) - 1),
    }));
}

function roomFor(offering: PlannedOffering, index: number): PlannedRoom {
  const rooms = offering.faculty.rooms;
  const room = rooms[index % rooms.length];
  if (!room) throw new Error(`faculty ${offering.faculty.code} has no rooms`);

  return room;
}

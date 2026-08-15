import { addDays, addWeeks, startOfAcademicYear } from './calendar';
import {
  BUILDINGS,
  DEPARTMENT_NAMES,
  FACULTY_CODES,
  FACULTY_NAMES,
  FAMILY_NAMES,
  GIVEN_NAMES,
  PROGRAM_NAMES,
  SUBJECTS,
} from './catalogue';
import { createRandom, type DeterministicRandom } from './deterministic-random';
import type { MockSisOptions } from './mock-sis.options';
import type {
  MockSisPlan,
  PlannedCourse,
  PlannedDepartment,
  PlannedFaculty,
  PlannedPerson,
  PlannedProgram,
  PlannedRoom,
  PlannedStudent,
  PlannedTerm,
} from './mock-sis.plan';

const CREDIT_OPTIONS = [3, 4, 5, 6] as const;
const EXAM_WEEKS = 7;

const pad = (value: number, width = 4): string => String(value).padStart(width, '0');

const cycle = <T>(items: readonly T[], index: number): T => items[index % items.length] as T;

export function buildPlan(options: MockSisOptions): MockSisPlan {
  const faculties: PlannedFaculty[] = [];
  const counters = { person: 0 };

  for (let index = 0; index < options.faculties; index += 1) {
    faculties.push(buildFaculty(options, index, counters));
  }

  return {
    university: {
      externalId: `OU-${options.universityCode}`,
      code: options.universityCode,
      name: options.universityName,
    },
    faculties,
    terms: buildTerms(options),
  };
}

function buildTerms(options: MockSisOptions): PlannedTerm[] {
  const terms: PlannedTerm[] = [];

  for (let offset = 1 - options.academicYears; offset <= 0; offset += 1) {
    const year = options.anchor.getUTCFullYear() + offset;
    const academicYear = `${year}/${year + 1}`;
    const winterStart = startOfAcademicYear(options.anchor, offset);
    const winterEnd = addWeeks(winterStart, options.teachingWeeks + EXAM_WEEKS);
    const summerStart = addDays(winterEnd, 1);
    const summerEnd = addWeeks(summerStart, options.teachingWeeks + EXAM_WEEKS);

    terms.push(
      term(options, `${year}W`, `Winter semester ${academicYear}`, 'semester', {
        academicYear,
        yearOffset: offset,
        startsAt: winterStart,
        endsAt: winterEnd,
      }),
      term(options, `${year}S`, `Summer semester ${academicYear}`, 'summer', {
        academicYear,
        yearOffset: offset,
        startsAt: summerStart,
        endsAt: summerEnd,
      }),
    );
  }

  return terms;
}

function term(
  options: MockSisOptions,
  code: string,
  name: string,
  kind: PlannedTerm['kind'],
  span: Pick<PlannedTerm, 'academicYear' | 'yearOffset' | 'startsAt' | 'endsAt'>,
): PlannedTerm {
  return {
    externalId: `TERM-${code}`,
    code,
    name,
    kind,
    ...span,
    isPast: span.endsAt < options.anchor,
    enrollmentOpensAt: addDays(span.startsAt, -28),
    enrollmentClosesAt: addDays(span.startsAt, 14),
  };
}

function buildFaculty(
  options: MockSisOptions,
  index: number,
  counters: { person: number },
): PlannedFaculty {
  const code = cycle(FACULTY_CODES, index);
  const externalId = `OU-${code}`;
  const random = createRandom(options.seed + index * 7919);

  const departments = Array.from({ length: options.departmentsPerFaculty }, (_, position) =>
    buildDepartment(options, externalId, code, position, index, counters),
  );

  const programs = Array.from({ length: options.programsPerFaculty }, (_, position) =>
    buildProgram(options, externalId, code, position, index, departments, counters),
  );

  return {
    externalId,
    code,
    name: cycle(FACULTY_NAMES, index),
    departments,
    programs,
    rooms: buildRooms(options, externalId, code, random),
  };
}

function buildDepartment(
  options: MockSisOptions,
  facultyExternalId: string,
  facultyCode: string,
  position: number,
  facultyIndex: number,
  counters: { person: number },
): PlannedDepartment {
  const code = `${facultyCode}-D${position + 1}`;
  const random = createRandom(options.seed + facultyIndex * 131 + position * 17);
  const teachers = Array.from({ length: options.teachersPerDepartment }, () => {
    counters.person += 1;

    return person(options, random, `PSN-T-${pad(counters.person)}`, {
      isStaff: true,
      isStudent: false,
      identifier: null,
    });
  });

  return {
    externalId: `OU-${code}`,
    facultyExternalId,
    code,
    name: cycle(DEPARTMENT_NAMES, facultyIndex * options.departmentsPerFaculty + position),
    teachers,
  };
}

function buildProgram(
  options: MockSisOptions,
  facultyExternalId: string,
  facultyCode: string,
  position: number,
  facultyIndex: number,
  departments: readonly PlannedDepartment[],
  counters: { person: number },
): PlannedProgram {
  const code = `${facultyCode}-P${position + 1}`;
  const externalId = `PRG-${code}`;
  const random = createRandom(options.seed + facultyIndex * 977 + position * 41);

  const students: PlannedStudent[] = Array.from(
    { length: options.studentsPerProgram },
    (_, seat) => {
      counters.person += 1;

      return {
        person: person(options, random, `PSN-S-${pad(counters.person)}`, {
          isStaff: false,
          isStudent: true,
          identifier: `${options.universityCode}${pad(counters.person, 6)}`,
        }),
        studyYear: (seat % options.studyYears) + 1,
      };
    },
  );

  return {
    externalId,
    facultyExternalId,
    code,
    name: cycle(PROGRAM_NAMES, facultyIndex * options.programsPerFaculty + position),
    standardLengthSemesters: options.studyYears * 2,
    courses: buildCourses(options, externalId, code, random, departments),
    students,
  };
}

function buildCourses(
  options: MockSisOptions,
  programExternalId: string,
  programCode: string,
  random: DeterministicRandom,
  departments: readonly PlannedDepartment[],
): PlannedCourse[] {
  const courses: PlannedCourse[] = [];
  const kinds: PlannedCourse['termKind'][] = ['semester', 'summer'];
  const subjectOffset = random.int(0, SUBJECTS.length - 1);

  for (let studyYear = 1; studyYear <= options.studyYears; studyYear += 1) {
    for (const termKind of kinds) {
      for (let slot = 0; slot < options.coursesPerStudyYearPerTerm; slot += 1) {
        const sequence = courses.length + 1;
        const department = cycle(departments, sequence);
        const teachers = [
          cycle(department.teachers, sequence),
          cycle(department.teachers, sequence + 1),
        ];

        courses.push({
          externalId: `CRS-${programCode}-${pad(sequence, 2)}`,
          departmentExternalId: department.externalId,
          programExternalId,
          code: `${programCode}${pad(sequence, 2)}`,
          title: cycle(SUBJECTS, subjectOffset + sequence),
          credits: random.pick(CREDIT_OPTIONS),
          studyYear,
          termKind,
          teachers,
        });
      }
    }
  }

  return courses;
}

function buildRooms(
  options: MockSisOptions,
  facultyExternalId: string,
  facultyCode: string,
  random: DeterministicRandom,
): PlannedRoom[] {
  return Array.from({ length: options.roomsPerFaculty }, (_, position) => {
    const code = `${facultyCode}-${pad(position + 1, 3)}`;

    return {
      externalId: `ROOM-${code}`,
      facultyExternalId,
      code,
      building: cycle(BUILDINGS, position),
      capacity: random.int(2, 12) * 10,
    };
  });
}

function person(
  options: MockSisOptions,
  random: DeterministicRandom,
  externalId: string,
  role: { isStaff: boolean; isStudent: boolean; identifier: string | null },
): PlannedPerson {
  const givenName = random.pick(GIVEN_NAMES);
  const familyName = random.pick(FAMILY_NAMES);
  const local = `${givenName}.${familyName}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const discriminator = externalId.replace(/\D/gu, '');

  return {
    externalId,
    givenName,
    familyName,
    email: `${local}${discriminator}@${options.emailDomain}`,
    isStaff: role.isStaff,
    isStudent: role.isStudent,
    studentIdentifier: role.identifier,
  };
}

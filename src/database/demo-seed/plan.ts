import type { AcademicTermKind } from '../schema';

/**
 * The university as a value, before any of it has an id.
 *
 * `key` is an in-memory natural key used to resolve a planned object to the
 * uuid its row was written under. It is never persisted: the provenance columns
 * that once carried it were dropped with the integration (ADR 0024).
 */
export interface PlannedPerson {
  readonly key: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly email: string;
  readonly isStudent: boolean;
  readonly isStaff: boolean;
}

export interface PlannedStudent {
  readonly person: PlannedPerson;
  readonly studyYear: number;
}

export interface PlannedRoom {
  readonly key: string;
  readonly facultyKey: string;
  readonly code: string;
  readonly building: string;
  readonly capacity: number;
}

export interface PlannedDepartment {
  readonly key: string;
  readonly facultyKey: string;
  readonly code: string;
  readonly name: string;
  readonly teachers: readonly PlannedPerson[];
}

export interface PlannedCourse {
  readonly key: string;
  readonly departmentKey: string;
  readonly programKey: string;
  readonly code: string;
  readonly title: string;
  readonly credits: number;
  readonly studyYear: number;
  readonly termKind: AcademicTermKind;
  readonly teachers: readonly PlannedPerson[];
}

export interface PlannedProgram {
  readonly key: string;
  readonly facultyKey: string;
  readonly code: string;
  readonly name: string;
  readonly standardLengthSemesters: number;
  readonly courses: readonly PlannedCourse[];
  readonly students: readonly PlannedStudent[];
}

export interface PlannedFaculty {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly departments: readonly PlannedDepartment[];
  readonly programs: readonly PlannedProgram[];
  readonly rooms: readonly PlannedRoom[];
}

export interface PlannedTerm {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly kind: AcademicTermKind;
  readonly academicYear: string;
  readonly yearOffset: number;
  readonly isPast: boolean;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly enrollmentOpensAt: Date;
  readonly enrollmentClosesAt: Date;
}

export interface DemoPlan {
  readonly university: {
    readonly key: string;
    readonly code: string;
    readonly name: string;
  };
  readonly faculties: readonly PlannedFaculty[];
  readonly terms: readonly PlannedTerm[];
}

export function allPrograms(plan: DemoPlan): PlannedProgram[] {
  return plan.faculties.flatMap((faculty) => faculty.programs);
}

export function allCourses(plan: DemoPlan): PlannedCourse[] {
  return allPrograms(plan).flatMap((program) => program.courses);
}

export function allDepartments(plan: DemoPlan): PlannedDepartment[] {
  return plan.faculties.flatMap((faculty) => faculty.departments);
}

export function allRooms(plan: DemoPlan): PlannedRoom[] {
  return plan.faculties.flatMap((faculty) => faculty.rooms);
}

export function allPersons(plan: DemoPlan): PlannedPerson[] {
  const teachers = allDepartments(plan).flatMap((department) => department.teachers);
  const students = allPrograms(plan).flatMap((program) =>
    program.students.map((student) => student.person),
  );

  return [...teachers, ...students];
}

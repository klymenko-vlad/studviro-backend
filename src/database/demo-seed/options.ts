/**
 * Shape of the synthetic university the demo seed writes.
 *
 * Recovered from the deleted `mock-sis` connector: it was the only realistic
 * synthetic university this project had, and the dataset outlived the
 * integration premise that produced it (ADR 0024). What changed is the
 * destination — it wrote `ConnectorRecord`s for an importer to apply, and now
 * it writes canonical rows.
 */
export interface DemoSeedOptions {
  readonly seed: number;
  /** Everything is positioned relative to this instant, so the data stays current. */
  readonly anchor: Date;
  readonly universityCode: string;
  readonly universityName: string;
  readonly emailDomain: string;
  readonly academicYears: number;
  readonly faculties: number;
  readonly departmentsPerFaculty: number;
  readonly programsPerFaculty: number;
  readonly studyYears: number;
  readonly coursesPerStudyYearPerTerm: number;
  readonly studentsPerProgram: number;
  readonly teachersPerDepartment: number;
  readonly roomsPerFaculty: number;
  readonly teachingWeeks: number;
}

export const DEFAULT_DEMO_SEED_OPTIONS: DemoSeedOptions = {
  seed: 20_260_901,
  anchor: new Date('2026-10-15T00:00:00.000Z'),
  universityCode: 'MOCKU',
  universityName: 'Mock University of Košice',
  emailDomain: 'mocku.example',
  academicYears: 2,
  faculties: 3,
  departmentsPerFaculty: 3,
  programsPerFaculty: 2,
  studyYears: 3,
  coursesPerStudyYearPerTerm: 2,
  studentsPerProgram: 24,
  teachersPerDepartment: 3,
  roomsPerFaculty: 4,
  teachingWeeks: 13,
};

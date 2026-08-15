export interface MockSisOptions {
  readonly name: string;
  readonly seed: number;
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

export const MOCK_SIS_OPTIONS = Symbol('MOCK_SIS_OPTIONS');

export const DEFAULT_MOCK_SIS_OPTIONS: MockSisOptions = {
  name: 'mock-sis',
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

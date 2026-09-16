export interface MockLmsOptions {
  readonly name: string;
  readonly anchor: Date;
  readonly baseUrl: string;
  readonly activitiesPerSpace: number;
  readonly teachingWeeks: number;
  readonly hiddenSpaceEvery: number;
  /**
   * How far into teaching the fixture sits. Deadlines are laid out from
   * `anchor - weeksElapsed` forward, so a term in progress has work already
   * handed in behind it as well as work still to come.
   */
  readonly weeksElapsed: number;
  readonly assessmentMaxPoints: number;
}

export const MOCK_LMS_OPTIONS = Symbol('MOCK_LMS_OPTIONS');

export const DEFAULT_MOCK_LMS_OPTIONS: MockLmsOptions = {
  name: 'mock-lms',
  anchor: new Date('2026-09-21T00:00:00.000Z'),
  baseUrl: 'https://moodle.mocku.example',
  activitiesPerSpace: 4,
  teachingWeeks: 13,
  hiddenSpaceEvery: 17,
  weeksElapsed: 6,
  assessmentMaxPoints: 100,
};

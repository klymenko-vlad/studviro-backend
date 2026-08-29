import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MyCourseResultRow,
  MyCourseResultsRepository,
} from './my-course-results.repository';
import { MyCourseResultsService } from './my-course-results.service';

const row = (overrides: Partial<MyCourseResultRow> = {}): MyCourseResultRow => ({
  resultId: 'result-1',
  status: 'official',
  calculatedPoints: '87.5000',
  calculatedGrade: 'B',
  proposedGrade: 'B',
  proposedAt: new Date('2026-06-01T00:00:00.000Z'),
  officialGrade: 'A',
  officialRecordedAt: new Date('2026-06-10T00:00:00.000Z'),
  conflictNote: null,
  sourceSystem: 'sis',
  externalId: 'sis-result-1',
  sourceUpdatedAt: new Date('2026-06-11T00:00:00.000Z'),
  lastSynchronizedAt: new Date('2026-06-12T00:00:00.000Z'),
  synchronizationStatus: 'in_sync',
  enrollmentId: 'enrollment-1',
  attempt: 1,
  offeringId: 'offering-1',
  courseId: 'course-1',
  courseCode: 'INF/ALG/22',
  courseTitle: 'Algorithms',
  credits: '6.00',
  termId: 'term-1',
  termCode: '2026-SS',
  termName: 'Summer 2026',
  academicYear: '2025/2026',
  termStartsAt: new Date('2026-02-01T00:00:00.000Z'),
  ...overrides,
});

describe(MyCourseResultsService.name, () => {
  const findMyResults = vi.fn();
  const repository = { findMyResults } as unknown as MyCourseResultsRepository;
  let service: MyCourseResultsService;

  beforeEach(() => {
    service = new MyCourseResultsService(repository);
  });

  it('reads points and credits as numbers rather than the numeric columns’ strings', async () => {
    findMyResults.mockResolvedValue([row()]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.calculated.points).toBe(87.5);
    expect(result!.course.credits).toBe(6);
  });

  it('leaves points null when nothing was calculated', async () => {
    findMyResults.mockResolvedValue([row({ calculatedPoints: null, credits: null })]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.calculated.points).toBeNull();
    expect(result!.course.credits).toBeNull();
  });

  it('takes the official grade as the effective one when it exists', async () => {
    findMyResults.mockResolvedValue([row()]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.effective).toEqual({ kind: 'official', grade: 'A' });
  });

  it('falls back to the proposed grade while none is official yet', async () => {
    findMyResults.mockResolvedValue([
      row({ status: 'proposed', officialGrade: null, officialRecordedAt: null }),
    ]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.effective).toEqual({ kind: 'proposed', grade: 'B' });
  });

  it('falls back to the calculated grade when neither was published nor proposed', async () => {
    findMyResults.mockResolvedValue([
      row({
        status: 'calculated',
        officialGrade: null,
        officialRecordedAt: null,
        proposedGrade: null,
        proposedAt: null,
      }),
    ]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.effective).toEqual({ kind: 'calculated', grade: 'B' });
  });

  it('reports no effective grade when the record carries none of the three', async () => {
    findMyResults.mockResolvedValue([
      row({
        status: 'calculated',
        calculatedGrade: null,
        officialGrade: null,
        officialRecordedAt: null,
        proposedGrade: null,
        proposedAt: null,
      }),
    ]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.effective).toBeNull();
  });

  it('carries the provenance of the record so a reader can see where the grade came from', async () => {
    findMyResults.mockResolvedValue([row()]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.provenance).toEqual({
      sourceSystem: 'sis',
      externalId: 'sis-result-1',
      sourceUpdatedAt: new Date('2026-06-11T00:00:00.000Z'),
      lastSynchronizedAt: new Date('2026-06-12T00:00:00.000Z'),
      synchronizationStatus: 'in_sync',
    });
  });

  it('passes the caller’s filter through to the repository', async () => {
    findMyResults.mockResolvedValue([]);

    await service.listMine('institution-1', 'student-1', { offeringId: 'offering-1' });

    expect(findMyResults).toHaveBeenCalledWith('institution-1', 'student-1', {
      offeringId: 'offering-1',
    });
  });
});

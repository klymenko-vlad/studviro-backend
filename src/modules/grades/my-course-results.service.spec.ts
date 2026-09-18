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

    expect(result!.effective).toEqual({ kind: 'official', grade: 'A', passed: true });
  });

  it('falls back to the proposed grade while none is official yet', async () => {
    findMyResults.mockResolvedValue([
      row({ status: 'proposed', officialGrade: null, officialRecordedAt: null }),
    ]);

    const [result] = await service.listMine('institution-1', 'student-1');

    expect(result!.effective).toEqual({ kind: 'proposed', grade: 'B', passed: true });
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

    expect(result!.effective).toEqual({ kind: 'calculated', grade: 'B', passed: true });
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

  describe('an annulled result', () => {
    it('shows no effective grade, because the registrar struck it', async () => {
      findMyResults.mockResolvedValue([row({ status: 'annulled' })]);

      const [result] = await service.listMine('institution-1', 'student-1');

      expect(result!.effective).toBeNull();
      expect(result!.isVoided).toBe(true);
    });

    it('keeps the grade columns on the record, so the history is still readable', async () => {
      findMyResults.mockResolvedValue([row({ status: 'annulled' })]);

      const [result] = await service.listMine('institution-1', 'student-1');

      expect(result!.official.grade).toBe('A');
    });

    it.each(['official', 'corrected', 'disputed'] as const)(
      'still lets a %s result speak',
      async (status) => {
        findMyResults.mockResolvedValue([row({ status })]);

        const [result] = await service.listMine('institution-1', 'student-1');

        expect(result!.effective).toMatchObject({ grade: 'A' });
      },
    );
  });

  describe('pass and fail', () => {
    it.each(['A', 'B', 'C', 'D', 'E', 'passed'] as const)(
      'counts %s as a pass',
      async (grade) => {
        findMyResults.mockResolvedValue([row({ officialGrade: grade })]);

        const [result] = await service.listMine('institution-1', 'student-1');

        expect(result!.effective?.passed).toBe(true);
      },
    );

    it.each(['FX', 'failed'] as const)('counts %s as a fail', async (grade) => {
      findMyResults.mockResolvedValue([row({ officialGrade: grade })]);

      const [result] = await service.listMine('institution-1', 'student-1');

      expect(result!.effective?.passed).toBe(false);
    });
  });
});

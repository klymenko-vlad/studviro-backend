import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MyAssessmentResultRow,
  MyAssessmentResultsRepository,
} from './my-assessment-results.repository';
import { MyAssessmentResultsService } from './my-assessment-results.service';

const row = (overrides: Partial<MyAssessmentResultRow> = {}): MyAssessmentResultRow => ({
  id: 'result-1',
  assessmentId: 'assessment-1',
  name: 'Assignment 1',
  points: '72.0000',
  maxPoints: '100.0000',
  normalizedScore: '0.7200',
  feedback: null,
  gradedAt: new Date('2026-11-10T21:00:00.000Z'),
  countsTowardFinalGrade: true,
  activityId: 'activity-1',
  activityType: 'assignment',
  activityUrl: 'https://lms.example/mod/assignment/view.php?idnumber=A1',
  dueAt: new Date('2026-11-05T21:00:00.000Z'),
  submissionState: 'graded',
  submittedAt: new Date('2026-11-05T12:00:00.000Z'),
  submissionIsLate: false,
  completionState: 'complete',
  spaceId: 'space-1',
  spaceName: 'Programming 2',
  offeringId: 'offering-1',
  ...overrides,
});

describe(MyAssessmentResultsService.name, () => {
  const findMine = vi.fn();
  const repository = { findMine } as unknown as MyAssessmentResultsRepository;
  let service: MyAssessmentResultsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MyAssessmentResultsService(repository);
  });

  const listOne = async (overrides: Partial<MyAssessmentResultRow> = {}) => {
    findMine.mockResolvedValue([row(overrides)]);
    const [result] = await service.listMine('institution-1', 'student-1', {});

    return result;
  };

  it('passes the offering filter through to the repository', async () => {
    findMine.mockResolvedValue([]);

    await service.listMine('institution-1', 'student-1', { offeringId: 'offering-1' });

    expect(findMine).toHaveBeenCalledWith('institution-1', 'student-1', {
      offeringId: 'offering-1',
    });
  });

  it('turns the stored numerics into numbers a screen can render', async () => {
    await expect(listOne()).resolves.toMatchObject({
      points: 72,
      maxPoints: 100,
      percentage: 72,
    });
  });

  it('derives a percentage from points when the importer stored no normalized score', async () => {
    await expect(listOne({ normalizedScore: null })).resolves.toMatchObject({
      percentage: 72,
    });
  });

  it('reports no percentage when there is no maximum to divide by', async () => {
    await expect(listOne({ normalizedScore: null, maxPoints: null })).resolves.toMatchObject({
      percentage: null,
    });
  });

  it('refuses to divide by a zero maximum', async () => {
    await expect(
      listOne({ normalizedScore: null, maxPoints: '0.0000' }),
    ).resolves.toMatchObject({ percentage: null });
  });

  it('carries the submission and completion the mark was awarded on', async () => {
    await expect(listOne()).resolves.toMatchObject({
      activity: {
        id: 'activity-1',
        completionState: 'complete',
        submission: { state: 'graded', isLate: false },
      },
    });
  });

  it('reports an ungraded mark without inventing a score', async () => {
    await expect(listOne({ points: null, normalizedScore: null })).resolves.toMatchObject({
      points: null,
      percentage: null,
    });
  });

  it('keeps a gradebook column that hangs off no activity', async () => {
    await expect(
      listOne({ activityId: null, activityType: null, dueAt: null }),
    ).resolves.toMatchObject({ activity: null, learningSpace: { name: 'Programming 2' } });
  });

  it('keeps a space that no offering was matched to', async () => {
    await expect(listOne({ offeringId: null })).resolves.toMatchObject({ offering: null });
  });
});

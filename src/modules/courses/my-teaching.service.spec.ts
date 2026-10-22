import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MyTeachingRepository, TeachingOfferingRow } from './my-teaching.repository';
import { MyTeachingService } from './my-teaching.service';

const row = (overrides: Partial<TeachingOfferingRow> = {}): TeachingOfferingRow => ({
  assignmentId: 'assignment-1',
  role: 'lecturer',
  isPrimary: true,
  offeringId: 'offering-1',
  offeringStatus: 'running',
  language: 'sk',
  capacity: 120,
  courseId: 'course-1',
  courseCode: 'INF/ALG/22',
  courseTitle: 'Algorithms',
  courseDescription: null,
  credits: '6.00',
  termId: 'term-1',
  termCode: '2026-SS',
  termName: 'Summer 2026',
  academicYear: '2025/2026',
  termStartsAt: new Date('2026-02-01T00:00:00.000Z'),
  termEndsAt: new Date('2026-06-30T00:00:00.000Z'),
  ...overrides,
});

describe(MyTeachingService.name, () => {
  const findTeachingOfferings = vi.fn();
  const countEnrollments = vi.fn();
  const repository = {
    findTeachingOfferings,
    countEnrollments,
  } as unknown as MyTeachingRepository;
  let service: MyTeachingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MyTeachingService(repository);
  });

  it('reads credits as a number rather than the numeric column’s string', async () => {
    findTeachingOfferings.mockResolvedValue([row()]);
    countEnrollments.mockResolvedValue([]);

    const [offering] = await service.listTeaching('institution-1', 'teacher-1');

    expect(offering!.course.credits).toBe(6);
  });

  it('attaches each offering’s own enrolment count', async () => {
    findTeachingOfferings.mockResolvedValue([
      row(),
      row({ assignmentId: 'assignment-2', offeringId: 'offering-2' }),
    ]);
    countEnrollments.mockResolvedValue([
      { courseOfferingId: 'offering-2', enrolled: 12 },
      { courseOfferingId: 'offering-1', enrolled: 34 },
    ]);

    const offerings = await service.listTeaching('institution-1', 'teacher-1');

    expect(offerings.map((offering) => offering.enrolledCount)).toEqual([34, 12]);
  });

  it('counts an offering nobody enrolled in as zero rather than leaving it unknown', async () => {
    findTeachingOfferings.mockResolvedValue([row()]);
    countEnrollments.mockResolvedValue([]);

    const [offering] = await service.listTeaching('institution-1', 'teacher-1');

    expect(offering!.enrolledCount).toBe(0);
  });

  it('asks for each offering’s enrolments only once', async () => {
    findTeachingOfferings.mockResolvedValue([row(), row({ assignmentId: 'assignment-2' })]);
    countEnrollments.mockResolvedValue([]);

    await service.listTeaching('institution-1', 'teacher-1');

    expect(countEnrollments).toHaveBeenCalledWith(['offering-1']);
  });

  it('does not count enrolments when the caller teaches nothing', async () => {
    findTeachingOfferings.mockResolvedValue([]);

    expect(await service.listTeaching('institution-1', 'teacher-1')).toEqual([]);
    expect(countEnrollments).not.toHaveBeenCalled();
  });

  it('passes the term filter through to the repository', async () => {
    findTeachingOfferings.mockResolvedValue([]);

    await service.listTeaching('institution-1', 'teacher-1', { termId: 'term-9' });

    expect(findTeachingOfferings).toHaveBeenCalledWith('institution-1', 'teacher-1', {
      termId: 'term-9',
    });
  });
});

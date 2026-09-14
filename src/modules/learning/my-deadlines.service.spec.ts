import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import type { MyDeadlineRow, MyDeadlinesRepository } from './my-deadlines.repository';
import { MAX_DEADLINE_RANGE_DAYS, MyDeadlinesService } from './my-deadlines.service';

const row = (overrides: Partial<MyDeadlineRow> = {}): MyDeadlineRow => ({
  activityId: 'activity-1',
  type: 'assignment',
  name: 'Assignment 1',
  url: 'https://lms.example/mod/assignment/view.php?idnumber=A1',
  opensAt: new Date('2026-10-29T21:00:00.000Z'),
  dueAt: new Date('2026-11-05T21:00:00.000Z'),
  teaching: false,
  spaceId: 'space-1',
  spaceName: 'Programming 2',
  spaceUrl: 'https://lms.example/course/view.php?idnumber=CRS-1',
  offeringId: 'offering-1',
  courseId: 'course-1',
  courseCode: 'INF/PF/22',
  courseTitle: 'Programming 2',
  termId: 'term-1',
  termCode: '2026-WS',
  termName: 'Winter 2026',
  sourceSystem: 'lms',
  externalId: 'CRS-1-A1',
  lastSynchronizedAt: new Date('2026-10-20T00:00:00.000Z'),
  synchronizationStatus: 'in_sync',
  ...overrides,
});

const range = {
  from: new Date('2026-11-02T00:00:00.000Z'),
  to: new Date('2026-11-09T00:00:00.000Z'),
};

describe(MyDeadlinesService.name, () => {
  const findMyDeadlines = vi.fn();
  const repository = { findMyDeadlines } as unknown as MyDeadlinesRepository;
  let service: MyDeadlinesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MyDeadlinesService(repository);
  });

  const list = (now = new Date('2026-11-03T09:00:00.000Z')) =>
    service.listMine('institution-1', 'student-1', range, now);

  it('composes the learning space and the course a deadline belongs to', async () => {
    findMyDeadlines.mockResolvedValue([row()]);

    const [deadline] = await list();

    expect(deadline).toMatchObject({
      id: 'activity-1',
      name: 'Assignment 1',
      type: 'assignment',
      attendance: 'enrolled',
      learningSpace: { id: 'space-1', name: 'Programming 2' },
      course: { code: 'INF/PF/22', title: 'Programming 2' },
      term: { code: '2026-WS' },
      provenance: { sourceSystem: 'lms', synchronizationStatus: 'in_sync' },
    });
  });

  it('marks a deadline that has not passed as open', async () => {
    findMyDeadlines.mockResolvedValue([row()]);

    const [deadline] = await list();

    expect(deadline).toMatchObject({ isOverdue: false, isOpen: true });
  });

  it('marks a deadline whose date has passed as overdue', async () => {
    findMyDeadlines.mockResolvedValue([row()]);

    const [deadline] = await list(new Date('2026-11-06T09:00:00.000Z'));

    expect(deadline).toMatchObject({ isOverdue: true, isOpen: false });
  });

  it('does not call an activity open before it opens', async () => {
    findMyDeadlines.mockResolvedValue([row()]);

    const [deadline] = await list(new Date('2026-10-20T09:00:00.000Z'));

    expect(deadline).toMatchObject({ isOpen: false, isOverdue: false });
  });

  it('reports a deadline on a course the caller teaches as teaching', async () => {
    findMyDeadlines.mockResolvedValue([row({ teaching: true })]);

    const [deadline] = await list();

    expect(deadline?.attendance).toBe('teaching');
  });

  it('rejects a range that ends before it starts', async () => {
    await expect(
      service.listMine('institution-1', 'student-1', { from: range.to, to: range.from }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('rejects a range longer than the cap', async () => {
    const to = new Date(range.from.getTime() + (MAX_DEADLINE_RANGE_DAYS + 1) * 86_400_000);

    await expect(
      service.listMine('institution-1', 'student-1', { from: range.from, to }),
    ).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('returns nothing when the caller has no dated activity in the range', async () => {
    findMyDeadlines.mockResolvedValue([]);

    await expect(list()).resolves.toEqual([]);
  });
});

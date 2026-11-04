import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';
import type { Restriction } from '../../database/schema';

import type { AvailabilityService } from './learning-availability.service';
import type { MyDeadlineRow, MyDeadlinesRepository } from './my-deadlines.repository';
import { MAX_DEADLINE_RANGE_DAYS, MyDeadlinesService } from './my-deadlines.service';

const row = (overrides: Partial<MyDeadlineRow> = {}): MyDeadlineRow => ({
  activityId: 'activity-1',
  type: 'assignment',
  name: 'Assignment 1',
  brief: 'Hand in the sorting exercise',
  opensAt: new Date('2026-10-29T21:00:00.000Z'),
  dueAt: new Date('2026-11-05T21:00:00.000Z'),
  teaching: false,
  submissionState: null,
  submittedAt: null,
  submissionIsLate: null,
  spaceId: 'space-1',
  spaceName: 'Programming 2',
  offeringId: 'offering-1',
  courseId: 'course-1',
  courseCode: 'INF/PF/22',
  courseTitle: 'Programming 2',
  termId: 'term-1',
  termCode: '2026-WS',
  termName: 'Winter 2026',
  sectionId: null,
  visible: true,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  restriction: null,
  sectionRestriction: null,
  ...overrides,
});

const LOCK: Restriction = {
  match: 'all',
  hideWhenLocked: false,
  conditions: [{ type: 'group', groupId: 'group-1' }],
};

const range = {
  from: new Date('2026-11-02T00:00:00.000Z'),
  to: new Date('2026-11-09T00:00:00.000Z'),
};

describe(MyDeadlinesService.name, () => {
  const findMyDeadlines = vi.fn();
  const repository = { findMyDeadlines } as unknown as MyDeadlinesRepository;
  const openItems = vi.fn();
  const availability = { openItems } as unknown as AvailabilityService;
  let service: MyDeadlinesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MyDeadlinesService(repository, availability);
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

  it('asks about restricted deadlines only, once per course page, as a student', async () => {
    const free = row({ activityId: 'free' });
    const locked = row({ activityId: 'locked', restriction: LOCK });
    const unlocked = row({ activityId: 'unlocked', sectionRestriction: LOCK });
    const elsewhere = row({ activityId: 'elsewhere', spaceId: 'space-2', restriction: LOCK });
    const taught = row({ activityId: 'taught', teaching: true, restriction: LOCK });
    findMyDeadlines.mockResolvedValue([free, locked, unlocked, elsewhere, taught]);
    openItems.mockImplementation((_viewer, items: MyDeadlineRow[]) =>
      Promise.resolve(items.filter((item) => item !== locked)),
    );

    const ids = (await list()).map((deadline) => deadline.id);

    expect(ids).toEqual(['free', 'unlocked', 'elsewhere', 'taught']);
    expect(openItems).toHaveBeenCalledTimes(2);
    expect(openItems).toHaveBeenCalledWith(
      {
        spaceId: 'space-1',
        offeringId: 'offering-1',
        stance: 'participant',
        userId: 'student-1',
      },
      [locked, unlocked],
      expect.any(Date),
    );
  });

  it('does not ask at all when nothing is restricted', async () => {
    findMyDeadlines.mockResolvedValue([row()]);

    await list();

    expect(openItems).not.toHaveBeenCalled();
  });
});

describe(`${MyDeadlinesService.name} submissions`, () => {
  const findMyDeadlines = vi.fn();
  const repository = { findMyDeadlines } as unknown as MyDeadlinesRepository;
  const service = new MyDeadlinesService(repository, {} as AvailabilityService);
  const now = new Date('2026-11-06T09:00:00.000Z');

  const listOne = async (overrides: Partial<MyDeadlineRow>) => {
    findMyDeadlines.mockResolvedValue([row(overrides)]);
    const [deadline] = await service.listMine('institution-1', 'student-1', range, now);

    return deadline;
  };

  it('reports nothing handed in as no submission at all', async () => {
    await expect(listOne({})).resolves.toMatchObject({ isOverdue: true, submission: null });
  });

  it('carries the state and the moment the work was handed in', async () => {
    const submittedAt = new Date('2026-11-05T18:00:00.000Z');

    await expect(
      listOne({ submissionState: 'submitted', submittedAt, submissionIsLate: false }),
    ).resolves.toMatchObject({
      isOverdue: true,
      submission: { state: 'submitted', submittedAt, isLate: false },
    });
  });

  it('keeps a late hand-in distinguishable from a punctual one', async () => {
    await expect(
      listOne({
        submissionState: 'graded',
        submittedAt: new Date('2026-11-06T03:00:00.000Z'),
        submissionIsLate: true,
      }),
    ).resolves.toMatchObject({ submission: { state: 'graded', isLate: true } });
  });

  it('treats a missing lateness flag as on time rather than as unknown', async () => {
    await expect(
      listOne({ submissionState: 'draft', submittedAt: null, submissionIsLate: null }),
    ).resolves.toMatchObject({ submission: { state: 'draft', isLate: false } });
  });
});

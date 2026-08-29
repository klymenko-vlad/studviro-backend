import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import type {
  MyTimetableEventRow,
  MyTimetableEventsRepository,
} from './my-timetable-events.repository';
import { MyTimetableEventsService } from './my-timetable-events.service';

const row = (overrides: Partial<MyTimetableEventRow> = {}): MyTimetableEventRow => ({
  eventId: 'event-1',
  type: 'lecture',
  title: 'Algorithms',
  startsAt: new Date('2026-03-02T08:00:00.000Z'),
  endsAt: new Date('2026-03-02T10:00:00.000Z'),
  cancelledAt: null,
  teaching: false,
  roomId: 'room-1',
  roomCode: 'P1',
  roomName: 'Lecture hall',
  roomBuilding: 'Jesenná 5',
  studyGroupId: null,
  studyGroupCode: null,
  studyGroupName: null,
  studyGroupKind: null,
  offeringId: 'offering-1',
  courseId: 'course-1',
  courseCode: 'INF/ALG/22',
  courseTitle: 'Algorithms',
  termId: 'term-1',
  termCode: '2026-SS',
  termName: 'Summer 2026',
  sourceSystem: 'sis',
  externalId: 'TTE-1',
  sourceUpdatedAt: new Date('2026-02-20T00:00:00.000Z'),
  lastSynchronizedAt: new Date('2026-02-21T00:00:00.000Z'),
  synchronizationStatus: 'in_sync',
  ...overrides,
});

const range = {
  from: new Date('2026-03-02T00:00:00.000Z'),
  to: new Date('2026-03-09T00:00:00.000Z'),
};

describe(MyTimetableEventsService.name, () => {
  const findMyEvents = vi.fn();
  const repository = { findMyEvents } as unknown as MyTimetableEventsRepository;
  let service: MyTimetableEventsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MyTimetableEventsService(repository);
  });

  it('composes the room and course an event belongs to', async () => {
    findMyEvents.mockResolvedValue([row()]);

    const [event] = await service.listMine('institution-1', 'student-1', range);

    expect(event!.room).toEqual({
      id: 'room-1',
      code: 'P1',
      name: 'Lecture hall',
      building: 'Jesenná 5',
    });
    expect(event!.course).toEqual({
      id: 'course-1',
      code: 'INF/ALG/22',
      title: 'Algorithms',
    });
  });

  it('reports no room when the event was imported without one', async () => {
    findMyEvents.mockResolvedValue([
      row({ roomId: null, roomCode: null, roomName: null, roomBuilding: null }),
    ]);

    const [event] = await service.listMine('institution-1', 'student-1', range);

    expect(event!.room).toBeNull();
  });

  it('names the study group when the event is restricted to one', async () => {
    findMyEvents.mockResolvedValue([
      row({
        studyGroupId: 'group-1',
        studyGroupCode: 'S1',
        studyGroupName: 'Monday seminar',
        studyGroupKind: 'seminar',
      }),
    ]);

    const [event] = await service.listMine('institution-1', 'student-1', range);

    expect(event!.studyGroup).toEqual({
      id: 'group-1',
      code: 'S1',
      name: 'Monday seminar',
      kind: 'seminar',
    });
  });

  it('tells a teacher’s own class apart from one they attend', async () => {
    findMyEvents.mockResolvedValue([row(), row({ eventId: 'event-2', teaching: true })]);

    const events = await service.listMine('institution-1', 'teacher-1', range);

    expect(events.map((event) => event.attendance)).toEqual(['enrolled', 'teaching']);
  });

  it('marks a cancelled event so the client need not compare dates', async () => {
    findMyEvents.mockResolvedValue([
      row({ cancelledAt: new Date('2026-03-01T00:00:00.000Z') }),
    ]);

    const [event] = await service.listMine('institution-1', 'student-1', range);

    expect(event!.isCancelled).toBe(true);
  });

  it('carries the provenance of the imported event', async () => {
    findMyEvents.mockResolvedValue([row()]);

    const [event] = await service.listMine('institution-1', 'student-1', range);

    expect(event!.provenance).toEqual({
      sourceSystem: 'sis',
      externalId: 'TTE-1',
      sourceUpdatedAt: new Date('2026-02-20T00:00:00.000Z'),
      lastSynchronizedAt: new Date('2026-02-21T00:00:00.000Z'),
      synchronizationStatus: 'in_sync',
    });
  });

  it('passes the caller’s filter through to the repository', async () => {
    findMyEvents.mockResolvedValue([]);

    await service.listMine('institution-1', 'student-1', { ...range, type: 'seminar' });

    expect(findMyEvents).toHaveBeenCalledWith('institution-1', 'student-1', {
      ...range,
      type: 'seminar',
    });
  });

  it('refuses a range that ends before it starts', async () => {
    await expect(
      service.listMine('institution-1', 'student-1', { from: range.to, to: range.from }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(findMyEvents).not.toHaveBeenCalled();
  });

  it('refuses a range longer than a quarter, which is not a calendar view', async () => {
    await expect(
      service.listMine('institution-1', 'student-1', {
        from: range.from,
        to: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(InvalidInputError);
    expect(findMyEvents).not.toHaveBeenCalled();
  });

  it('accepts a range exactly as long as the maximum', async () => {
    findMyEvents.mockResolvedValue([]);

    await service.listMine('institution-1', 'student-1', {
      from: new Date('2026-03-02T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
    });

    expect(findMyEvents).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from 'vitest';

import type { MyDeadline } from '../learning/my-deadlines.service';
import type { MyExamTerm } from '../scheduling/my-exam-terms.service';
import type { MyTimetableEvent } from '../scheduling/my-timetable-events.service';

import { toCalendarEntries } from './calendar-entries';
import { calendarLabels } from './calendar-labels';

const course = { id: 'course-1', code: 'INF/ALG', title: 'Algorithms' };
const term = { id: 'term-1', code: '2026-WS', name: 'Winter 2026' };

const lecture = {
  id: 'event-1',
  type: 'lecture',
  title: null,
  startsAt: new Date('2026-10-20T08:00:00.000Z'),
  endsAt: new Date('2026-10-20T09:30:00.000Z'),
  cancelledAt: null,
  isCancelled: false,
  attendance: 'enrolled',
  room: { id: 'room-1', code: 'P1', name: null, building: 'Jesenná 5' },
  studyGroup: null,
  offering: { id: 'offering-1' },
  course,
  term,
} as MyTimetableEvent;

const exam = (overrides: Partial<MyExamTerm>): MyExamTerm =>
  ({
    id: 'exam-1',
    kind: 'regular',
    startsAt: new Date('2026-12-28T09:00:00.000Z'),
    endsAt: null,
    isCancelled: false,
    attendance: 'enrolled',
    myRegistration: {
      id: 'reg-1',
      status: 'registered',
      registeredAt: null,
      cancelledAt: null,
    },
    room: null,
    course,
    term,
    ...overrides,
  }) as MyExamTerm;

const deadline = {
  id: 'activity-1',
  type: 'assignment',
  name: 'Assignment 2',
  dueAt: new Date('2026-11-02T00:00:00.000Z'),
  course,
  term,
} as MyDeadline;

const en = calendarLabels('en');

describe('toCalendarEntries', () => {
  it('turns a class into a timed event named after its course and type', () => {
    const [entry] = toCalendarEntries({ timetable: [lecture], exams: [], deadlines: [] }, en);

    expect(entry).toMatchObject({
      uid: 'timetable-event-1@studviro',
      summary: 'Algorithms – Lecture',
      location: 'P1, Jesenná 5',
      startsAt: lecture.startsAt,
      endsAt: lecture.endsAt,
      cancelled: false,
    });
  });

  it('prefers the title the timetable gave a class', () => {
    const [entry] = toCalendarEntries(
      { timetable: [{ ...lecture, title: 'Algorithms seminar' }], exams: [], deadlines: [] },
      en,
    );

    expect(entry?.summary).toBe('Algorithms seminar');
  });

  it('keeps a cancelled class, marked cancelled, so a subscribed calendar drops it', () => {
    const [entry] = toCalendarEntries(
      { timetable: [{ ...lecture, isCancelled: true }], exams: [], deadlines: [] },
      en,
    );

    expect(entry?.cancelled).toBe(true);
  });

  it('includes an exam term only when the student holds a seat on it', () => {
    const entries = toCalendarEntries(
      {
        timetable: [],
        exams: [
          exam({ id: 'held' }),
          exam({ id: 'open', myRegistration: null }),
          exam({
            id: 'given-up',
            myRegistration: {
              id: 'reg-2',
              status: 'cancelled',
              registeredAt: null,
              cancelledAt: null,
            },
          }),
        ],
        deadlines: [],
      },
      en,
    );

    expect(entries.map((entry) => entry.uid)).toEqual(['exam-term-held@studviro']);
    expect(entries[0]?.summary).toBe('Exam: Algorithms (regular term)');
  });

  it('includes every exam term a teacher examines', () => {
    const entries = toCalendarEntries(
      {
        timetable: [],
        exams: [exam({ attendance: 'teaching', myRegistration: null })],
        deadlines: [],
      },
      en,
    );

    expect(entries).toHaveLength(1);
  });

  it('keeps an exam with no recorded end as a moment rather than inventing a length', () => {
    const [ends] = toCalendarEntries(
      {
        timetable: [],
        exams: [exam({ endsAt: new Date('2026-12-28T11:00:00.000Z') })],
        deadlines: [],
      },
      en,
    );
    const [open] = toCalendarEntries({ timetable: [], exams: [exam({})], deadlines: [] }, en);

    expect(ends?.endsAt).toEqual(new Date('2026-12-28T11:00:00.000Z'));
    expect(open?.endsAt).toBeNull();
  });

  it('writes a deadline as a moment at the due time', () => {
    const [entry] = toCalendarEntries({ timetable: [], exams: [], deadlines: [deadline] }, en);

    expect(entry).toMatchObject({
      uid: 'deadline-activity-1@studviro',
      summary: 'Due: Assignment 2 (Algorithms)',
      startsAt: deadline.dueAt,
      endsAt: null,
    });
  });

  it('speaks Slovak to a Slovak reader', () => {
    const entries = toCalendarEntries(
      { timetable: [lecture], exams: [exam({})], deadlines: [deadline] },
      calendarLabels('sk'),
    );

    expect(entries.map((entry) => entry.summary)).toEqual([
      'Algorithms – Prednáška',
      'Skúška: Algorithms (riadny termín)',
      'Termín odovzdania: Assignment 2 (Algorithms)',
    ]);
  });
});

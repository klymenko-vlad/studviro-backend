import type { PersonalEvent, PersonalTask } from '../../database/schema';
import type { MyDeadline } from '../learning/my-deadlines.service';
import type { MyExamTerm } from '../scheduling/my-exam-terms.service';
import type { MyTimetableEvent } from '../scheduling/my-timetable-events.service';

import type { CalendarLabels } from './calendar-labels';
import type { IcalEvent } from './ical';

export interface CalendarSources {
  timetable: readonly MyTimetableEvent[];
  exams: readonly MyExamTerm[];
  deadlines: readonly MyDeadline[];
  personalEvents: readonly PersonalEvent[];
  personalTasks: readonly PersonalTask[];
}

type Room = MyTimetableEvent['room'];

export function toCalendarEntries(
  sources: CalendarSources,
  labels: CalendarLabels,
): IcalEvent[] {
  return [
    ...sources.timetable.map((event) => fromTimetableEvent(event, labels)),
    ...sources.exams.filter(isMine).map((term) => fromExamTerm(term, labels)),
    ...sources.deadlines.map((deadline) => fromDeadline(deadline, labels)),
    ...sources.personalEvents.map(fromPersonalEvent),
    ...sources.personalTasks.flatMap((task) => fromPersonalTask(task, labels)),
  ];
}

function fromTimetableEvent(event: MyTimetableEvent, labels: CalendarLabels): IcalEvent {
  return {
    uid: `timetable-${event.id}@studviro`,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    summary: event.title ?? `${event.course.title} – ${labels.eventType[event.type]}`,
    location: place(event.room),
    description: details(event.course, event.term),
    cancelled: event.isCancelled,
  };
}

function isMine(term: MyExamTerm): boolean {
  return term.attendance === 'teaching' || term.myRegistration?.status === 'registered';
}

function fromExamTerm(term: MyExamTerm, labels: CalendarLabels): IcalEvent {
  return {
    uid: `exam-term-${term.id}@studviro`,
    startsAt: term.startsAt,
    endsAt: term.endsAt,
    summary: `${labels.exam}: ${term.course.title} (${labels.examKind[term.kind]})`,
    location: place(term.room),
    description: details(term.course, term.term),
    cancelled: term.isCancelled,
  };
}

function fromDeadline(deadline: MyDeadline, labels: CalendarLabels): IcalEvent {
  return {
    uid: `deadline-${deadline.id}@studviro`,
    startsAt: deadline.dueAt,
    endsAt: null,
    summary: `${labels.due}: ${deadline.name} (${deadline.course.title})`,
    description: details(deadline.course, deadline.term),
  };
}

function fromPersonalEvent(event: PersonalEvent): IcalEvent {
  return {
    uid: `personal-event-${event.id}@studviro`,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    summary: event.title,
    location: event.location,
    description: event.note,
  };
}

function fromPersonalTask(task: PersonalTask, labels: CalendarLabels): IcalEvent[] {
  if (task.dueAt === null || task.completedAt !== null) return [];

  return [
    {
      uid: `personal-task-${task.id}@studviro`,
      startsAt: task.dueAt,
      endsAt: null,
      summary: `${labels.task}: ${task.title}`,
      description: task.note,
    },
  ];
}

function place(room: Room): string | null {
  if (room === null) return null;

  return [room.code, room.name, room.building].filter(Boolean).join(', ');
}

function details(course: { code: string; title: string }, term: { name: string }): string {
  return `${course.code} ${course.title}\n${term.name}`;
}

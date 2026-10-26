import type { ExamTermKind, TimetableEventType } from '../../database/schema';

export interface CalendarLabels {
  calendarName: (institution: string) => string;
  eventType: Record<TimetableEventType, string>;
  examKind: Record<ExamTermKind, string>;
  exam: string;
  due: string;
  task: string;
  room: string;
}

const EN: CalendarLabels = {
  calendarName: (institution) => `StudViro – ${institution}`,
  eventType: {
    lecture: 'Lecture',
    seminar: 'Seminar',
    lab: 'Lab',
    consultation: 'Consultation',
    exam: 'Exam',
    other: 'Class',
  },
  examKind: {
    regular: 'regular term',
    first_retake: 'first retake',
    second_retake: 'second retake',
    state_exam: 'state exam',
  },
  exam: 'Exam',
  due: 'Due',
  task: 'Task',
  room: 'Room',
};

const SK: CalendarLabels = {
  calendarName: (institution) => `StudViro – ${institution}`,
  eventType: {
    lecture: 'Prednáška',
    seminar: 'Seminár',
    lab: 'Cvičenie',
    consultation: 'Konzultácia',
    exam: 'Skúška',
    other: 'Výučba',
  },
  examKind: {
    regular: 'riadny termín',
    first_retake: 'prvý opravný termín',
    second_retake: 'druhý opravný termín',
    state_exam: 'štátna skúška',
  },
  exam: 'Skúška',
  due: 'Termín odovzdania',
  task: 'Úloha',
  room: 'Miestnosť',
};

export function calendarLabels(locale: string): CalendarLabels {
  return locale.toLowerCase().startsWith('sk') ? SK : EN;
}

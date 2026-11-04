import type { NotificationPayload, NotificationType } from '../../database/schema';

import {
  composeMail,
  mailDateTime,
  mailLocale,
  type ComposedMail,
  type MailLocale,
} from './mail-layout';

/** Same wording as the notification list in the application. */
const TITLE: Record<MailLocale, Record<NotificationType, string>> = {
  en: {
    exam_term_published: 'New exam term',
    exam_term_rescheduled: 'Exam term moved',
    exam_term_cancelled: 'Exam term cancelled',
    assignment_due_published: 'New assignment deadline',
    assignment_due_rescheduled: 'Assignment deadline moved',
    grade_published: 'Grade published',
    grade_corrected: 'Grade corrected',
    enrollment_confirmed: 'Place in the course confirmed',
    enrollment_rejected: 'Course enrolment refused',
    timetable_event_rescheduled: 'Class moved',
    timetable_event_cancelled: 'Class cancelled',
    exam_registration_confirmed: 'You registered for an exam',
    exam_registration_cancelled: 'You cancelled an exam registration',
    exam_registration_refused: 'The university refused your exam registration',
    submission_marked: 'Assignment marked',
    waitlist_place_free: 'A place came free on a course you are waiting for',
    discussion_thread_started: 'New thread in your course',
    discussion_reply: 'New reply in a discussion',
    enrollment_withdrawn: 'You were withdrawn from a course',
  },
  sk: {
    exam_term_published: 'Nový skúškový termín',
    exam_term_rescheduled: 'Skúškový termín presunutý',
    exam_term_cancelled: 'Skúškový termín zrušený',
    assignment_due_published: 'Nový termín odovzdania',
    assignment_due_rescheduled: 'Termín odovzdania presunutý',
    grade_published: 'Známka zverejnená',
    grade_corrected: 'Známka opravená',
    enrollment_confirmed: 'Miesto na predmete potvrdené',
    enrollment_rejected: 'Zápis na predmet odmietnutý',
    timetable_event_rescheduled: 'Hodina presunutá',
    timetable_event_cancelled: 'Hodina zrušená',
    exam_registration_confirmed: 'Prihlásili ste sa na skúšku',
    exam_registration_cancelled: 'Zrušili ste prihlásenie na skúšku',
    exam_registration_refused: 'Univerzita odmietla vaše prihlásenie na skúšku',
    submission_marked: 'Zadanie ohodnotené',
    waitlist_place_free: 'V predmete, na ktorý čakáte, sa uvoľnilo miesto',
    discussion_thread_started: 'Nová téma vo vašom predmete',
    discussion_reply: 'Nová odpoveď v diskusii',
    enrollment_withdrawn: 'Boli ste odhlásení z predmetu',
  },
};

const LABEL = {
  en: {
    course: 'Course',
    item: 'About',
    when: 'When',
    before: 'Previously',
    grade: 'Grade',
    action: 'Open your notifications',
    why: 'You get this copy because you turned on e-mail for this kind of notification in your account settings. You can turn it off there.',
  },
  sk: {
    course: 'Predmet',
    item: 'Týka sa',
    when: 'Kedy',
    before: 'Predtým',
    grade: 'Známka',
    action: 'Otvoriť oznámenia',
    why: 'Túto kópiu dostávate, pretože ste si e-mail pre tento druh oznámení zapli v nastaveniach účtu. Tam ho aj vypnete.',
  },
} as const;

export interface NotificationMailInput {
  type: NotificationType;
  payload: NotificationPayload;
  courseCode: string | null;
  courseTitle: string | null;
  notificationsUrl: string;
  timeZone: string;
  locale: string;
}

/** The e-mail copy of one in-app notification (F15). */
export function notificationMail(input: NotificationMailInput): ComposedMail {
  const locale = mailLocale(input.locale);
  const label = LABEL[locale];
  const title = TITLE[locale][input.type];
  const course =
    input.courseCode === null
      ? null
      : [input.courseCode, input.courseTitle].filter(Boolean).join(' ');
  const { payload } = input;
  const item = payload.threadTitle ?? payload.activityName ?? payload.eventTitle ?? null;
  const when = payload.startsAt ?? payload.dueAt ?? null;
  const before = payload.previousStartsAt ?? payload.previousDueAt ?? null;
  const at = (iso: string): string => mailDateTime(new Date(iso), locale, input.timeZone);

  const lines = [
    course === null ? null : `${label.course}: ${course}`,
    item === null ? null : `${label.item}: ${item}`,
    when === null ? null : `${label.when}: ${at(when)}`,
    before === null ? null : `${label.before}: ${at(before)}`,
    payload.grade === undefined ? null : `${label.grade}: ${payload.grade}`,
  ].filter((line): line is string => line !== null);

  return composeMail({
    locale,
    subject: course === null ? title : `${title}: ${course}`,
    paragraphs: [`${title}.`, ...lines, label.why],
    action: { label: label.action, url: input.notificationsUrl },
    closing: 'StudViro',
  });
}

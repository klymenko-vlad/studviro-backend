import type { CanonicalRole } from '../../database/schema';

import { composeMail, mailDate, mailLocale, type ComposedMail } from './mail-layout';

const ROLE: Record<'en' | 'sk', Record<CanonicalRole, string>> = {
  en: {
    student: 'a student',
    teacher: 'a teacher',
    teaching_assistant: 'a teaching assistant',
    course_coordinator: 'a course coordinator',
    program_coordinator: 'a programme coordinator',
    registrar: 'a registrar',
    org_unit_manager: 'a department manager',
    institution_admin: 'an administrator',
  },
  sk: {
    student: 'študent',
    teacher: 'učiteľ',
    teaching_assistant: 'asistent vyučujúceho',
    course_coordinator: 'garant predmetu',
    program_coordinator: 'garant študijného programu',
    registrar: 'študijný referent',
    org_unit_manager: 'vedúci pracoviska',
    institution_admin: 'administrátor',
  },
};

export function invitationMail(input: {
  acceptUrl: string;
  institutionName: string;
  role: CanonicalRole;
  expiresAt: Date;
  locale: string;
}): ComposedMail {
  const locale = mailLocale(input.locale);
  const until = mailDate(input.expiresAt, locale);

  return locale === 'sk'
    ? composeMail({
        locale,
        subject: `Pozvánka do ${input.institutionName} v StudViro`,
        paragraphs: [
          `${input.institutionName} vás pozýva do StudViro ako ${ROLE.sk[input.role]}.`,
          `Pozvánku prijmete vytvorením účtu alebo prihlásením cez odkaz nižšie. Platí do ${until}.`,
        ],
        action: { label: 'Prijať pozvánku', url: input.acceptUrl },
        closing: 'StudViro',
      })
    : composeMail({
        locale,
        subject: `You are invited to ${input.institutionName} on StudViro`,
        paragraphs: [
          `${input.institutionName} has invited you to StudViro as ${ROLE.en[input.role]}.`,
          `Accept by creating an account or signing in through the link below. It works until ${until}.`,
        ],
        action: { label: 'Accept the invitation', url: input.acceptUrl },
        closing: 'StudViro',
      });
}

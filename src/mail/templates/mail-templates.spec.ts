import { describe, expect, it } from 'vitest';

import { invitationMail } from './invitation.mail';
import { notificationMail } from './notification.mail';
import { passwordResetMail } from './password-reset.mail';
import { welcomeMail } from './welcome.mail';

const EXPIRES = new Date('2026-10-18T11:00:00.000Z');
const ISSUED = new Date('2026-10-18T10:00:00.000Z');
const RESET = 'https://app.example.org/reset-password?token=abc123';

describe('passwordResetMail', () => {
  it('carries the reset link in both the text and the HTML body', () => {
    const mail = passwordResetMail({
      resetUrl: RESET,
      expiresAt: EXPIRES,
      now: ISSUED,
      locale: 'en',
    });

    expect(mail.subject).toBe('Reset your StudViro password');
    expect(mail.text).toContain(RESET);
    expect(mail.html).toContain(`href="${RESET}"`);
  });

  it('says how long the link lasts and that it can be ignored', () => {
    const mail = passwordResetMail({
      resetUrl: RESET,
      expiresAt: EXPIRES,
      now: ISSUED,
      locale: 'en',
    });

    expect(mail.text).toMatch(/60 minutes/);
    expect(mail.text).toMatch(/ignore/i);
  });

  it('speaks Slovak to a Slovak account', () => {
    const mail = passwordResetMail({
      resetUrl: RESET,
      expiresAt: EXPIRES,
      now: ISSUED,
      locale: 'sk',
    });

    expect(mail.subject).toBe('Obnovenie hesla do StudViro');
    expect(mail.text).toContain('60 minút');
  });

  it('falls back to English for a locale it does not know', () => {
    expect(
      passwordResetMail({ resetUrl: RESET, expiresAt: EXPIRES, now: ISSUED, locale: 'de' })
        .subject,
    ).toBe('Reset your StudViro password');
  });
});

describe('invitationMail', () => {
  const invitation = {
    acceptUrl: 'https://app.example.org/sign-up?invitation=tok',
    institutionName: 'UKF <Nitra> & co',
    role: 'teacher' as const,
    expiresAt: new Date('2026-10-25T12:00:00.000Z'),
  };

  it('names the institution and the role, and links to accept', () => {
    const mail = invitationMail({ ...invitation, locale: 'en' });

    expect(mail.subject).toBe('You are invited to UKF <Nitra> & co on StudViro');
    expect(mail.text).toContain('as a teacher');
    expect(mail.text).toContain(invitation.acceptUrl);
    expect(mail.text).toContain('25 October 2026');
  });

  it('escapes what the institution named itself in the HTML', () => {
    const mail = invitationMail({ ...invitation, locale: 'en' });

    expect(mail.html).toContain('UKF &lt;Nitra&gt; &amp; co');
    expect(mail.html).not.toContain('<Nitra>');
  });

  it('names the role in Slovak for a Slovak institution', () => {
    const mail = invitationMail({ ...invitation, locale: 'sk' });

    expect(mail.text).toContain('ako učiteľ');
    expect(mail.text).toContain('25. októbra 2026');
  });
});

describe('welcomeMail', () => {
  it('greets the person by name and links to sign in', () => {
    const mail = welcomeMail({
      displayName: 'Ada',
      signInUrl: 'https://app.example.org/sign-in',
      locale: 'en',
    });

    expect(mail.subject).toBe('Welcome to StudViro');
    expect(mail.text).toContain('Ada');
    expect(mail.html).toContain('href="https://app.example.org/sign-in"');
  });

  it('refuses to put a script-bearing link into the HTML', () => {
    const mail = welcomeMail({
      displayName: 'Ada',
      signInUrl: 'javascript:alert(1)',
      locale: 'en',
    });

    expect(mail.html).not.toContain('javascript:');
  });
});

describe('notificationMail', () => {
  const base = {
    courseCode: 'INF101',
    courseTitle: 'Programovanie',
    notificationsUrl: 'https://app.example.org/institutions/i/notifications',
    timeZone: 'Europe/Bratislava',
  };

  it('names the course and the moment on the institution’s clock', () => {
    const mail = notificationMail({
      ...base,
      type: 'exam_term_rescheduled',
      payload: {
        startsAt: '2026-01-20T08:00:00.000Z',
        previousStartsAt: '2026-01-19T08:00:00.000Z',
      },
      locale: 'sk',
    });

    expect(mail.subject).toBe('Skúškový termín presunutý: INF101 Programovanie');
    expect(mail.text).toContain('Kedy: 20. januára 2026 o 09:00');
    expect(mail.text).toContain('Predtým: 19. januára 2026 o 09:00');
    expect(mail.text).toContain('nastaveniach účtu');
  });

  it('carries the thread a reply belongs to, escaped in HTML', () => {
    const mail = notificationMail({
      ...base,
      type: 'discussion_reply',
      payload: { threadTitle: 'Exam <scope>' },
      locale: 'en',
    });

    expect(mail.subject).toBe('New reply in a discussion: INF101 Programovanie');
    expect(mail.text).toContain('About: Exam <scope>');
    expect(mail.html).toContain('About: Exam &lt;scope&gt;');
    expect(mail.html).toContain('href="https://app.example.org/institutions/i/notifications"');
  });

  it('leaves out what a notification does not have', () => {
    const mail = notificationMail({
      ...base,
      courseCode: null,
      courseTitle: null,
      type: 'grade_published',
      payload: { grade: 'A' },
      locale: 'en',
    });

    expect(mail.subject).toBe('Grade published');
    expect(mail.text).not.toContain('Course:');
    expect(mail.text).toContain('Grade: A');
  });
});

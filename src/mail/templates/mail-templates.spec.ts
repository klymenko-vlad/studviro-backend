import { describe, expect, it } from 'vitest';

import { invitationMail } from './invitation.mail';
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

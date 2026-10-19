import { eq } from 'drizzle-orm';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  institutions,
  roleAssignments,
  users,
  type CanonicalRole,
} from '../../src/database/schema';
import { NotificationEmitterService } from '../../src/modules/notifications/notification-emitter.service';
import { NotificationMailService } from '../../src/modules/notifications/notification-mail.service';
import type { TestHarness } from '../setup/app-harness';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

interface MailpitMessage {
  Subject: string;
  Text: string;
  HTML: string;
  From: { Address: string };
}

let mailpit: StartedTestContainer;
let MAILPIT_API: string;

/**
 * Starts a Mailpit and points the transport at it before the application is
 * imported: `config.module.ts` validates the environment on import, so the
 * harness is loaded only once the variables are set. Every other suite keeps
 * `MAIL_TRANSPORT=log` and needs no mail server.
 */
async function startMailpit(): Promise<void> {
  mailpit = await new GenericContainer('axllent/mailpit:latest')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp('/livez', 8025))
    .start();
  MAILPIT_API = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`;

  process.env.MAIL_TRANSPORT = 'smtp';
  process.env.SMTP_HOST = mailpit.getHost();
  process.env.SMTP_PORT = String(mailpit.getMappedPort(1025));
  process.env.MAIL_FROM = 'StudViro <no-reply@studviro.test>';
  process.env.WEB_APP_URL = 'https://app.studviro.test';
  process.env.QUEUE_PREFIX = `test-mail-${process.pid}`;
}

async function inbox(address: string, attempts = 50): Promise<MailpitMessage> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(
      `${MAILPIT_API}/search?query=${encodeURIComponent(`to:${address}`)}`,
    );
    const { messages } = (await response.json()) as { messages: MailpitSummary[] };
    const [first] = messages;
    if (first) {
      return (await (
        await fetch(`${MAILPIT_API}/message/${first.ID}`)
      ).json()) as MailpitMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`no mail reached ${address}`);
}

describe('Mail delivery over SMTP (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    await startMailpit();
    const { createTestHarness } = await import('../setup/app-harness.js');
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
    await mailpit.stop({ remove: true });
  });

  beforeEach(async () => {
    await harness.truncateAll();
    await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
  });

  it('delivers a password reset whose link resets the password', async () => {
    const actor = await harness.actingAs();

    await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: actor.user.email },
    });
    const mail = await inbox(actor.user.email);

    expect(mail.From.Address).toBe('no-reply@studviro.test');
    expect(mail.Subject).toBe('Reset your StudViro password');
    const token = /reset-password\?token=([a-f0-9]{64})/.exec(mail.Text)?.[1];
    expect(mail.Text).toContain('https://app.studviro.test/reset-password?token=');
    expect(mail.HTML).toContain('href="https://app.studviro.test/reset-password?token=');

    const confirmed = await harness.inject({
      method: 'POST',
      url: `/api/v1/auth/password-reset/${token}/confirm`,
      payload: { password: 'a brand new passphrase' },
    });
    expect(confirmed.statusCode).toBe(204);
  });

  it('sends nothing for an address with no account, and says nothing about it', async () => {
    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'ghost@example.com' },
    });

    expect(response.statusCode).toBe(200);
    await expect(inbox('ghost@example.com', 10)).rejects.toThrow(/no mail/);
  });

  it('delivers an invitation, in the institution’s language, that lands on sign-up with its token', async () => {
    const [institution] = await harness.db
      .insert(institutions)
      .values({ code: 'ukf', name: 'UKF Nitra', defaultLocale: 'sk' })
      .returning();
    const admin = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId: institution!.id,
      userId: admin.user.id,
      role: 'institution_admin' satisfies CanonicalRole,
      scopeType: 'institution',
      scopeId: null,
    });

    const created = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institution!.id}/invitations`,
      headers: admin.headers,
      payload: {
        address: 'new.registrar@example.org',
        role: 'registrar',
        scopeType: 'institution',
      },
    });
    expect(created.statusCode, created.body).toBe(201);

    const mail = await inbox('new.registrar@example.org');
    expect(mail.Subject).toBe('Pozvánka do UKF Nitra v StudViro');
    expect(mail.Text).toContain('ako študijný referent');
    expect(mail.Text).toMatch(
      /https:\/\/app\.studviro\.test\/sign-up\?invitation=[a-f0-9]{64}/,
    );
  });

  it('welcomes a person who signs up', async () => {
    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'ada@example.org',
        password: 'correct horse battery staple',
        displayName: 'Ada Lovelace',
      },
    });
    expect(response.statusCode).toBe(201);

    const mail = await inbox('ada@example.org');
    expect(mail.Subject).toBe('Welcome to StudViro');
    expect(mail.Text).toContain('Ada Lovelace');
  });

  describe('e-mail copies of notifications (F15)', () => {
    const AFTER_THE_DELAY = 6 * 60 * 1000;

    async function gradeFor(userId: string, institutionId: string): Promise<void> {
      await harness.app.get(NotificationEmitterService).emit({
        institutionId,
        type: 'grade_published',
        subjectId: crypto.randomUUID(),
        courseOfferingId: null,
        examTermId: null,
        learningActivityId: null,
        payload: { grade: 'B' },
        occurredAt: new Date(),
        recipients: [userId],
      });
    }

    async function sweep(): Promise<number> {
      return harness.app
        .get(NotificationMailService)
        .sweep(new Date(Date.now() + AFTER_THE_DELAY));
    }

    async function setUp(locale = 'sk') {
      const [institution] = await harness.db
        .insert(institutions)
        .values({ code: 'ukf', name: 'UKF Nitra', defaultLocale: 'sk' })
        .returning();
      const student = await harness.actingAs();
      await harness.db.update(users).set({ locale }).where(eq(users.id, student.user.id));
      await harness.db.insert(roleAssignments).values({
        institutionId: institution!.id,
        userId: student.user.id,
        role: 'student' satisfies CanonicalRole,
        scopeType: 'institution',
        scopeId: null,
      });

      return { institutionId: institution!.id, student };
    }

    it('keeps the choice per person and mails an unread notification once', async () => {
      const { institutionId, student } = await setUp();

      const saved = await harness.inject({
        method: 'PUT',
        url: '/api/v1/users/me/notification-preferences',
        headers: student.headers,
        payload: { emailTypes: ['grade_published', 'grade_published'] },
      });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json()).toEqual({ emailTypes: ['grade_published'] });

      await gradeFor(student.user.id, institutionId);
      expect(await sweep()).toBe(1);
      expect(await sweep()).toBe(0);

      const mail = await inbox(student.user.email);
      expect(mail.Subject).toBe('Známka zverejnená');
      expect(mail.Text).toContain('Známka: B');
      expect(mail.Text).toContain(
        `https://app.studviro.test/institutions/${institutionId}/notifications`,
      );
    });

    it('mails nothing to a person who did not ask, or who already read it', async () => {
      const { institutionId, student } = await setUp('en');
      await gradeFor(student.user.id, institutionId);
      expect(await sweep()).toBe(0);

      await harness.inject({
        method: 'PUT',
        url: '/api/v1/users/me/notification-preferences',
        headers: student.headers,
        payload: { emailTypes: ['grade_published'] },
      });
      // Opting in does not mail what was already there.
      expect(await sweep()).toBe(0);

      await gradeFor(student.user.id, institutionId);
      await harness.inject({
        method: 'POST',
        url: `/api/v1/institutions/${institutionId}/me/notifications/read-all`,
        headers: student.headers,
      });
      expect(await sweep()).toBe(0);
      await expect(inbox(student.user.email, 5)).rejects.toThrow(/no mail/);
    });

    it('refuses a type that does not exist', async () => {
      const student = await harness.actingAs();
      const response = await harness.inject({
        method: 'PUT',
        url: '/api/v1/users/me/notification-preferences',
        headers: student.headers,
        payload: { emailTypes: ['everything'] },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

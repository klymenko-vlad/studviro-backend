/**
 * Side-effect module: starts a Mailpit and points the mail transport at it
 * before the application graph is imported, because `config.module.ts`
 * validates the environment on import. Every other suite keeps
 * `MAIL_TRANSPORT=log` and needs no mail server.
 */
import { GenericContainer, Wait } from 'testcontainers';

export const mailpit = await new GenericContainer('axllent/mailpit:latest')
  .withExposedPorts(1025, 8025)
  .withWaitStrategy(Wait.forHttp('/livez', 8025))
  .start();

export const MAILPIT_API = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`;

process.env.MAIL_TRANSPORT = 'smtp';
process.env.SMTP_HOST = mailpit.getHost();
process.env.SMTP_PORT = String(mailpit.getMappedPort(1025));
process.env.MAIL_FROM = 'StudViro <no-reply@studviro.test>';
process.env.WEB_APP_URL = 'https://app.studviro.test';
process.env.QUEUE_PREFIX = `test-mail-${process.pid}`;

import type { PinoLogger } from 'nestjs-pino';

import type { MailMessage } from './mail-message';
import { MailTransport } from './mail-transport';

/**
 * Sends nothing. The body is not logged: it carries reset and invitation
 * tokens, and a log is read by more people than a mailbox.
 */
export class LogMailTransport extends MailTransport {
  constructor(private readonly logger: PinoLogger) {
    super();
  }

  send(message: MailMessage): Promise<void> {
    this.logger.info(
      { to: message.to, subject: message.subject },
      'mail not sent: MAIL_TRANSPORT=log',
    );

    return Promise.resolve();
  }
}

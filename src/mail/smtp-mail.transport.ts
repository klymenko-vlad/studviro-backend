import type { Transporter } from 'nodemailer';

import type { MailMessage } from './mail-message';
import { MailTransport } from './mail-transport';

export class SmtpMailTransport extends MailTransport {
  constructor(
    private readonly transporter: Pick<Transporter, 'sendMail'>,
    private readonly from: string,
  ) {
    super();
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

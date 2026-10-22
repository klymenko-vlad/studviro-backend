import { Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createTransport } from 'nodemailer';

import { AppConfigService } from '../config/app-config.service';

import { LogMailTransport } from './log-mail.transport';
import { MailTransport } from './mail-transport';
import { SmtpMailTransport } from './smtp-mail.transport';

@Module({
  providers: [
    {
      provide: MailTransport,
      inject: [AppConfigService, PinoLogger],
      useFactory: (config: AppConfigService, logger: PinoLogger): MailTransport => {
        const { transport, from, smtp } = config.mail;
        if (transport === 'log') return new LogMailTransport(logger);

        return new SmtpMailTransport(
          createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            ...(smtp.user === undefined
              ? {}
              : { auth: { user: smtp.user, pass: smtp.password } }),
          }),
          from,
        );
      },
    },
  ],
  exports: [MailTransport],
})
export class MailModule {}

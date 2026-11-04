import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

import { loggedRequestHeaders } from './request-headers';

export const REQUEST_ID_HEADER = 'x-request-id';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logging.level,
          autoLogging: {
            ignore: (req) => req.url?.startsWith('/health') === true,
          },
          serializers: {
            req: (req: { headers?: Record<string, unknown> }) => ({
              ...req,
              headers: loggedRequestHeaders(req.headers),
            }),
          },
          // Request headers are allowlisted above; these stay for the body and
          // the response, and as a second line if the allowlist ever widens.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers["x-api-key"]',
              'req.headers["proxy-authorization"]',
              'req.headers.cookie',
              'req.headers["set-cookie"]',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.token',
              'req.body.refreshToken',
            ],
            censor: '[redacted]',
          },
          transport: config.isDevelopment
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
              }
            : undefined,
        },
      }),
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}

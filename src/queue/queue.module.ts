import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { MailModule } from '../mail/mail.module';

import { EmailProcessor } from './processors/email.processor';
import { QUEUES, type QueueName } from './queue.constants';
import { QueueProducer } from './queue.producer';

@Global()
@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          inject: [AppConfigService],
          useFactory: (config: AppConfigService) => ({
            connection: {
              host: config.redis.host,
              port: config.redis.port,
              password: config.redis.password,
              db: config.redis.db,
              tls: config.redis.tls ? {} : undefined,
              // BullMQ requires this; a blocked worker throws without it.
              maxRetriesPerRequest: null,
            },
            prefix: `{${config.queue.prefix}}`,
            defaultJobOptions: {
              attempts: config.queue.defaultAttempts,
              backoff: { type: 'exponential', delay: config.queue.defaultBackoffMs },
              removeOnComplete: { age: 3_600, count: 1_000 },
              removeOnFail: { age: 24 * 3_600, count: 5_000 },
            },
          }),
        }),
        ...Object.values(QUEUES).map((name: QueueName) => BullModule.registerQueue({ name })),
      ],
      providers: [QueueProducer],
      exports: [BullModule, QueueProducer],
    };
  }

  static forWorkers(): DynamicModule {
    return {
      module: QueueModule,
      imports: [MailModule],
      providers: [EmailProcessor],
      exports: [EmailProcessor],
    };
  }
}

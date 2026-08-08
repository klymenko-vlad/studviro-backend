import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';
import { QueueHealthIndicator } from './queue.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, QueueHealthIndicator],
})
export class HealthModule {}

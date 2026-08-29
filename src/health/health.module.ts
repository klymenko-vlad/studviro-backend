import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';
import { MigrationsHealthIndicator } from './migrations.health';
import { QueueHealthIndicator } from './queue.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, MigrationsHealthIndicator, QueueHealthIndicator],
})
export class HealthModule {}

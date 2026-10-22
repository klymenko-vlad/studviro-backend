import { Controller, Get, ServiceUnavailableException, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { ShutdownService } from '../common/lifecycle/shutdown.service';
import { AppConfigService } from '../config/app-config.service';
import { Public } from '../modules/auth/decorators/public.decorator';

import { DatabaseHealthIndicator } from './database.health';
import { MigrationsHealthIndicator } from './migrations.health';
import { QueueHealthIndicator } from './queue.health';

@ApiExcludeController()
// Probes are called by the orchestrator, which holds no credentials.
@Public()
// Version-neutral: orchestrator probe URLs must survive API version bumps.
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly migrations: MigrationsHealthIndicator,
    private readonly queue: QueueHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly shutdown: ShutdownService,
    private readonly config: AppConfigService,
  ) {}

  /** `commit` lets the post-deploy check tell the new build from the old one. */
  @Get('live')
  live() {
    return { status: 'ok', commit: this.config.commit ?? null };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    if (this.shutdown.isShuttingDown) {
      throw new ServiceUnavailableException({ status: 'shutting_down' });
    }

    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.migrations.check('migrations'),
    ]);
  }

  @Get()
  @HealthCheck()
  full() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.migrations.check('migrations'),
      () => this.queue.check('queue'),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),
    ]);
  }
}

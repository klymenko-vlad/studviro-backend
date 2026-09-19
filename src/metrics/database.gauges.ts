import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Gauge } from 'prom-client';

import { AppConfigService } from '../config/app-config.service';

import { DATABASE_POOL_MAX_GAUGE } from './metric.names';

/**
 * The configured ceiling is all `postgres` exposes: its pool keeps the open,
 * busy and queued connection lists in a closure, so in-use and idle counts
 * cannot be read without patching the driver.
 */
@Injectable()
export class DatabasePoolGauge implements OnModuleInit {
  constructor(
    private readonly config: AppConfigService,
    @InjectMetric(DATABASE_POOL_MAX_GAUGE) private readonly poolMax: Gauge,
  ) {}

  onModuleInit(): void {
    this.poolMax.set(this.config.database.poolMax);
  }
}

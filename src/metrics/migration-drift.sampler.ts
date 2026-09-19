import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { PinoLogger } from 'nestjs-pino';
import type { Gauge } from 'prom-client';

import { MigrationsHealthIndicator } from '../health/migrations.health';

import { MIGRATIONS_APPLIED_GAUGE, MIGRATIONS_EXPECTED_GAUGE } from './metric.names';

export const MIGRATION_SAMPLE_INTERVAL_MS = 60_000;

/**
 * Readiness already refuses traffic on a database that is behind, but a probe
 * only tells the orchestrator. Published as a gauge, the same fact reaches
 * whoever is on call — and says how far behind.
 */
@Injectable()
export class MigrationDriftSampler implements OnApplicationBootstrap {
  constructor(
    private readonly migrations: MigrationsHealthIndicator,
    @InjectMetric(MIGRATIONS_APPLIED_GAUGE) private readonly applied: Gauge,
    @InjectMetric(MIGRATIONS_EXPECTED_GAUGE) private readonly expected: Gauge,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MigrationDriftSampler.name);
  }

  onApplicationBootstrap(): Promise<void> {
    return this.sample();
  }

  @Interval(MIGRATION_SAMPLE_INTERVAL_MS)
  async sample(): Promise<void> {
    try {
      const { applied, expected } = await this.migrations.counts();

      this.applied.set(applied);
      this.expected.set(expected);
    } catch (error) {
      this.logger.warn({ err: error }, 'migration drift sample failed');
    }
  }
}

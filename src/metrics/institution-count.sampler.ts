import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { count, isNull } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import type { Gauge } from 'prom-client';

import { DRIZZLE_RO, type Database } from '../database/database.tokens';
import { institutions } from '../database/schema';

import { INSTITUTIONS_GAUGE } from './metric.names';

export const INSTITUTION_SAMPLE_INTERVAL_MS = 60_000;

/**
 * The only domain count cheap enough to publish: `institutions` holds one row
 * per tenant and is indexed on the predicate. Users, enrolments and results
 * grow without bound and are deliberately left out — see `docs/Observability.md`.
 */
@Injectable()
export class InstitutionCountSampler implements OnApplicationBootstrap {
  constructor(
    @Inject(DRIZZLE_RO) private readonly db: Database,
    @InjectMetric(INSTITUTIONS_GAUGE) private readonly institutions: Gauge,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(InstitutionCountSampler.name);
  }

  onApplicationBootstrap(): Promise<void> {
    return this.sample();
  }

  @Interval(INSTITUTION_SAMPLE_INTERVAL_MS)
  async sample(): Promise<void> {
    try {
      const [row] = await this.db
        .select({ total: count() })
        .from(institutions)
        .where(isNull(institutions.deletedAt));

      this.institutions.set(row?.total ?? 0);
    } catch (error) {
      this.logger.warn({ err: error }, 'institution count sample failed');
    }
  }
}

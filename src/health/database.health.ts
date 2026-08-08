import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.module';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async pingCheck(key: string, timeoutMs = 3_000) {
    const check = this.indicator.check(key);
    const startedAt = performance.now();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`database ping exceeded ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref();
    });

    // The losing side of the race still settles later; swallow its rejection so
    // a timed-out ping cannot surface as an unhandled rejection.
    const ping = this.db.execute(sql`select 1`);
    ping.catch(() => undefined);

    try {
      await Promise.race([ping, timeout]);
      return check.up({ responseTimeMs: Math.round(performance.now() - startedAt) });
    } catch (error) {
      return check.down({ message: (error as Error).message });
    } finally {
      clearTimeout(timer);
    }
  }
}

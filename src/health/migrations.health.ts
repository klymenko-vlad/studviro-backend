import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.module';
import type { Database } from '../database/database.module';

/**
 * A connection that answers `select 1` proves nothing about the schema. A
 * database that was provisioned but never migrated passes a ping and then fails
 * every real query with `relation "users" does not exist` — which is exactly how
 * a deployment can look green while no one can sign in.
 *
 * So readiness compares the migrations Drizzle has recorded against the journal
 * shipped in the image. Fewer applied than expected means this instance is
 * running ahead of its database and must not take traffic.
 */
@Injectable()
export class MigrationsHealthIndicator {
  private expected: number | undefined;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly indicator: HealthIndicatorService,
  ) {}

  async check(key: string) {
    const check = this.indicator.check(key);

    try {
      const expected = await this.expectedCount();
      const applied = await this.appliedCount();

      return applied >= expected
        ? check.up({ applied, expected })
        : check.down({
            applied,
            expected,
            message: `database is ${expected - applied} migration(s) behind; run db:migrate`,
          });
    } catch (error) {
      return check.down({ message: (error as Error).message });
    }
  }

  private async expectedCount(): Promise<number> {
    if (this.expected !== undefined) return this.expected;

    const journal = await readFile(
      resolve(process.cwd(), 'drizzle/meta/_journal.json'),
      'utf8',
    );
    const { entries } = JSON.parse(journal) as { entries: unknown[] };

    this.expected = entries.length;

    return this.expected;
  }

  /**
   * `to_regclass` rather than a plain count: the table is absent on a database
   * that has never been migrated, and letting that raise would report a missing
   * schema as an unexplained error instead of as zero migrations applied.
   */
  private async appliedCount(): Promise<number> {
    const rows = (await this.db.execute(
      sql`select case
            when to_regclass('drizzle.__drizzle_migrations') is null then 0
            else (select count(*)::int from drizzle.__drizzle_migrations)
          end as applied`,
    )) as unknown as { applied: number }[];

    return rows[0]?.applied ?? 0;
  }
}

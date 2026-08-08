import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { BaseRepository } from '../../database/repository/base.repository';
import type { FindOneOptions } from '../../database/repository/repository.types';
import { users, type User } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class UsersRepository extends BaseRepository<typeof users> {
  /** Allowlist backing `?sortBy=` — anything else is rejected before SQL. */
  protected override readonly sortable = {
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
    email: users.email,
    displayName: users.displayName,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, users);
  }

  findByEmail(email: string, options: FindOneOptions = {}): Promise<User | undefined> {
    return this.findOne(eq(users.email, email), options);
  }

  /**
   * A pre-flight check only — two concurrent signups can both see `false`. The
   * partial unique index is the real guarantee, so callers must still handle
   * the violation.
   */
  emailTaken(email: string): Promise<boolean> {
    return this.exists(eq(users.email, email), { consistent: true });
  }

  /**
   * Invalidates every access token already minted for this user.
   *
   * Incremented in SQL rather than read-modify-write: two concurrent
   * revocations that both read the same version would otherwise write the same
   * value, leaving one of them with no effect at all.
   *
   * Unscoped, and absent rows are tolerated. `update` would raise
   * `EntityNotFoundError` for a soft-deleted user, and this runs inside the
   * transaction that revokes a leaked token family — a throw there rolls the
   * revocation back and leaves the leaked tokens usable, which is the exact
   * outcome the caller is trying to prevent.
   */
  async incrementTokenVersion(id: string, tx?: Transaction): Promise<number | undefined> {
    const [updated] = await this.updateMany(
      eq(users.id, id),
      { tokenVersion: sql`${users.tokenVersion} + 1` },
      { withDeleted: true },
      tx,
    );

    return updated?.tokenVersion;
  }
}

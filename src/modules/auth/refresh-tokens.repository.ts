import { Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { BaseRepository } from '../../database/repository/base.repository';
import { refreshTokens, type RefreshToken } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class RefreshTokensRepository extends BaseRepository<typeof refreshTokens> {
  protected override readonly sortable = {
    createdAt: refreshTokens.createdAt,
    expiresAt: refreshTokens.expiresAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, refreshTokens);
  }

  /**
   * Consistent read: a refresh immediately follows the write that issued the
   * token, and replica lag would present a legitimate token as unknown.
   */
  findByHash(tokenHash: string, tx?: Transaction): Promise<RefreshToken | undefined> {
    return this.findOne(eq(refreshTokens.tokenHash, tokenHash), { consistent: true }, tx);
  }

  findByHashForUpdate(tokenHash: string, tx: Transaction): Promise<RefreshToken | undefined> {
    return this.findOne(
      eq(refreshTokens.tokenHash, tokenHash),
      { consistent: true, lock: 'update' },
      tx,
    );
  }

  async revoke(
    id: string,
    replacedByTokenHash: string | null,
    tx?: Transaction,
  ): Promise<void> {
    await this.update(id, { revokedAt: new Date(), replacedByTokenHash }, tx);
  }

  isSessionLive(userId: string, sessionId: string): Promise<boolean> {
    return this.exists(this.liveSession(userId, sessionId), { consistent: true });
  }

  findLive(userId: string): Promise<RefreshToken[]> {
    return this.findMany({
      where: this.live(userId),
      orderBy: refreshTokens.createdAt,
      order: 'desc',
      consistent: true,
    });
  }

  async revokeSession(userId: string, sessionId: string, tx?: Transaction): Promise<number> {
    const revoked = await this.updateMany(
      this.liveSession(userId, sessionId),
      { revokedAt: new Date() },
      {},
      tx,
    );

    return revoked.length;
  }

  async revokeAllSessionsExcept(
    userId: string,
    keptSessionId: string,
    tx?: Transaction,
  ): Promise<number> {
    const revoked = await this.updateMany(
      and(this.live(userId), ne(refreshTokens.sessionId, keptSessionId)) ?? sql`false`,
      { revokedAt: new Date() },
      {},
      tx,
    );

    return revoked.length;
  }

  private live(userId: string) {
    return (
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, new Date()),
      ) ?? sql`false`
    );
  }

  private liveSession(userId: string, sessionId: string) {
    return and(this.live(userId), eq(refreshTokens.sessionId, sessionId)) ?? sql`false`;
  }

  /**
   * Used both for "sign out everywhere" and for the reuse-detection path, where
   * the safe response to one leaked token is to end every session rather than
   * to guess which of them the attacker holds.
   */
  async revokeAllForUser(userId: string, tx?: Transaction): Promise<number> {
    const revoked = await this.updateMany(
      // `and` is only undefined when given no conditions; two are passed here.
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)) ?? sql`true`,
      { revokedAt: new Date() },
      {},
      tx,
    );

    return revoked.length;
  }

  /**
   * Drops rows that can no longer authenticate anyone. Scoped to expiry, not to
   * revocation: a revoked-but-unexpired row is exactly what reuse detection
   * needs to still find when a leaked token comes back.
   */
  purgeExpired(before = new Date(), tx?: Transaction): Promise<number> {
    return this.hardDeleteMany(lt(refreshTokens.expiresAt, before), tx);
  }
}

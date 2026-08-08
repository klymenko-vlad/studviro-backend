import { eq, inArray, isNull, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CursorPaginationQueryDto,
  PaginationQueryDto,
} from '../../src/common/dto/pagination.dto';
import { EntityNotFoundError, InvalidInputError } from '../../src/common/errors/domain.error';
import { users } from '../../src/database/schema';
import { TransactionHost } from '../../src/database/transaction.host';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('BaseRepository — bulk, upsert, cursor and transactions (e2e)', () => {
  let harness: TestHarness;
  let repo: UsersRepository;
  let tx: TransactionHost;

  const make = (n: number) => ({
    email: `feature-${n}@example.com`,
    displayName: `User ${n}`,
    passwordHash: 'x',
  });

  beforeAll(async () => {
    harness = await createTestHarness();
    repo = harness.app.get(UsersRepository);
    tx = harness.app.get(TransactionHost);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  describe('findMany', () => {
    it('applies where, ordering, limit and offset together', async () => {
      await repo.createMany([make(1), make(2), make(3)]);

      const rows = await repo.findMany({
        where: like(users.email, 'feature-%'),
        orderBy: users.email,
        order: 'asc',
        limit: 2,
        offset: 1,
      });

      expect(rows.map((row) => row.email)).toEqual([
        'feature-2@example.com',
        'feature-3@example.com',
      ]);
    });

    it('findByIds returns nothing for an empty list without querying', async () => {
      await expect(repo.findByIds([])).resolves.toEqual([]);
    });

    it('findByIds loads exactly the requested rows', async () => {
      const created = await repo.createMany([make(1), make(2), make(3)]);
      const wanted = [created[0]!.id, created[2]!.id];

      const rows = await repo.findByIds(wanted);

      expect(rows.map((row) => row.id).sort()).toEqual([...wanted].sort());
    });

    it('findOneOrFail raises a domain error rather than an HTTP one', async () => {
      await expect(
        repo.findOneOrFail(eq(users.email, 'nobody@example.com')),
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('upsert', () => {
    it('inserts when there is no conflict', async () => {
      // The unique index is partial, so the conflict target has to name the
      // same predicate or Postgres cannot match an arbiter index.
      const row = await repo.upsert(make(1), {
        target: users.email,
        targetWhere: isNull(users.deletedAt),
      });

      expect(row?.displayName).toBe('User 1');
      await expect(repo.count()).resolves.toBe(1);
    });

    it('updates the conflicting row instead of raising a unique violation', async () => {
      const created = await repo.create(make(1));

      const row = await repo.upsert(
        { ...make(1), displayName: 'Renamed' },
        { target: users.email, targetWhere: isNull(users.deletedAt) },
      );

      expect(row?.id).toBe(created.id);
      expect(row?.displayName).toBe('Renamed');
      await expect(repo.count()).resolves.toBe(1);
    });

    it('leaves the row untouched when setWhere excludes it', async () => {
      await repo.create(make(1));

      const row = await repo.upsert(
        { ...make(1), displayName: 'Renamed' },
        {
          target: users.email,
          targetWhere: isNull(users.deletedAt),
          setWhere: eq(users.displayName, 'Never matches'),
        },
      );

      expect(row).toBeUndefined();
      const stored = await repo.findByEmail('feature-1@example.com');
      expect(stored?.displayName).toBe('User 1');
    });
  });

  describe('bulk writes', () => {
    it('updateMany rewrites every matching live row', async () => {
      const created = await repo.createMany([make(1), make(2), make(3)]);
      await repo.softDelete(created[0]!.id);

      const updated = await repo.updateMany(like(users.email, 'feature-%'), {
        displayName: 'Bulk',
      });

      expect(updated).toHaveLength(2);
      await expect(repo.count(eq(users.displayName, 'Bulk'))).resolves.toBe(2);
    });

    it('softDeleteMany hides rows and reports the count', async () => {
      const created = await repo.createMany([make(1), make(2), make(3)]);

      const affected = await repo.softDeleteMany(
        inArray(users.id, [created[0]!.id, created[1]!.id]),
      );

      expect(affected).toBe(2);
      await expect(repo.count()).resolves.toBe(1);
      await expect(repo.count(undefined, { withDeleted: true })).resolves.toBe(3);
    });

    it('hardDeleteMany removes rows permanently', async () => {
      await repo.createMany([make(1), make(2)]);

      const affected = await repo.hardDeleteMany(like(users.email, 'feature-%'));

      expect(affected).toBe(2);
      await expect(repo.count(undefined, { withDeleted: true })).resolves.toBe(0);
    });

    it('restore refuses a row that is not deleted', async () => {
      const created = await repo.create(make(1));

      await expect(repo.restore(created.id)).rejects.toBeInstanceOf(EntityNotFoundError);
    });
  });

  describe('cursor pagination', () => {
    it('walks the whole table exactly once', async () => {
      await repo.createMany(Array.from({ length: 7 }, (_, i) => make(i)));

      const seen: string[] = [];
      let cursor: string | null = null;

      do {
        const query: CursorPaginationQueryDto = Object.assign(new CursorPaginationQueryDto(), {
          limit: 3,
          ...(cursor ? { cursor } : {}),
        });
        const page = await repo.findByCursor(query);

        seen.push(...page.items.map((row) => row.id));
        cursor = page.meta.nextCursor;
      } while (cursor);

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });

    it('reports no next page once the table is exhausted', async () => {
      await repo.createMany([make(1), make(2)]);

      const page = await repo.findByCursor(new CursorPaginationQueryDto());

      expect(page.meta.hasNextPage).toBe(false);
      expect(page.meta.nextCursor).toBeNull();
    });

    it('rejects a cursor a client made up', async () => {
      const query = Object.assign(new CursorPaginationQueryDto(), { cursor: 'not-a-cursor' });

      await expect(repo.findByCursor(query)).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('excludes soft-deleted rows', async () => {
      const created = await repo.createMany([make(1), make(2)]);
      await repo.softDelete(created[0]!.id);

      const page = await repo.findByCursor(new CursorPaginationQueryDto());

      expect(page.items.map((row) => row.id)).toEqual([created[1]!.id]);
    });
  });

  describe('sorting', () => {
    it('honours an allowlisted sortBy', async () => {
      await repo.createMany([make(3), make(1), make(2)]);

      const query = Object.assign(new PaginationQueryDto(), {
        sortBy: 'email',
        order: 'asc' as const,
      });
      const page = await repo.findPaginated(query);

      expect(page.items.map((row) => row.email)).toEqual([
        'feature-1@example.com',
        'feature-2@example.com',
        'feature-3@example.com',
      ]);
    });

    it('rejects a column that is not on the allowlist', async () => {
      const query = Object.assign(new PaginationQueryDto(), { sortBy: 'password_hash' });

      await expect(repo.findPaginated(query)).rejects.toBeInstanceOf(InvalidInputError);
    });
  });

  describe('transactions', () => {
    it('rolls every repository call back together', async () => {
      await expect(
        tx.run(async () => {
          await repo.create(make(1));
          await repo.create(make(2));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      await expect(repo.count(undefined, { withDeleted: true })).resolves.toBe(0);
    });

    it('commits when the callback returns', async () => {
      const created = await tx.run(() => repo.create(make(1)));

      await expect(repo.findById(created.id, { consistent: true })).resolves.toBeDefined();
    });

    it('sees its own uncommitted writes', async () => {
      const found = await tx.run(async () => {
        const created = await repo.create(make(1));

        return repo.findById(created.id);
      });

      expect(found).toBeDefined();
    });

    it('joins an in-flight transaction rather than opening a second one', async () => {
      await expect(
        tx.run(async () => {
          await repo.create(make(1));

          // A nested `run` that opened its own connection would block here
          // waiting on the row lock the outer transaction already holds.
          await tx.run(async () => {
            await repo.create(make(2));
            expect(tx.isActive).toBe(true);
          });

          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      await expect(repo.count(undefined, { withDeleted: true })).resolves.toBe(0);
    });

    it('locks rows for update inside a transaction', async () => {
      const created = await repo.create(make(1));

      const locked = await tx.run(() => repo.findById(created.id, { lock: 'update' }));

      expect(locked?.id).toBe(created.id);
    });
  });
});

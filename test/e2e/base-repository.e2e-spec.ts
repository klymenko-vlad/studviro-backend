import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PaginationQueryDto } from '../../src/common/dto/pagination.dto';
import { EntityNotFoundError } from '../../src/common/errors/domain.error';
import { users } from '../../src/database/schema';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('BaseRepository (e2e)', () => {
  let harness: TestHarness;
  let repo: UsersRepository;

  const make = (n: number) => ({
    email: `base-${n}@example.com`,
    displayName: `User ${n}`,
    passwordHash: 'x',
  });

  beforeAll(async () => {
    harness = await createTestHarness();
    repo = harness.app.get(UsersRepository);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('createMany short-circuits on an empty array without hitting the database', async () => {
    await expect(repo.createMany([])).resolves.toEqual([]);
    await expect(repo.count()).resolves.toBe(0);
  });

  it('createMany inserts every row', async () => {
    const created = await repo.createMany([make(1), make(2), make(3)]);

    expect(created).toHaveLength(3);
    await expect(repo.count()).resolves.toBe(3);
  });

  it('findByIdOrFail throws NotFound naming the table', async () => {
    await expect(
      repo.findByIdOrFail('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('update returns the mutated row and bumps updatedAt', async () => {
    const created = await repo.create(make(1));

    const updated = await repo.update(created.id, { displayName: 'Renamed' });

    expect(updated.displayName).toBe('Renamed');
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  it('update throws NotFound for an unknown id', async () => {
    await expect(
      repo.update('00000000-0000-4000-8000-000000000000', { displayName: 'x' }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  describe('soft delete', () => {
    it('hides the row from reads but keeps it on disk', async () => {
      const created = await repo.create(make(1));
      await repo.softDelete(created.id);

      await expect(repo.findById(created.id)).resolves.toBeUndefined();
      await expect(repo.count()).resolves.toBe(0);

      const withDeleted = await repo.findById(created.id, { withDeleted: true });
      expect(withDeleted?.deletedAt).toBeInstanceOf(Date);
    });

    it('is rejected twice for the same row', async () => {
      const created = await repo.create(make(1));
      await repo.softDelete(created.id);

      await expect(repo.softDelete(created.id)).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('restore brings the row back into normal reads', async () => {
      const created = await repo.create(make(1));
      await repo.softDelete(created.id);
      await repo.restore(created.id);

      await expect(repo.findById(created.id)).resolves.toBeDefined();
    });

    it('excludes soft-deleted rows from pagination and its total', async () => {
      const rows = await repo.createMany([make(1), make(2), make(3)]);
      await repo.softDelete(rows[0]!.id);

      const page = await repo.findPaginated(new PaginationQueryDto());

      expect(page.items).toHaveLength(2);
      expect(page.meta.total).toBe(2);
    });
  });

  it('hardDelete removes the row entirely', async () => {
    const created = await repo.create(make(1));

    await repo.hardDelete(created.id);

    await expect(repo.findById(created.id, { withDeleted: true })).resolves.toBeUndefined();
  });

  it('exists reflects the soft-delete scope', async () => {
    const created = await repo.create(make(1));
    const where = eq(users.email, created.email);

    await expect(repo.exists(where)).resolves.toBe(true);
    await repo.softDelete(created.id);
    await expect(repo.exists(where)).resolves.toBe(false);
  });

  it('orders pages by createdAt in the requested direction', async () => {
    await repo.createMany([make(1), make(2), make(3)]);

    const query = Object.assign(new PaginationQueryDto(), { order: 'asc' as const });
    const ascending = await repo.findPaginated(query);
    const descending = await repo.findPaginated(new PaginationQueryDto());

    expect(ascending.items.map((u) => u.id)).toEqual(
      descending.items.map((u) => u.id).reverse(),
    );
  });

  it('pages tied timestamps without skipping or repeating a row', async () => {
    await repo.createMany(Array.from({ length: 6 }, (_, i) => make(i)));

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await repo.findPaginated(
        Object.assign(new PaginationQueryDto(), { page, limit: 2 }),
      );
      seen.push(...result.items.map((u) => u.id));
    }

    expect(new Set(seen).size).toBe(6);
  });

  it('reports empty-page metadata without dividing by zero', async () => {
    const page = await repo.findPaginated(new PaginationQueryDto());

    expect(page.meta).toMatchObject({
      total: 0,
      pageCount: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });
});

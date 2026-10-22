import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  courses,
  institutions,
  orgUnits,
  roleAssignments,
  type NewCourse,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');
  return row;
};

describe('Canonical academic schema (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;

  const course = (overrides: Partial<NewCourse> = {}): NewCourse => ({
    institutionId,
    code: 'INF101',
    title: 'Introduction to Informatics',
    ...overrides,
  });

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const institution = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    );
    institutionId = institution.id;
  });

  describe('institution scoping', () => {
    it('removes an institution’s academic rows with it', async () => {
      await harness.db.insert(courses).values(course());

      await harness.db.delete(institutions).where(eq(institutions.id, institutionId));

      await expect(harness.db.select().from(courses)).resolves.toEqual([]);
    });

    it('rejects a course pointing at no institution', async () => {
      await expect(
        harness.db
          .insert(courses)
          .values(course({ institutionId: '00000000-0000-4000-8000-000000000000' })),
      ).rejects.toThrow();
    });

    it('allows the same course code in two institutions', async () => {
      const other = only(
        await harness.db
          .insert(institutions)
          .values({ code: 'tuke', name: 'TUKE' })
          .returning(),
      );

      await harness.db.insert(courses).values(course());

      await expect(
        harness.db.insert(courses).values(course({ institutionId: other.id })),
      ).resolves.toBeDefined();
    });
  });

  describe('role assignments', () => {
    let userId: string;

    beforeEach(async () => {
      const actor = await harness.actingAs();
      userId = actor.user.id;
    });

    it('accepts an institution-wide grant with no scope id', async () => {
      await expect(
        harness.db
          .insert(roleAssignments)
          .values({ institutionId, userId, role: 'registrar', scopeType: 'institution' }),
      ).resolves.toBeDefined();
    });

    it('rejects an institution-wide grant that also names a scope', async () => {
      const orgUnit = only(
        await harness.db
          .insert(orgUnits)
          .values({ institutionId, code: 'PF', name: 'Faculty of Science' })
          .returning(),
      );

      await expect(
        harness.db.insert(roleAssignments).values({
          institutionId,
          userId,
          role: 'registrar',
          scopeType: 'institution',
          scopeId: orgUnit.id,
        }),
      ).rejects.toThrow();
    });

    it('rejects a scoped grant with no scope id', async () => {
      await expect(
        harness.db
          .insert(roleAssignments)
          .values({ institutionId, userId, role: 'teacher', scopeType: 'org_unit' }),
      ).rejects.toThrow();
    });

    it('lets one user hold the same role in two scopes', async () => {
      const firstUnit = only(
        await harness.db
          .insert(orgUnits)
          .values({ institutionId, code: 'PF', name: 'Faculty of Science' })
          .returning(),
      );
      const secondUnit = only(
        await harness.db
          .insert(orgUnits)
          .values({ institutionId, code: 'FF', name: 'Faculty of Arts' })
          .returning(),
      );

      await harness.db.insert(roleAssignments).values({
        institutionId,
        userId,
        role: 'teacher',
        scopeType: 'org_unit',
        scopeId: firstUnit.id,
      });

      await expect(
        harness.db.insert(roleAssignments).values({
          institutionId,
          userId,
          role: 'teacher',
          scopeType: 'org_unit',
          scopeId: secondUnit.id,
        }),
      ).resolves.toBeDefined();
    });

    it('rejects the same role twice in one scope', async () => {
      const orgUnit = only(
        await harness.db
          .insert(orgUnits)
          .values({ institutionId, code: 'PF', name: 'Faculty of Science' })
          .returning(),
      );

      const assignment = {
        institutionId,
        userId,
        role: 'teacher',
        scopeType: 'org_unit',
        scopeId: orgUnit.id,
      } as const;

      await harness.db.insert(roleAssignments).values(assignment);

      await expect(harness.db.insert(roleAssignments).values(assignment)).rejects.toThrow();
    });
  });
});

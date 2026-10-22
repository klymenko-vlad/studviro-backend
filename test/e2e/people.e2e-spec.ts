import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  institutions,
  programMemberships,
  programs,
  roleAssignments,
  users,
} from '../../src/database/schema';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

interface PersonEntry {
  userId: string;
  displayName: string;
  email: string;
  roles: { role: string; source: string }[];
}

interface PeoplePage {
  items: PersonEntry[];
  meta: { limit: number; hasNextPage: boolean; nextCursor: string | null };
}

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('People directory (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let otherInstitutionId: string;
  let programId: string;
  let reader: ActingUser;

  const grantInDatabase = async (userId: string, institution: string): Promise<void> => {
    await harness.db.insert(roleAssignments).values({
      institutionId: institution,
      userId,
      role: 'registrar',
      scopeType: 'institution',
      scopeId: null,
    });
  };

  const list = (query = '', actor?: ActingUser) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/people${query}`,
      headers: (actor ?? reader).headers,
    });

  const people = async (query = ''): Promise<PersonEntry[]> =>
    (await list(query)).json<PeoplePage>().items;

  /** `actingAs` names people `Actor N`; the directory is ordered by name. */
  const named = async (displayName: string): Promise<ActingUser> => {
    const person = await harness.actingAs();
    await harness.db.update(users).set({ displayName }).where(eq(users.id, person.user.id));
    await grantInDatabase(person.user.id, institutionId);

    return person;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    institutionId = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    ).id;
    otherInstitutionId = only(
      await harness.db.insert(institutions).values({ code: 'tuke', name: 'TUKE' }).returning(),
    ).id;
    programId = only(
      await harness.db
        .insert(programs)
        .values({ institutionId, code: 'inf', name: 'Informatics' })
        .returning(),
    ).id;

    reader = await harness.actingAs();
    await grantInDatabase(reader.user.id, institutionId);
  });

  it('lists a person with a granted role', async () => {
    const response = await list();

    expect(response.statusCode).toBe(200);
    expect(response.json().items).toMatchObject([
      { userId: reader.user.id, roles: [{ role: 'registrar', source: 'granted' }] },
    ]);
  });

  it('lists a person whose only role is derived from an active program membership', async () => {
    const student = await harness.actingAs();
    await harness.db.insert(programMemberships).values({
      institutionId,
      programId,
      userId: student.user.id,
      status: 'active',
    });

    const found = (await people()).find((entry) => entry.userId === student.user.id);

    expect(found).toMatchObject({ roles: [{ role: 'student', source: 'derived' }] });
  });

  it('omits a person whose program membership is interrupted', async () => {
    const leaver = await harness.actingAs();
    await harness.db.insert(programMemberships).values({
      institutionId,
      programId,
      userId: leaver.user.id,
      status: 'interrupted',
    });

    expect((await people()).some((entry) => entry.userId === leaver.user.id)).toBe(false);
  });

  it('never lists a person from another institution', async () => {
    const other = await harness.actingAs();
    await grantInDatabase(other.user.id, otherInstitutionId);

    expect((await people()).some((entry) => entry.userId === other.user.id)).toBe(false);
  });

  it('rejects a caller with no role in the institution', async () => {
    const stranger = await harness.actingAs();

    expect((await list('', stranger)).statusCode).toBe(403);
  });

  describe('paging', () => {
    /** Named so the alphabetical order is the one the assertions expect. */
    const cohort = async () => {
      for (const name of ['Anna Bartošová', 'Boris Cibuľa', 'Cyril Dudáš', 'Dana Elenová']) {
        await named(name);
      }
    };

    it('answers with a page and the cursor to continue from', async () => {
      await cohort();

      const page = (await list('?limit=2')).json<PeoplePage>();

      expect(page.items).toHaveLength(2);
      expect(page.meta).toMatchObject({ limit: 2, hasNextPage: true });
      expect(page.meta.nextCursor).toEqual(expect.any(String));
    });

    it('walks the whole directory without skipping or repeating anybody', async () => {
      await cohort();

      const seen: string[] = [];
      let cursor: string | null = null;

      do {
        const page: PeoplePage = (
          await list(
            `?limit=2${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
          )
        ).json<PeoplePage>();
        seen.push(...page.items.map((entry) => entry.displayName));
        cursor = page.meta.nextCursor;
      } while (cursor !== null);

      // Four named people plus the registrar doing the reading.
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect(seen).toEqual([...seen].sort((a, b) => a.localeCompare(b)));
    });

    it('says there is no next page on the last one', async () => {
      await cohort();

      const page = (await list('?limit=100')).json<PeoplePage>();

      expect(page.meta).toMatchObject({ hasNextPage: false, nextCursor: null });
    });

    it('refuses a cursor that was not one of ours', async () => {
      expect((await list('?cursor=not-a-cursor')).statusCode).toBe(400);
    });

    it('refuses a page larger than the cap', async () => {
      expect((await list('?limit=500')).statusCode).toBe(400);
    });
  });

  describe('searching', () => {
    it('matches part of a name', async () => {
      await named('Anna Bartošová');
      await named('Boris Cibuľa');

      const found = await people('?q=bart');

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ displayName: 'Anna Bartošová' });
    });

    it('matches part of an address', async () => {
      const person = await named('Anna Bartošová');

      const found = await people(`?q=${person.user.email.split('@')[0]}`);

      expect(found.map((entry) => entry.userId)).toContain(person.user.id);
    });

    it('ignores case, which is the whole point of a typeahead', async () => {
      await named('Anna Bartošová');

      expect(await people('?q=ANNA')).toHaveLength(1);
    });

    it('answers with nobody rather than everybody when nothing matches', async () => {
      await named('Anna Bartošová');

      expect(await people('?q=zzzznobody')).toEqual([]);
    });

    it('treats an underscore as a character, not a wildcard', async () => {
      await named('Anna Bartošová');

      // Unescaped, `a_n` would match "Anna" through LIKE's single-character
      // wildcard and the picker would offer somebody the typist did not name.
      expect(await people('?q=a_n')).toEqual([]);
    });

    it('treats a percent sign as a character, not "everything"', async () => {
      await named('Anna Bartošová');

      expect(await people('?q=%')).toEqual([]);
    });

    it('still refuses to cross an institution while searching', async () => {
      const other = await harness.actingAs();
      await harness.db
        .update(users)
        .set({ displayName: 'Anna Elsewhere' })
        .where(eq(users.id, other.user.id));
      await grantInDatabase(other.user.id, otherInstitutionId);

      expect((await people('?q=Anna')).map((entry) => entry.userId)).not.toContain(
        other.user.id,
      );
    });
  });

  describe('resolving specific people', () => {
    it('answers with only the people asked for', async () => {
      const anna = await named('Anna Bartošová');
      await named('Boris Cibuľa');

      const found = await people(`?userIds=${anna.user.id}`);

      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ userId: anna.user.id });
    });

    it('takes several ids, comma-separated', async () => {
      const anna = await named('Anna Bartošová');
      const boris = await named('Boris Cibuľa');
      await named('Cyril Dudáš');

      const found = await people(`?userIds=${anna.user.id},${boris.user.id}`);

      expect(found.map((entry) => entry.userId).toSorted()).toEqual(
        [anna.user.id, boris.user.id].toSorted(),
      );
    });

    it('takes them as a repeated parameter too', async () => {
      const anna = await named('Anna Bartošová');
      const boris = await named('Boris Cibuľa');

      const found = await people(`?userIds=${anna.user.id}&userIds=${boris.user.id}`);

      expect(found).toHaveLength(2);
    });

    it('still carries their roles, which is the point of asking here', async () => {
      const anna = await named('Anna Bartošová');

      const found = await people(`?userIds=${anna.user.id}`);

      expect(found[0]?.roles).toMatchObject([{ role: 'registrar', source: 'granted' }]);
    });

    it('will not resolve somebody from another institution', async () => {
      const other = await harness.actingAs();
      await grantInDatabase(other.user.id, otherInstitutionId);

      expect(await people(`?userIds=${other.user.id}`)).toEqual([]);
    });

    it('silently drops an id nobody here holds, rather than failing the page', async () => {
      const anna = await named('Anna Bartošová');

      const found = await people(
        `?userIds=${anna.user.id},00000000-0000-4000-8000-000000000000`,
      );

      expect(found).toHaveLength(1);
    });

    it('refuses something that is not an id', async () => {
      expect((await list('?userIds=not-a-uuid')).statusCode).toBe(400);
    });

    it('refuses more ids than a page of rows could name', async () => {
      const tooMany = Array.from(
        { length: 201 },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ).join(',');

      expect((await list(`?userIds=${tooMany}`)).statusCode).toBe(400);
    });
  });
});

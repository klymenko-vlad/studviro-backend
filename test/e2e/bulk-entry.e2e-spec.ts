import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  institutions,
  programMemberships,
  programs,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Bulk entry (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;

  const actingAs = async (role: CanonicalRole, email?: string) => {
    const actor = await harness.actingAs(email === undefined ? {} : { email });
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const post = (
    actor: { headers: { authorization: string } },
    what: 'course-offerings' | 'program-members',
    text: string,
    dryRun?: boolean,
  ) =>
    harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/bulk/${what}`,
      headers: actor.headers,
      payload: dryRun === undefined ? { text } : { text, dryRun },
    });

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [institution] = await harness.db
      .insert(institutions)
      .values({ code: 'upjs', name: 'UPJŠ' })
      .returning();
    institutionId = institution!.id;

    await harness.db.insert(courses).values([
      { institutionId, code: 'INF/ALG/22', title: 'Algorithms' },
      { institutionId, code: 'INF/DB/22', title: 'Databases' },
    ]);
    await harness.db.insert(academicTerms).values({
      institutionId,
      code: '2026W',
      name: 'Winter 2026/2027',
      academicYear: '2026/2027',
      startsAt: new Date('2026-09-21T00:00:00.000Z'),
      endsAt: new Date('2027-02-14T00:00:00.000Z'),
    });
    await harness.db
      .insert(programs)
      .values({ institutionId, code: 'INF-BC', name: 'Informatics' });
  });

  describe('course offerings', () => {
    const rows = 'courseCode,termCode,capacity\nINF/ALG/22,2026W,60\nINF/DB/22,2026W,40';

    it('previews without writing, by default', async () => {
      const admin = await actingAs('institution_admin');

      const response = await post(admin, 'course-offerings', rows);

      expect(response.json()).toMatchObject({ dryRun: true, total: 2, created: 2, failed: 0 });
      await expect(harness.db.select().from(courseOfferings)).resolves.toHaveLength(0);
    });

    it('writes when asked to, and is safe to run twice', async () => {
      const admin = await actingAs('institution_admin');

      const applied = await post(admin, 'course-offerings', rows, false);
      expect(applied.json()).toMatchObject({ dryRun: false, created: 2 });
      await expect(harness.db.select().from(courseOfferings)).resolves.toHaveLength(2);

      const again = await post(admin, 'course-offerings', rows, false);
      expect(again.json()).toMatchObject({ created: 0, skipped: 2 });
      await expect(harness.db.select().from(courseOfferings)).resolves.toHaveLength(2);
    });

    it('reports a bad row and still applies the good ones', async () => {
      const admin = await actingAs('institution_admin');

      const response = await post(
        admin,
        'course-offerings',
        'courseCode,termCode\nINF/ALG/22,2026W\nNOPE/1,2026W\nINF/DB/22,1999X',
        false,
      );

      expect(response.json()).toMatchObject({ total: 3, created: 1, failed: 2 });
      expect(response.json().rows).toEqual([
        expect.objectContaining({ line: 2, status: 'created' }),
        expect.objectContaining({ line: 3, code: 'COURSE_NOT_FOUND' }),
        expect.objectContaining({ line: 4, code: 'TERM_NOT_FOUND' }),
      ]);
      await expect(harness.db.select().from(courseOfferings)).resolves.toHaveLength(1);
    });

    it('refuses a capacity that is not a number, on that row alone', async () => {
      const admin = await actingAs('institution_admin');

      const response = await post(
        admin,
        'course-offerings',
        'courseCode,termCode,capacity\nINF/ALG/22,2026W,lots',
        false,
      );

      expect(response.json().rows[0]).toMatchObject({ code: 'CAPACITY_NOT_A_NUMBER' });
      await expect(harness.db.select().from(courseOfferings)).resolves.toHaveLength(0);
    });

    it('refuses the whole paste when the columns are missing', async () => {
      const admin = await actingAs('institution_admin');

      const response = await post(admin, 'course-offerings', 'a,b\n1,2');

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('BULK_COLUMNS_MISSING');
    });

    it('will not let a registrar put courses on offer', async () => {
      const registrar = await actingAs('registrar');

      expect((await post(registrar, 'course-offerings', rows)).statusCode).toBe(403);
    });
  });

  describe('programme members', () => {
    it('admits a cohort the institution already knows', async () => {
      const admin = await actingAs('institution_admin');
      const student = await actingAs('registrar', 'cohort1@example.com');

      const response = await post(
        admin,
        'program-members',
        `email,programCode,studyYear\n${student.user.email},INF-BC,1`,
        false,
      );

      expect(response.json()).toMatchObject({ created: 1, failed: 0 });
      await expect(harness.db.select().from(programMemberships)).resolves.toHaveLength(1);
    });

    it('refuses somebody with no account, naming them', async () => {
      const admin = await actingAs('institution_admin');

      const response = await post(
        admin,
        'program-members',
        'email,programCode\nnobody@example.com,INF-BC',
        false,
      );

      expect(response.json().rows[0]).toMatchObject({
        code: 'PERSON_NOT_FOUND',
        status: 'failed',
      });
    });

    it('refuses somebody who has an account but no tie to this institution', async () => {
      const admin = await actingAs('institution_admin');
      const stranger = await harness.actingAs({ email: 'stranger@example.com' });

      const response = await post(
        admin,
        'program-members',
        `email,programCode\n${stranger.user.email},INF-BC`,
        false,
      );

      expect(response.json().rows[0]).toMatchObject({ code: 'PERSON_NOT_IN_INSTITUTION' });
    });

    it('skips somebody already on the programme rather than failing', async () => {
      const admin = await actingAs('institution_admin');
      const student = await actingAs('registrar', 'cohort2@example.com');
      const text = `email,programCode\n${student.user.email},INF-BC`;

      await post(admin, 'program-members', text, false);
      const again = await post(admin, 'program-members', text, false);

      expect(again.json()).toMatchObject({ created: 0, skipped: 1 });
    });

    it('matches an address regardless of how it was typed', async () => {
      const admin = await actingAs('institution_admin');
      const student = await actingAs('registrar', 'cohort3@example.com');

      const response = await post(
        admin,
        'program-members',
        `email,programCode\n  ${student.user.email.toUpperCase()}  ,INF-BC`,
        false,
      );

      expect(response.json()).toMatchObject({ created: 1 });
    });

    it('shows one institution nothing of another’s programmes', async () => {
      const admin = await actingAs('institution_admin');
      const [other] = await harness.db
        .insert(institutions)
        .values({ code: 'stu', name: 'STU' })
        .returning();
      await harness.db
        .insert(programs)
        .values({ institutionId: other!.id, code: 'THEIRS', name: 'Theirs' });

      const response = await post(admin, 'program-members', 'email,programCode\na@b.c,THEIRS');

      expect(response.json().rows[0]).toMatchObject({ code: 'PROGRAM_NOT_FOUND' });
    });
  });
});

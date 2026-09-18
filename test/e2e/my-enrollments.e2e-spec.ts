import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  programMemberships,
  programs,
  roleAssignments,
  type CanonicalRole,
  type NewCourseOffering,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const OPEN_WINDOW = {
  enrollmentOpensAt: new Date('2020-01-01T00:00:00.000Z'),
  enrollmentClosesAt: new Date('2099-01-01T00:00:00.000Z'),
};

describe('My enrollments (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let termId: string;
  let programId: string;
  let offeringId: string;

  const actingAs = async (role: CanonicalRole) => {
    const actor = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  /** A student is somebody with an active programme membership here. */
  const student = async () => {
    const actor = await actingAs('student');
    await harness.db
      .insert(programMemberships)
      .values({ institutionId, programId, userId: actor.user.id, status: 'active' });

    return actor;
  };

  const offeringOf = async (code: string, overrides: Partial<NewCourseOffering> = {}) => {
    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code, title: code, credits: '6.00' })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId,
        courseId: course!.id,
        academicTermId: termId,
        status: 'open',
        ...overrides,
      })
      .returning();

    return offering!.id;
  };

  const enrollable = async (actor: { headers: { authorization: string } }) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/enrollments/enrollable`,
      headers: actor.headers,
    });

  const ask = (actor: { headers: { authorization: string } }, courseOfferingId: string) =>
    harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/me/enrollments`,
      headers: actor.headers,
      payload: { courseOfferingId },
    });

  const drop = (actor: { headers: { authorization: string } }, id: string) =>
    harness.inject({
      method: 'DELETE',
      url: `/api/v1/institutions/${institutionId}/me/enrollments/${id}`,
      headers: actor.headers,
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

    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026-SS',
        name: 'Summer 2026',
        academicYear: '2025/2026',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-30T00:00:00.000Z'),
        ...OPEN_WINDOW,
      })
      .returning();
    termId = term!.id;

    const [program] = await harness.db
      .insert(programs)
      .values({ institutionId, code: 'INF-BC', name: 'Informatics', degreeLevel: 'bachelor' })
      .returning();
    programId = program!.id;

    offeringId = await offeringOf('INF/ALG/22');
  });

  describe('what is on offer', () => {
    it('offers a course a student may take', async () => {
      const actor = await student();

      const response = await enrollable(actor);

      expect(response.statusCode).toBe(200);
      expect(response.json()[0]).toMatchObject({
        id: offeringId,
        availability: { canEnroll: true, reason: 'open' },
      });
    });

    it('says a person with no programme is not a student here', async () => {
      const actor = await actingAs('student');

      expect((await enrollable(actor)).json()[0].availability.reason).toBe('not_a_student');
    });
  });

  describe('asking for a place', () => {
    it('grants the place outright where no connector can be told', async () => {
      const actor = await student();

      const response = await ask(actor, offeringId);

      expect(response.statusCode).toBe(201);
      // No academic connector is configured here, so there is nobody to ask and
      // the request is not left hanging on an answer that will never come.
      expect(response.json()).toMatchObject({
        status: 'active',
      });
    });

    it('refuses a second request for a place already asked for', async () => {
      const actor = await student();
      await ask(actor, offeringId);

      expect((await ask(actor, offeringId)).statusCode).toBe(409);
    });

    it('refuses a full course', async () => {
      const actor = await student();
      const full = await offeringOf('INF/DB/22', { capacity: 1 });
      const other = await student();
      await ask(other, full);

      const response = await ask(actor, full);

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('OFFERING_FULL');
    });

    it('refuses somebody with no programme membership', async () => {
      const actor = await actingAs('student');

      const response = await ask(actor, offeringId);

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('ENROLLMENT_NOT_A_STUDENT');
    });

    it('refuses once the window has closed', async () => {
      const actor = await student();
      const closed = await offeringOf('INF/OS/22');
      await harness.db
        .update(academicTerms)
        .set({ enrollmentClosesAt: new Date('2020-02-01T00:00:00.000Z') });

      expect((await ask(actor, closed)).json().code).toBe('ENROLLMENT_CLOSED');
    });
  });

  describe('withdrawing', () => {
    it('withdraws a place and frees it for somebody else', async () => {
      const actor = await student();
      const limited = await offeringOf('INF/NET/22', { capacity: 1 });
      const id = (await ask(actor, limited)).json().id;

      const response = await drop(actor, id);

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('withdrawn');

      const other = await student();

      expect((await ask(other, limited)).statusCode).toBe(201);
    });

    it('lets the same student ask again, reusing the row rather than opening a second', async () => {
      const actor = await student();
      const id = (await ask(actor, offeringId)).json().id;
      await drop(actor, id);

      const again = await ask(actor, offeringId);

      expect(again.statusCode).toBe(201);
      expect(again.json().id).toBe(id);

      const rows = await harness.db.select().from(enrollments);

      expect(rows).toHaveLength(1);
    });

    it('refuses to withdraw somebody else’s place', async () => {
      const actor = await student();
      const stranger = await student();
      const id = (await ask(actor, offeringId)).json().id;

      expect((await drop(stranger, id)).statusCode).toBe(404);
    });
  });

  describe('the feature flag', () => {
    it('closes the whole surface when the institution turns course registration off', async () => {
      const admin = await actingAs('institution_admin');
      await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: admin.headers,
        payload: { features: { courseRegistration: false } },
      });
      const actor = await student();

      expect((await enrollable(actor)).statusCode).toBe(403);
      expect((await ask(actor, offeringId)).json().code).toBe('FEATURE_DISABLED');
    });
  });
});

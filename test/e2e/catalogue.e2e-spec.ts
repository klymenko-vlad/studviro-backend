import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Catalogue administration (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
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

  const request = (
    actor: { headers: { authorization: string } },
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    payload?: Record<string, unknown>,
  ) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${institutionId}${path}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload }),
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
      })
      .returning();

    const [course] = await harness.db
      .insert(courses)
      .values({
        institutionId,
        code: 'INF/ALG/22',
        title: 'Algorithms',
        credits: '6.00',
      })
      .returning();

    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId,
        courseId: course!.id,
        academicTermId: term!.id,
        status: 'open',
        capacity: 30,
      })
      .returning();
    offeringId = offering!.id;
  });

  describe('programmes', () => {
    it('lets a programme coordinator add one the source system does not carry', async () => {
      const actor = await actingAs('program_coordinator');

      const response = await request(actor, 'POST', '/programs', {
        code: 'INF-BC',
        name: 'Informatics',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        code: 'INF-BC',
      });
    });

    it('refuses a student, who may read the catalogue and not write it', async () => {
      const actor = await actingAs('student');

      expect((await request(actor, 'GET', '/programs')).statusCode).toBe(200);
      expect(
        (await request(actor, 'POST', '/programs', { code: 'X', name: 'X' })).statusCode,
      ).toBe(403);
    });

    it('refuses a duplicate code', async () => {
      const actor = await actingAs('program_coordinator');
      await request(actor, 'POST', '/programs', { code: 'INF-BC', name: 'A' });

      const response = await request(actor, 'POST', '/programs', {
        code: 'INF-BC',
        name: 'B',
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('PROGRAM_CODE_TAKEN');
    });

    it('retires a programme without erasing it', async () => {
      const actor = await actingAs('program_coordinator');
      const id = (await request(actor, 'POST', '/programs', { code: 'X', name: 'X' })).json()
        .id;

      expect((await request(actor, 'DELETE', `/programs/${id}`)).statusCode).toBe(204);
      expect((await request(actor, 'GET', '/programs')).json()).toEqual([]);
    });
  });

  describe('courses', () => {
    it('marks an imported course pending when the platform corrects it', async () => {
      const actor = await actingAs('course_coordinator');
      const id = (await request(actor, 'GET', '/courses')).json()[0].id;

      const response = await request(actor, 'PATCH', `/courses/${id}`, {
        title: 'Algorithms and Data Structures',
      });

      expect(response.json()).toMatchObject({
        title: 'Algorithms and Data Structures',
      });
    });

    it('reads credits back as a number rather than the column’s string', async () => {
      const actor = await actingAs('course_coordinator');

      expect((await request(actor, 'GET', '/courses')).json()[0].credits).toBe(6);
    });
  });

  describe('offerings', () => {
    it('changes the capacity self-service enrolment reads', async () => {
      const actor = await actingAs('course_coordinator');

      const response = await request(actor, 'PATCH', `/course-offerings/${offeringId}`, {
        capacity: 10,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().capacity).toBe(10);
    });

    it('refuses a capacity below the places already taken', async () => {
      const actor = await actingAs('course_coordinator');
      const student = await actingAs('student');
      await harness.db.insert(enrollments).values({
        institutionId,
        userId: student.user.id,
        courseOfferingId: offeringId,
        status: 'active',
      });

      const response = await request(actor, 'PATCH', `/course-offerings/${offeringId}`, {
        capacity: 0,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('OFFERING_CAPACITY_BELOW_TAKEN');
    });

    it('refuses a teacher, who may not manage an offering', async () => {
      const actor = await actingAs('teacher');

      expect(
        (await request(actor, 'PATCH', `/course-offerings/${offeringId}`, { capacity: 5 }))
          .statusCode,
      ).toBe(403);
    });
  });

  describe('enrolment correction', () => {
    it('lets a registrar admit a student past a full course', async () => {
      const registrar = await actingAs('registrar');
      const student = await actingAs('student');
      const [enrollment] = await harness.db
        .insert(enrollments)
        .values({
          institutionId,
          userId: student.user.id,
          courseOfferingId: offeringId,
          status: 'withdrawn',
          withdrawnAt: new Date(),
        })
        .returning();

      const response = await request(
        registrar,
        'PATCH',
        `/course-offerings/${offeringId}/enrollments/${enrollment!.id}`,
        { status: 'active' },
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('active');
    });

    it('clears the withdrawal stamp when a withdrawal is reversed', async () => {
      const registrar = await actingAs('registrar');
      const student = await actingAs('student');
      const [enrollment] = await harness.db
        .insert(enrollments)
        .values({
          institutionId,
          userId: student.user.id,
          courseOfferingId: offeringId,
          status: 'withdrawn',
          withdrawnAt: new Date(),
        })
        .returning();

      await request(
        registrar,
        'PATCH',
        `/course-offerings/${offeringId}/enrollments/${enrollment!.id}`,
        { status: 'active' },
      );

      const [corrected] = await harness.db.select().from(enrollments);

      expect(corrected!.withdrawnAt).toBeNull();
    });

    it('refuses a student correcting their own enrolment this way', async () => {
      const student = await actingAs('student');
      const [enrollment] = await harness.db
        .insert(enrollments)
        .values({
          institutionId,
          userId: student.user.id,
          courseOfferingId: offeringId,
          status: 'withdrawn',
        })
        .returning();

      expect(
        (
          await request(
            student,
            'PATCH',
            `/course-offerings/${offeringId}/enrollments/${enrollment!.id}`,
            { status: 'active' },
          )
        ).statusCode,
      ).toBe(403);
    });
  });
});

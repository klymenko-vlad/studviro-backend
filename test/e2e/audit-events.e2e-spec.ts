import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  auditEvents,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  teachingAssignments,
  type AuditEvent,
  type CanonicalRole,
} from '../../src/database/schema';
import { TransactionHost } from '../../src/database/transaction.host';
import { AuditService } from '../../src/modules/audit/audit.service';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('Audit events (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;

  const actingAs = async (role: CanonicalRole, inInstitution = institutionId) => {
    const actor = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId: inInstitution,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });

    return actor;
  };

  const teaching = async () => {
    const actor = await actingAs('teacher');
    await harness.db
      .insert(teachingAssignments)
      .values({ institutionId, courseOfferingId: offeringId, userId: actor.user.id });

    return actor;
  };

  const enrol = async (userId: string) =>
    only(
      await harness.db
        .insert(enrollments)
        .values({ institutionId, userId, courseOfferingId: offeringId, status: 'active' })
        .returning(),
    ).id;

  const recordGrade = (
    actor: ActingUser,
    enrollmentId: string,
    payload: Record<string, unknown>,
  ) =>
    harness.inject({
      method: 'PUT',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/results/${enrollmentId}`,
      headers: actor.headers,
      payload,
    });

  const events = (): Promise<AuditEvent[]> =>
    harness.db.select().from(auditEvents).where(eq(auditEvents.institutionId, institutionId));

  const list = (actor: ActingUser, query = '') =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/audit-events${query}`,
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

    institutionId = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    ).id;

    const term = only(
      await harness.db
        .insert(academicTerms)
        .values({
          institutionId,
          code: '2026-SS',
          name: 'Summer 2026',
          academicYear: '2025/2026',
          startsAt: new Date('2026-02-01T00:00:00.000Z'),
          endsAt: new Date('2026-06-30T00:00:00.000Z'),
        })
        .returning(),
    );

    const course = only(
      await harness.db
        .insert(courses)
        .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms', credits: '6.00' })
        .returning(),
    );

    offeringId = only(
      await harness.db
        .insert(courseOfferings)
        .values({ institutionId, courseId: course.id, academicTermId: term.id })
        .returning(),
    ).id;
  });

  describe('what an audited action leaves behind', () => {
    it('writes exactly one event naming the actor when a grade is published', async () => {
      const teacher = await teaching();
      const student = await actingAs('student');
      const enrollmentId = await enrol(student.user.id);

      expect(
        (await recordGrade(teacher, enrollmentId, { officialGrade: 'A' })).statusCode,
      ).toBe(200);

      const written = await events();
      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        action: 'grade.published',
        subjectType: 'course_result',
        actorUserId: teacher.user.id,
        institutionId,
        before: null,
        after: { officialGrade: 'A', status: 'official' },
      });
      expect(written[0]?.requestId).toEqual(expect.any(String));
    });

    it('keeps the grade a correction replaced as the before value', async () => {
      const teacher = await teaching();
      const student = await actingAs('student');
      const enrollmentId = await enrol(student.user.id);

      await recordGrade(teacher, enrollmentId, { officialGrade: 'A', attempt: 1 });
      await recordGrade(teacher, enrollmentId, { officialGrade: 'B', attempt: 1 });

      const written = await events();
      expect(written).toHaveLength(2);
      expect(written.at(-1)).toMatchObject({
        action: 'grade.published',
        before: { officialGrade: 'A' },
        after: { officialGrade: 'B', status: 'corrected' },
      });
    });

    it('separates proposing a grade from publishing one', async () => {
      const teacher = await teaching();
      const student = await actingAs('student');
      const enrollmentId = await enrol(student.user.id);

      await recordGrade(teacher, enrollmentId, { proposedGrade: 'C' });

      expect(await events()).toMatchObject([
        { action: 'grade.proposed', after: { proposedGrade: 'C' } },
      ]);
    });

    it('records a role grant and the revocation that undoes it', async () => {
      const admin = await actingAs('institution_admin');
      const subject = await harness.actingAs();

      const granted = await harness.inject({
        method: 'POST',
        url: `/api/v1/institutions/${institutionId}/role-assignments`,
        headers: admin.headers,
        payload: { userId: subject.user.id, role: 'registrar', scopeType: 'institution' },
      });
      expect(granted.statusCode).toBe(201);

      await harness.inject({
        method: 'DELETE',
        url: `/api/v1/institutions/${institutionId}/role-assignments/${granted.json().id}`,
        headers: admin.headers,
      });

      expect(await events()).toMatchObject([
        {
          action: 'role.granted',
          actorUserId: admin.user.id,
          before: null,
          after: { role: 'registrar', userId: subject.user.id },
        },
        {
          action: 'role.revoked',
          actorUserId: admin.user.id,
          before: { role: 'registrar', userId: subject.user.id },
          after: null,
        },
      ]);
    });

    it('records the registrar’s enrolment correction with the status it replaced', async () => {
      const registrar = await actingAs('registrar');
      const student = await actingAs('student');
      const enrollmentId = await enrol(student.user.id);

      const corrected = await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/enrollments/${enrollmentId}`,
        headers: registrar.headers,
        payload: { status: 'withdrawn' },
      });
      expect(corrected.statusCode).toBe(200);

      expect(await events()).toMatchObject([
        {
          action: 'enrollment.corrected',
          subjectId: enrollmentId,
          actorUserId: registrar.user.id,
          before: { status: 'active' },
          after: { status: 'withdrawn' },
        },
      ]);
    });
  });

  describe('when the action fails', () => {
    it('leaves no event behind, because the record shares the transaction', async () => {
      const audit = harness.app.get(AuditService);
      const txHost = harness.app.get(TransactionHost);

      await expect(
        txHost.run(async () => {
          await audit.record({
            institutionId,
            actorUserId: null,
            action: 'enrollment.corrected',
            subjectType: 'enrollment',
            subjectId: offeringId,
          });

          throw new Error('the audited action failed');
        }),
      ).rejects.toThrow('the audited action failed');

      expect(await events()).toEqual([]);
    });

    it('writes nothing when the write it would describe was refused', async () => {
      const teacher = await teaching();
      const student = await actingAs('student');
      const enrollmentId = await enrol(student.user.id);

      const refused = await recordGrade(teacher, enrollmentId, {});

      expect(refused.statusCode).toBe(400);
      expect(await events()).toEqual([]);
    });
  });

  describe('reading the log', () => {
    it('rejects an anonymous caller', async () => {
      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/audit-events`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('refuses a registrar, who does not hold audit:read', async () => {
      const registrar = await actingAs('registrar');

      expect((await list(registrar)).statusCode).toBe(403);
    });

    it('refuses an org unit manager, who does not hold audit:read either', async () => {
      const manager = await actingAs('org_unit_manager');

      expect((await list(manager)).statusCode).toBe(403);
    });

    it('serves the institution admin the events of their own institution, newest first', async () => {
      const admin = await actingAs('institution_admin');
      const subject = await harness.actingAs();

      await harness.inject({
        method: 'POST',
        url: `/api/v1/institutions/${institutionId}/role-assignments`,
        headers: admin.headers,
        payload: { userId: subject.user.id, role: 'registrar', scopeType: 'institution' },
      });

      const response = await list(admin);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        items: [{ action: 'role.granted', actorUserId: admin.user.id }],
        meta: { hasNextPage: false, nextCursor: null },
      });
    });

    it('never shows another institution’s events', async () => {
      const admin = await actingAs('institution_admin');
      const other = only(
        await harness.db
          .insert(institutions)
          .values({ code: 'tuke', name: 'TUKE' })
          .returning(),
      );
      const outsider = await actingAs('institution_admin', other.id);

      await harness.db.insert(auditEvents).values({
        institutionId: other.id,
        actorUserId: outsider.user.id,
        action: 'role.granted',
        subjectType: 'role_assignment',
        subjectId: other.id,
        summary: 'Granted registrar at institution',
      });

      expect((await list(admin)).json().items).toEqual([]);

      const theirs = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${other.id}/audit-events`,
        headers: outsider.headers,
      });
      expect(theirs.json().items).toHaveLength(1);
    });

    it('pages by keyset without repeating a row', async () => {
      const admin = await actingAs('institution_admin');
      await harness.db.insert(auditEvents).values(
        [1, 2, 3].map((index) => ({
          institutionId,
          actorUserId: admin.user.id,
          action: 'role.granted' as const,
          subjectType: 'role_assignment' as const,
          subjectId: institutionId,
          occurredAt: new Date(`2026-09-1${index}T00:00:00.000Z`),
        })),
      );

      const first = await list(admin, '?limit=2');
      expect(first.json().items).toHaveLength(2);
      expect(first.json().meta.hasNextPage).toBe(true);

      const second = await list(
        admin,
        `?limit=2&cursor=${encodeURIComponent(first.json().meta.nextCursor)}`,
      );
      expect(second.json().items).toHaveLength(1);
      expect(second.json().items[0].occurredAt).not.toBe(first.json().items[1].occurredAt);
    });

    it('narrows to one subject', async () => {
      const admin = await actingAs('institution_admin');
      const student = await actingAs('student');
      const enrollmentId = await enrol(student.user.id);

      await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/course-offerings/${offeringId}/enrollments/${enrollmentId}`,
        headers: admin.headers,
        payload: { status: 'withdrawn' },
      });

      const response = await list(admin, `?subjectType=enrollment&subjectId=${enrollmentId}`);

      expect(response.json().items).toMatchObject([
        { action: 'enrollment.corrected', subjectId: enrollmentId },
      ]);
    });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  roleAssignments,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  users,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Course offering detail (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let otherOfferingId: string;

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

  const read = (actor: { headers: Record<string, string> }, id = offeringId) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/course-offerings/${id}`,
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
      })
      .returning();

    const [algorithms, databases] = await harness.db
      .insert(courses)
      .values([
        {
          institutionId,
          code: 'INF/ALG/22',
          title: 'Algorithms',
          description: 'Complexity and design',
          credits: '6.00',
        },
        { institutionId, code: 'INF/DB/22', title: 'Databases', credits: '5.00' },
      ])
      .returning();

    const [offering, other] = await harness.db
      .insert(courseOfferings)
      .values([
        {
          institutionId,
          courseId: algorithms!.id,
          academicTermId: term!.id,
          status: 'running',
          language: 'sk',
          capacity: 120,
        },
        { institutionId, courseId: databases!.id, academicTermId: term!.id },
      ])
      .returning();
    offeringId = offering!.id;
    otherOfferingId = other!.id;
  });

  it('returns the offering, its staff, the caller’s enrolment and study groups', async () => {
    const actor = await actingAs('student');

    const [teacher] = await harness.db
      .insert(users)
      .values({
        email: 'lecturer@example.com',
        displayName: 'Dr Lecturer',
        passwordHash: 'unusable',
      })
      .returning();
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: teacher!.id,
      role: 'lecturer',
      isPrimary: true,
    });

    await harness.db.insert(enrollments).values({
      institutionId,
      userId: actor.user.id,
      courseOfferingId: offeringId,
      status: 'active',
    });

    const [group, unrelated] = await harness.db
      .insert(studyGroups)
      .values([
        { institutionId, courseOfferingId: offeringId, code: 'S1', name: 'Monday seminar' },
        { institutionId, courseOfferingId: offeringId, code: 'S2' },
      ])
      .returning();
    await harness.db
      .insert(studyGroupMemberships)
      .values({ institutionId, studyGroupId: group!.id, userId: actor.user.id });

    const response = await read(actor);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      offering: { id: offeringId, status: 'running', language: 'sk', capacity: 120 },
      course: { code: 'INF/ALG/22', title: 'Algorithms', credits: 6 },
      term: { code: '2026-SS', academicYear: '2025/2026' },
      teachers: [{ displayName: 'Dr Lecturer', role: 'lecturer', isPrimary: true }],
      enrollment: { status: 'active', requirementType: 'compulsory', attempt: 1 },
      studyGroups: [{ code: 'S1', name: 'Monday seminar', kind: 'seminar' }],
      viewerRole: 'student',
    });
    expect(response.json().studyGroups).toHaveLength(1);
    expect(unrelated!.code).toBe('S2');
  });

  it('serves the offering’s teacher without an enrolment', async () => {
    const actor = await actingAs('teacher');
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: actor.user.id,
      role: 'lecturer',
    });

    const response = await read(actor);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ viewerRole: 'teacher', enrollment: null });
  });

  it('serves an institution administrator any offering', async () => {
    const actor = await actingAs('institution_admin');

    const response = await read(actor);

    expect(response.statusCode).toBe(200);
    expect(response.json().viewerRole).toBe('administrator');
  });

  it('refuses an offering the caller neither takes nor teaches', async () => {
    const actor = await actingAs('student');
    await harness.db.insert(enrollments).values({
      institutionId,
      userId: actor.user.id,
      courseOfferingId: offeringId,
      status: 'active',
    });

    const response = await read(actor, otherOfferingId);

    expect(response.statusCode).toBe(403);
  });

  it('refuses a caller with no role in the institution', async () => {
    const actor = await harness.actingAs();

    expect((await read(actor)).statusCode).toBe(403);
  });

  it('reports an unknown offering as not found', async () => {
    const actor = await actingAs('institution_admin');

    const response = await read(actor, '11111111-1111-4111-8111-111111111111');

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('COURSE_OFFERING_NOT_FOUND');
  });

  it('rejects an offering id that is not a uuid', async () => {
    const actor = await actingAs('institution_admin');

    expect((await read(actor, 'not-a-uuid')).statusCode).toBe(400);
  });

  it('hides an offering from another institution', async () => {
    const actor = await actingAs('institution_admin');

    const [otherInstitution] = await harness.db
      .insert(institutions)
      .values({ code: 'tuke', name: 'TUKE' })
      .returning();
    const [otherTerm] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId: otherInstitution!.id,
        code: '2026-SS',
        name: 'Summer 2026',
        academicYear: '2025/2026',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-06-30T00:00:00.000Z'),
      })
      .returning();
    const [foreignCourse] = await harness.db
      .insert(courses)
      .values({ institutionId: otherInstitution!.id, code: 'INF/OS/22', title: 'Systems' })
      .returning();
    const [foreignOffering] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId: otherInstitution!.id,
        courseId: foreignCourse!.id,
        academicTermId: otherTerm!.id,
      })
      .returning();

    expect((await read(actor, foreignOffering!.id)).statusCode).toBe(404);
  });

  it('omits a soft-deleted study group membership', async () => {
    const actor = await actingAs('student');
    await harness.db.insert(enrollments).values({
      institutionId,
      userId: actor.user.id,
      courseOfferingId: offeringId,
      status: 'active',
    });
    const [group] = await harness.db
      .insert(studyGroups)
      .values({ institutionId, courseOfferingId: offeringId, code: 'S1' })
      .returning();
    await harness.db.insert(studyGroupMemberships).values({
      institutionId,
      studyGroupId: group!.id,
      userId: actor.user.id,
      deletedAt: new Date(),
    });

    expect((await read(actor)).json().studyGroups).toEqual([]);
  });
});

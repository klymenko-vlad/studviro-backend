import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  institutions,
  orgUnits,
  programs,
  roleAssignments,
  rooms,
  teachingAssignments,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Search (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let offeringId: string;
  let otherOfferingId: string;

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

  const find = async (actor: { headers: { authorization: string } }, q: string) => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/search?q=${encodeURIComponent(q)}`,
      headers: actor.headers,
    });

    return response;
  };

  const kinds = (body: { hits: { kind: string }[] }) => [
    ...new Set(body.hits.map((hit) => hit.kind)),
  ];

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

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
      .returning();
    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026W',
        name: 'Winter 2026/2027',
        academicYear: '2026/2027',
        startsAt: new Date('2026-09-21T00:00:00.000Z'),
        endsAt: new Date('2027-02-14T00:00:00.000Z'),
      })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: term!.id })
      .returning();
    offeringId = offering!.id;
    const [otherCourse] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG2/22', title: 'Algorithms II' })
      .returning();
    const [otherOffering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: otherCourse!.id, academicTermId: term!.id })
      .returning();
    otherOfferingId = otherOffering!.id;
    await harness.db
      .insert(programs)
      .values({ institutionId, code: 'INF-BC', name: 'Algorithmic Informatics' });
    await harness.db
      .insert(orgUnits)
      .values({ institutionId, code: 'FEI', name: 'Faculty of Informatics' });
    await harness.db
      .insert(rooms)
      .values({ institutionId, code: 'ALG-101', name: 'Algorithms lab', building: 'Blok A' });
  });

  it('finds one thing across several kinds at once', async () => {
    const admin = await actingAs('institution_admin');

    const response = await find(admin, 'algorithm');

    expect(response.statusCode).toBe(200);
    expect(kinds(response.json())).toEqual(
      expect.arrayContaining(['course', 'offering', 'program', 'room']),
    );
  });

  it('matches a code as readily as a name', async () => {
    const admin = await actingAs('institution_admin');

    const response = await find(admin, 'INF/ALG');

    expect(response.json().hits.some((hit: { kind: string }) => hit.kind === 'course')).toBe(
      true,
    );
  });

  it('carries enough context to build a link without asking again', async () => {
    const admin = await actingAs('institution_admin');

    const offering = (await find(admin, 'algorithms'))
      .json()
      .hits.find((hit: { kind: string }) => hit.kind === 'offering');

    expect(offering).toMatchObject({
      offeringId: expect.any(String),
      context: 'Winter 2026/2027',
    });
  });

  it('searches only the kinds the caller may read, and says which', async () => {
    const student = await actingAs('student');

    const body = (await find(student, 'algorithm')).json();

    // A student holds the reads but not role:read, so people and org units are
    // never queried — and the response says so rather than returning nothing.
    expect(body.searched).toEqual(
      expect.arrayContaining(['course', 'offering', 'program', 'room']),
    );
    expect(body.searched).not.toContain('person');
    expect(body.searched).not.toContain('orgUnit');
    expect(kinds(body)).not.toContain('person');
  });

  const offeringIds = (body: { hits: { kind: string; offeringId: string | null }[] }) =>
    body.hits.filter((hit) => hit.kind === 'offering').map((hit) => hit.offeringId);

  it('offers a student only the course pages they can open — the ones they take', async () => {
    const student = await actingAs('student');
    await harness.db.insert(enrollments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: student.user.id,
      status: 'active',
    });

    const body = (await find(student, 'algorithms')).json();

    expect(offeringIds(body)).toEqual([offeringId]);
  });

  it('does not count a withdrawn enrolment as a way in', async () => {
    const student = await actingAs('student');
    await harness.db.insert(enrollments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: student.user.id,
      status: 'withdrawn',
    });

    expect(offeringIds((await find(student, 'algorithms')).json())).toEqual([]);
  });

  it('offers a teacher the courses they teach', async () => {
    const teacher = await actingAs('teacher');
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: otherOfferingId,
      userId: teacher.user.id,
    });

    expect(offeringIds((await find(teacher, 'algorithms')).json())).toEqual([otherOfferingId]);
  });

  it('offers an administrator every course page', async () => {
    const admin = await actingAs('institution_admin');

    expect(offeringIds((await find(admin, 'algorithms')).json())).toEqual(
      expect.arrayContaining([offeringId, otherOfferingId]),
    );
  });

  it('lists only people the institution actually has', async () => {
    const admin = await actingAs('institution_admin', 'searcher@example.com');
    await harness.actingAs({ email: 'outsider@example.com' });

    const body = (await find(admin, 'example.com')).json();
    const people = body.hits.filter((hit: { kind: string }) => hit.kind === 'person');

    expect(
      people.some((hit: { subtitle: string }) => hit.subtitle === 'searcher@example.com'),
    ).toBe(true);
    expect(
      people.some((hit: { subtitle: string }) => hit.subtitle === 'outsider@example.com'),
    ).toBe(false);
  });

  const teacherHits = (body: { hits: { kind: string; id: string; subtitle: string }[] }) =>
    body.hits.filter((hit) => hit.kind === 'teacher');

  const teaching = async (email: string) => {
    const teacher = await harness.actingAs({ email });
    await harness.db.insert(teachingAssignments).values({
      institutionId,
      courseOfferingId: offeringId,
      userId: teacher.user.id,
    });

    return teacher;
  };

  it('lets a student find any teacher of the institution', async () => {
    const student = await actingAs('student');
    const peter = await teaching('peter.novak@example.com');

    const body = (await find(student, 'peter')).json();

    expect(body.searched).toContain('teacher');
    expect(teacherHits(body)).toEqual([
      expect.objectContaining({ id: peter.user.id, subtitle: 'peter.novak@example.com' }),
    ]);
  });

  it('does not offer a student anybody who teaches nothing here', async () => {
    const student = await actingAs('student');
    await harness.actingAs({ email: 'peter.outsider@example.com' });
    const registrar = await actingAs('registrar', 'peter.registrar@example.com');

    const ids = teacherHits((await find(student, 'peter')).json()).map((hit) => hit.id);

    expect(ids).not.toContain(registrar.user.id);
    expect(ids).toEqual([]);
  });

  it('does not list a teacher twice for a reader who already searches people', async () => {
    const admin = await actingAs('institution_admin');
    await teaching('peter.novak@example.com');

    const body = (await find(admin, 'peter')).json();

    expect(body.searched).toContain('person');
    expect(body.searched).not.toContain('teacher');
  });

  it('answers a one-character query with nothing rather than everything', async () => {
    const admin = await actingAs('institution_admin');

    const body = (await find(admin, 'a')).json();

    expect(body.hits).toEqual([]);
    expect(body.searched).toEqual([]);
  });

  it('treats a wildcard as text, so % does not return the catalogue', async () => {
    const admin = await actingAs('institution_admin');

    expect((await find(admin, '%%')).json().hits).toEqual([]);
    expect((await find(admin, '__')).json().hits).toEqual([]);
  });

  it('shows one institution nothing of another’s', async () => {
    const admin = await actingAs('institution_admin');
    const [other] = await harness.db
      .insert(institutions)
      .values({ code: 'stu', name: 'STU' })
      .returning();
    await harness.db
      .insert(courses)
      .values({ institutionId: other!.id, code: 'X/ALG/1', title: 'Algorithms elsewhere' });

    const titles = (await find(admin, 'algorithms'))
      .json()
      .hits.map((hit: { title: string }) => hit.title);

    expect(titles).not.toContain('Algorithms elsewhere');
  });

  it('turns an anonymous caller away', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/search?q=algorithms`,
    });

    expect(response.statusCode).toBe(401);
  });
});

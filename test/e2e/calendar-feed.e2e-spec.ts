import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  calendarFeeds,
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  institutions,
  roleAssignments,
  timetableEvents,
  type CanonicalRole,
} from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);

interface Actor {
  user: { id: string };
  headers: { authorization: string };
}

describe('Calendar feed (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let algorithmsId: string;
  let databasesId: string;

  const actingAs = async (role: CanonicalRole): Promise<Actor> => {
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

  const enrol = (userId: string, courseOfferingId: string) =>
    harness.db
      .insert(enrollments)
      .values({ institutionId, userId, courseOfferingId, status: 'active' });

  const issue = async (actor: Actor) => {
    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/me/calendar-feed`,
      headers: actor.headers,
    });
    expect(response.statusCode).toBe(201);

    return response.json<{ url: string; createdAt: string }>();
  };

  const poll = (url: string) => harness.inject({ method: 'GET', url: new URL(url).pathname });

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
      .values({ code: 'ukf', name: 'UKF Nitra' })
      .returning();
    institutionId = institution!.id;

    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: 'NOW',
        name: 'Current term',
        academicYear: '2026/2027',
        startsAt: inDays(-60),
        endsAt: inDays(120),
      })
      .returning();

    const [algorithms, databases] = await harness.db
      .insert(courses)
      .values([
        { institutionId, code: 'INF/ALG', title: 'Algorithms' },
        { institutionId, code: 'INF/DB', title: 'Databases' },
      ])
      .returning();

    const offerings = await harness.db
      .insert(courseOfferings)
      .values(
        [algorithms!, databases!].map((course) => ({
          institutionId,
          courseId: course.id,
          academicTermId: term!.id,
          status: 'running' as const,
        })),
      )
      .returning();
    algorithmsId = offerings[0]!.id;
    databasesId = offerings[1]!.id;

    await harness.db.insert(timetableEvents).values([
      {
        institutionId,
        courseOfferingId: algorithmsId,
        type: 'lecture',
        title: null,
        startsAt: inDays(2),
        endsAt: new Date(inDays(2).getTime() + 90 * 60 * 1000),
      },
      {
        institutionId,
        courseOfferingId: databasesId,
        type: 'seminar',
        title: 'Databases seminar',
        startsAt: inDays(3),
        endsAt: new Date(inDays(3).getTime() + 90 * 60 * 1000),
      },
    ]);
  });

  it('serves a subscription as iCalendar with the owner’s classes and nothing else', async () => {
    const student = await actingAs('student');
    await enrol(student.user.id, algorithmsId);
    const { url } = await issue(student);

    const response = await poll(url);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/calendar');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(response.body).toContain('SUMMARY:Algorithms – Lecture');
    expect(response.body).not.toContain('Databases');
  });

  it('includes an exam term only once the student holds a seat on it', async () => {
    const student = await actingAs('student');
    await enrol(student.user.id, algorithmsId);
    const [term] = await harness.db
      .insert(examTerms)
      .values({
        institutionId,
        courseOfferingId: algorithmsId,
        kind: 'regular',
        startsAt: inDays(20),
      })
      .returning();
    const { url } = await issue(student);

    expect((await poll(url)).body).not.toContain('Exam:');

    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId: term!.id,
      userId: student.user.id,
      status: 'registered',
      registeredAt: new Date(),
    });

    expect((await poll(url)).body).toContain('SUMMARY:Exam: Algorithms (regular term)');
  });

  it('keeps no usable token in the database', async () => {
    const student = await actingAs('student');
    const { url } = await issue(student);
    const token = new URL(url).pathname.split('/').at(-1)!.replace('.ics', '');

    const [row] = await harness.db
      .select()
      .from(calendarFeeds)
      .where(eq(calendarFeeds.userId, student.user.id));

    expect(row!.tokenHash).not.toContain(token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers a token nobody was issued as not found', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/calendar-feeds/not-a-real-token.ics',
    });

    expect(response.statusCode).toBe(404);
  });

  it('stops the old URL when the owner replaces it', async () => {
    const student = await actingAs('student');
    const first = await issue(student);
    const second = await issue(student);

    expect((await poll(first.url)).statusCode).toBe(404);
    expect((await poll(second.url)).statusCode).toBe(200);
  });

  it('stops the URL when the owner turns it off', async () => {
    const student = await actingAs('student');
    const { url } = await issue(student);

    const revoked = await harness.inject({
      method: 'DELETE',
      url: `/api/v1/institutions/${institutionId}/me/calendar-feed`,
      headers: student.headers,
    });

    expect(revoked.statusCode).toBe(204);
    expect((await poll(url)).statusCode).toBe(404);
  });

  it('stops the URL once the owner no longer holds a role in the institution', async () => {
    const student = await actingAs('student');
    const { url } = await issue(student);

    await harness.db
      .delete(roleAssignments)
      .where(
        and(
          eq(roleAssignments.institutionId, institutionId),
          eq(roleAssignments.userId, student.user.id),
        ),
      );

    expect((await poll(url)).statusCode).toBe(404);
  });

  it('reports whether a feed is live without revealing its URL', async () => {
    const student = await actingAs('student');
    const status = () =>
      harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/me/calendar-feed`,
        headers: student.headers,
      });

    expect((await status()).json()).toEqual({ active: false, createdAt: null });

    await issue(student);
    const body = (await status()).json<Record<string, unknown>>();

    expect(body.active).toBe(true);
    expect(Object.keys(body).sort()).toEqual(['active', 'createdAt']);
  });

  it('lets a signed-in person download the same calendar as a file', async () => {
    const student = await actingAs('student');
    await enrol(student.user.id, algorithmsId);

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/calendar.ics`,
      headers: student.headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('studviro.ics');
    expect(response.body).toContain('SUMMARY:Algorithms – Lecture');
  });

  it('refuses the download and the feed settings to someone outside the institution', async () => {
    const outsider = await harness.actingAs();

    for (const [method, path] of [
      ['GET', 'calendar.ics'],
      ['GET', 'calendar-feed'],
      ['POST', 'calendar-feed'],
    ] as const) {
      const response = await harness.inject({
        method,
        url: `/api/v1/institutions/${institutionId}/me/${path}`,
        headers: outsider.headers,
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it('refuses the download without a session', async () => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/calendar.ics`,
    });

    expect(response.statusCode).toBe(401);
  });
});

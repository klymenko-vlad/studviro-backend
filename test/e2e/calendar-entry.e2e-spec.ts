import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  institutions,
  learningActivities,
  learningSpaces,
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

describe('One calendar entry as a file (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let algorithmsId: string;
  let lectureId: string;
  let farLectureId: string;
  let databasesLectureId: string;
  let examId: string;
  let deadlineId: string;

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

  const enrolledStudent = async () => {
    const student = await actingAs('student');
    await harness.db.insert(enrollments).values({
      institutionId,
      userId: student.user.id,
      courseOfferingId: algorithmsId,
      status: 'active',
    });

    return student;
  };

  const download = (actor: Actor | null, kind: string, id: string) =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/calendar-entries/${kind}/${id}`,
      ...(actor === null ? {} : { headers: actor.headers }),
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
        endsAt: inDays(300),
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

    const lecture = (courseOfferingId: string, startsAt: Date) => ({
      institutionId,
      courseOfferingId,
      type: 'lecture' as const,
      title: null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60 * 1000),
    });
    const events = await harness.db
      .insert(timetableEvents)
      .values([
        lecture(algorithmsId, inDays(2)),
        lecture(algorithmsId, inDays(200)),
        lecture(offerings[1]!.id, inDays(2)),
      ])
      .returning();
    [lectureId, farLectureId, databasesLectureId] = events.map((event) => event.id) as [
      string,
      string,
      string,
    ];

    const [exam] = await harness.db
      .insert(examTerms)
      .values({
        institutionId,
        courseOfferingId: algorithmsId,
        kind: 'regular',
        startsAt: inDays(20),
      })
      .returning();
    examId = exam!.id;

    const [space] = await harness.db
      .insert(learningSpaces)
      .values({ institutionId, courseOfferingId: algorithmsId, name: 'Algorithms' })
      .returning();
    const [activity] = await harness.db
      .insert(learningActivities)
      .values({
        institutionId,
        learningSpaceId: space!.id,
        type: 'assignment',
        name: 'Sorting essay',
        dueAt: inDays(10),
      })
      .returning();
    deadlineId = activity!.id;
  });

  it('downloads one class of the caller’s as a calendar holding only that class', async () => {
    const student = await enrolledStudent();

    const response = await download(student, 'class', lectureId);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/calendar');
    expect(response.headers['content-disposition']).toContain('.ics');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(response.body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(response.body).toContain(`UID:timetable-${lectureId}@studviro`);
    expect(response.body).toContain('SUMMARY:Algorithms – Lecture');
  });

  it('downloads a class further ahead than the feed reaches', async () => {
    const student = await enrolledStudent();

    const response = await download(student, 'class', farLectureId);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`UID:timetable-${farLectureId}@studviro`);
  });

  it('keeps a cancelled class, marked cancelled, so a calendar that has it drops it', async () => {
    const student = await enrolledStudent();
    await harness.db
      .update(timetableEvents)
      .set({ cancelledAt: new Date() })
      .where(eq(timetableEvents.id, lectureId));

    const response = await download(student, 'class', lectureId);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('STATUS:CANCELLED');
  });

  it('answers a class of a course the caller does not take as not found', async () => {
    const student = await enrolledStudent();

    expect((await download(student, 'class', databasesLectureId)).statusCode).toBe(404);
  });

  it('downloads an exam only once the caller holds a seat on it', async () => {
    const student = await enrolledStudent();

    expect((await download(student, 'exam', examId)).statusCode).toBe(404);

    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId: examId,
      userId: student.user.id,
      status: 'registered',
      registeredAt: new Date(),
    });

    const response = await download(student, 'exam', examId);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('SUMMARY:Exam: Algorithms (regular term)');
  });

  it('downloads a deadline of the caller’s course', async () => {
    const student = await enrolledStudent();

    const response = await download(student, 'deadline', deadlineId);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`UID:deadline-${deadlineId}@studviro`);
    expect(response.body).toContain('SUMMARY:Due: Sorting essay (Algorithms)');
  });

  it('answers an id of another kind, or of nothing, as not found', async () => {
    const student = await enrolledStudent();

    expect((await download(student, 'exam', lectureId)).statusCode).toBe(404);
    expect((await download(student, 'deadline', crypto.randomUUID())).statusCode).toBe(404);
  });

  it('refuses a kind it does not know and an id that is not one', async () => {
    const student = await enrolledStudent();

    expect((await download(student, 'meeting', lectureId)).statusCode).toBe(400);
    expect((await download(student, 'class', 'not-a-uuid')).statusCode).toBe(400);
  });

  it('refuses someone outside the institution and a caller without a session', async () => {
    const outsider = await harness.actingAs();

    expect((await download(outsider, 'class', lectureId)).statusCode).toBe(403);
    expect((await download(null, 'class', lectureId)).statusCode).toBe(401);
  });
});

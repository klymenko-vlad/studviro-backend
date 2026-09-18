import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  institutions,
  roleAssignments,
  type CanonicalRole,
  type ExamTerm,
} from '../../src/database/schema';
import { ExamTermNotificationsService } from '../../src/modules/notifications/exam-term-notifications.service';
import type { SyncTarget } from '../../src/modules/synchronization/sync.types';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

interface NotificationBody {
  id: string;
  type: string;
  occurrenceCount: number;
  readAt: string | null;
  startsAt: string | null;
  previousStartsAt: string | null;
  courseCode: string | null;
}

const MONDAY = new Date('2026-05-18T09:00:00.000Z');
const MONDAY_EVENING = new Date('2026-05-18T21:00:00.000Z');
const TUESDAY = new Date('2026-05-19T09:00:00.000Z');

describe('Notifications (e2e)', () => {
  let harness: TestHarness;
  let notifications: ExamTermNotificationsService;
  let institutionId: string;
  let offeringId: string;
  let target: SyncTarget;

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

  const enrol = (userId: string) =>
    harness.db.insert(enrollments).values({
      institutionId,
      userId,
      courseOfferingId: offeringId,
      status: 'active',
    });

  /** A moved or cancelled term reaches the people holding a seat (B10). */
  const takeSeat = async (userId: string, examTermId: string) => {
    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId,
      userId,
      status: 'registered',
      registeredAt: new Date(),
    });
  };

  const examTerm = async (startsAt: Date): Promise<ExamTerm> => {
    const [row] = await harness.db
      .insert(examTerms)
      .values({ institutionId, courseOfferingId: offeringId, kind: 'regular', startsAt })
      .returning();

    return row!;
  };

  const inbox = async (actor: { headers: { authorization: string } }, query = '') => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/notifications${query}`,
      headers: actor.headers,
    });

    return response.json<NotificationBody[]>();
  };

  const unreadCount = async (actor: { headers: { authorization: string } }) => {
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/notifications/unread-count`,
      headers: actor.headers,
    });

    return response.json<{ unreadCount: number }>().unreadCount;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
    notifications = harness.app.get(ExamTermNotificationsService);
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
    target = { institutionId, sourceSystem: 'sis', connectorName: 'mock-sis' };

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
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
      .returning();

    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId,
        courseId: course!.id,
        academicTermId: term!.id,
        status: 'running',
      })
      .returning();
    offeringId = offering!.id;
  });

  it('delivers an imported exam term to the enrolled student', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id);
    const created = await examTerm(new Date('2026-06-02T08:00:00.000Z'));

    await notifications.applied(
      target,
      { outcome: 'created', previous: null, current: created },
      MONDAY,
    );

    expect(await inbox(actor)).toMatchObject([
      { type: 'exam_term_published', courseCode: 'INF/ALG/22', occurrenceCount: 1 },
    ]);
    expect(await unreadCount(actor)).toBe(1);
  });

  it('folds a term rescheduled twice on one day into a single notification', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id);
    const original = await examTerm(new Date('2026-06-02T08:00:00.000Z'));
    await takeSeat(actor.user.id, original.id);
    const moved = { ...original, startsAt: new Date('2026-06-03T08:00:00.000Z') };
    const movedAgain = { ...original, startsAt: new Date('2026-06-04T08:00:00.000Z') };

    await notifications.applied(
      target,
      { outcome: 'updated', previous: original, current: moved },
      MONDAY,
    );
    await notifications.applied(
      target,
      { outcome: 'updated', previous: moved, current: movedAgain },
      MONDAY_EVENING,
    );

    expect(await inbox(actor)).toMatchObject([
      {
        type: 'exam_term_rescheduled',
        occurrenceCount: 2,
        startsAt: '2026-06-04T08:00:00.000Z',
      },
    ]);
    expect(await unreadCount(actor)).toBe(1);
  });

  it('starts a new notification when the same term moves again the next day', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id);
    const original = await examTerm(new Date('2026-06-02T08:00:00.000Z'));
    await takeSeat(actor.user.id, original.id);
    const moved = { ...original, startsAt: new Date('2026-06-03T08:00:00.000Z') };

    await notifications.applied(
      target,
      { outcome: 'updated', previous: original, current: moved },
      MONDAY,
    );
    await notifications.applied(
      target,
      { outcome: 'updated', previous: moved, current: original },
      TUESDAY,
    );

    expect(await inbox(actor)).toHaveLength(2);
  });

  it('re-surfaces a read notification when the term moves again', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id);
    const original = await examTerm(new Date('2026-06-02T08:00:00.000Z'));
    await takeSeat(actor.user.id, original.id);
    const moved = { ...original, startsAt: new Date('2026-06-03T08:00:00.000Z') };
    await notifications.applied(
      target,
      { outcome: 'updated', previous: original, current: moved },
      MONDAY,
    );
    const [delivered] = await inbox(actor);

    const read = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/me/notifications/${delivered!.id}/read`,
      headers: actor.headers,
    });
    expect(read.statusCode).toBe(201);
    expect(await unreadCount(actor)).toBe(0);

    await notifications.applied(
      target,
      {
        outcome: 'updated',
        previous: moved,
        current: { ...original, startsAt: new Date('2026-06-05T08:00:00.000Z') },
      },
      MONDAY_EVENING,
    );

    expect(await unreadCount(actor)).toBe(1);
  });

  it('marks every notification read at once', async () => {
    const actor = await actingAs('student');
    await enrol(actor.user.id);
    const created = await examTerm(new Date('2026-06-02T08:00:00.000Z'));
    await notifications.applied(
      target,
      { outcome: 'created', previous: null, current: created },
      MONDAY,
    );

    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/me/notifications/read-all`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(201);
    expect(await unreadCount(actor)).toBe(0);
    expect(await inbox(actor, '?unreadOnly=true')).toEqual([]);
  });

  it('never delivers a course notification to someone not enrolled', async () => {
    const enrolled = await actingAs('student');
    await enrol(enrolled.user.id);
    const stranger = await actingAs('student');
    const created = await examTerm(new Date('2026-06-02T08:00:00.000Z'));

    await notifications.applied(
      target,
      { outcome: 'created', previous: null, current: created },
      MONDAY,
    );

    expect(await inbox(stranger)).toEqual([]);
  });

  it('refuses the inbox to a caller without an institution role', async () => {
    const outsider = await harness.actingAs();

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/me/notifications`,
      headers: outsider.headers,
    });

    expect(response.statusCode).toBe(403);
  });

  describe('who hears that a term moved (B10)', () => {
    const move = (term: ExamTerm) =>
      notifications.applied(
        target,
        {
          outcome: 'updated',
          previous: term,
          current: { ...term, startsAt: new Date('2026-06-09T08:00:00.000Z') },
        },
        MONDAY,
      );

    it('tells the student holding a seat', async () => {
      const actor = await actingAs('student');
      await enrol(actor.user.id);
      const term = await examTerm(new Date('2026-06-02T08:00:00.000Z'));
      await takeSeat(actor.user.id, term.id);

      await move(term);

      expect(await inbox(actor)).toHaveLength(1);
    });

    it('leaves a classmate who never registered out of it', async () => {
      const seated = await actingAs('student');
      const bystander = await actingAs('student');
      await enrol(seated.user.id);
      await enrol(bystander.user.id);
      const term = await examTerm(new Date('2026-06-02T08:00:00.000Z'));
      await takeSeat(seated.user.id, term.id);

      await move(term);

      expect(await inbox(bystander)).toEqual([]);
    });

    it('tells a completed student sitting a resit, who used to be left out', async () => {
      const actor = await actingAs('student');
      await harness.db.insert(enrollments).values({
        institutionId,
        userId: actor.user.id,
        courseOfferingId: offeringId,
        status: 'completed',
      });
      const term = await examTerm(new Date('2026-06-02T08:00:00.000Z'));
      await takeSeat(actor.user.id, term.id);

      await move(term);

      expect(await inbox(actor)).toHaveLength(1);
    });

    it('tells the examiner, who used to hear nothing at all', async () => {
      const examiner = await actingAs('teacher');
      const [term] = await harness.db
        .insert(examTerms)
        .values({
          institutionId,
          courseOfferingId: offeringId,
          kind: 'regular',
          startsAt: new Date('2026-06-02T08:00:00.000Z'),
          examinerId: examiner.user.id,
        })
        .returning();

      await move(term!);

      expect(await inbox(examiner)).toHaveLength(1);
    });

    it('still announces a newly published term to everyone enrolled', async () => {
      const actor = await actingAs('student');
      await enrol(actor.user.id);
      const created = await examTerm(new Date('2026-06-02T08:00:00.000Z'));

      await notifications.applied(
        target,
        { outcome: 'created', previous: null, current: created },
        MONDAY,
      );

      expect(await inbox(actor)).toHaveLength(1);
    });
  });
});

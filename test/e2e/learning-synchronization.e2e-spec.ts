import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { count, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  courseOfferings,
  institutions,
  institutionSettings,
  learningActivities,
  notificationEvents,
  learningSpaces,
  roleAssignments,
  syncWatermarks,
  type CanonicalRole,
} from '../../src/database/schema';
import {
  MOCK_SIS_OPTIONS,
  type MockSisOptions,
} from '../../src/modules/connectors/mock-sis/mock-sis.options';
import { AcademicSyncService } from '../../src/modules/synchronization/academic-sync.service';
import { LearningSyncService } from '../../src/modules/synchronization/learning-sync.service';
import { QUEUES } from '../../src/queue/queue.constants';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const SMALL_UNIVERSITY: Partial<MockSisOptions> = {
  academicYears: 1,
  faculties: 1,
  departmentsPerFaculty: 1,
  programsPerFaculty: 1,
  studyYears: 1,
  coursesPerStudyYearPerTerm: 1,
  studentsPerProgram: 3,
  teachersPerDepartment: 1,
  roomsPerFaculty: 1,
  teachingWeeks: 1,
};

describe('Learning synchronization (e2e)', () => {
  let harness: TestHarness;
  let academic: AcademicSyncService;
  let learning: LearningSyncService;
  let queue: Queue;
  let institutionId: string;

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

  const startRun = async (
    sourceSystem: 'sis' | 'lms',
    mode: 'incremental' | 'full' = 'full',
  ) => {
    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/synchronization/runs`,
      headers: actor.headers,
      payload: { mode, sourceSystem },
    });

    expect(response.statusCode).toBe(202);

    return response.json<{ id: string; status: string; sourceSystem: string }>();
  };

  const syncBothHalves = async () => {
    await academic.execute((await startRun('sis')).id);

    return learning.execute((await startRun('lms')).id);
  };

  const countOf = async (
    table: typeof learningSpaces | typeof learningActivities | typeof courseOfferings,
  ): Promise<number> => {
    const [row] = await harness.db.select({ value: count() }).from(table);

    return row?.value ?? 0;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
    academic = harness.app.get(AcademicSyncService);
    learning = harness.app.get(LearningSyncService);
    queue = harness.app.get<Queue>(getQueueToken(QUEUES.SYNCHRONIZATION));

    Object.assign(harness.app.get<MockSisOptions>(MOCK_SIS_OPTIONS), SMALL_UNIVERSITY);

    await queue.pause();
  });

  afterAll(async () => {
    await queue.obliterate({ force: true });
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [institution] = await harness.db
      .insert(institutions)
      .values({ code: 'mocku', name: 'Mock University' })
      .returning();
    institutionId = institution!.id;

    await harness.db.insert(institutionSettings).values({
      institutionId,
      academicSystemConnector: 'mock-sis',
      learningSystemConnector: 'mock-lms',
    });
  });

  it('imports learning spaces and their activities into the canonical tables', async () => {
    const run = await syncBothHalves();

    expect(run.status).toBe('succeeded');
    expect(await countOf(learningSpaces)).toBeGreaterThan(0);
    expect(await countOf(learningActivities)).toBeGreaterThan(0);
  });

  it('opens one learning space per course offering the SIS half imported', async () => {
    await syncBothHalves();

    expect(await countOf(learningSpaces)).toBe(await countOf(courseOfferings));
  });

  it('links every space to the offering the SIS half already wrote', async () => {
    await syncBothHalves();

    const [linked] = await harness.db
      .select({ value: count() })
      .from(learningSpaces)
      .where(isNotNull(learningSpaces.courseOfferingId));

    expect(linked?.value).toBe(await countOf(learningSpaces));
  });

  it('stamps every imported row with the lms source, not the sis one', async () => {
    await syncBothHalves();

    const rows = await harness.db
      .select({ sourceSystem: learningSpaces.sourceSystem })
      .from(learningSpaces);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.sourceSystem).toBe('lms');
  });

  it('records a watermark per learning domain, separate from the academic ones', async () => {
    await syncBothHalves();

    const marks = await harness.db
      .select({ domain: syncWatermarks.domain, sourceSystem: syncWatermarks.sourceSystem })
      .from(syncWatermarks)
      .where(eq(syncWatermarks.sourceSystem, 'lms'));
    const domains = marks.map((mark) => mark.domain).sort();

    expect(domains).toEqual(['learningActivities', 'learningSpaces']);
  });

  it('leaves the space unlinked when the SIS half has not run', async () => {
    const run = await learning.execute((await startRun('lms')).id);

    expect(run.status).toBe('succeeded');

    const [linked] = await harness.db
      .select({ value: count() })
      .from(learningSpaces)
      .where(isNotNull(learningSpaces.courseOfferingId));

    expect(await countOf(learningSpaces)).toBeGreaterThan(0);
    expect(linked?.value).toBe(0);
  });

  it('is idempotent: a second full run creates nothing new', async () => {
    await syncBothHalves();
    const first = await countOf(learningSpaces);

    const second = await learning.execute((await startRun('lms')).id);

    expect(second.created).toBe(0);
    expect(await countOf(learningSpaces)).toBe(first);
  });

  it('refuses a learning run when no learning connector is configured', async () => {
    await harness.db
      .update(institutionSettings)
      .set({ learningSystemConnector: null })
      .where(eq(institutionSettings.institutionId, institutionId));

    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/synchronization/runs`,
      headers: actor.headers,
      payload: { mode: 'full', sourceSystem: 'lms' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ code: string }>().code).toBe('SYNC_CONNECTOR_NOT_CONFIGURED');
  });

  it('announces every imported deadline against the offering it belongs to', async () => {
    await syncBothHalves();

    const announced = await harness.db
      .select({
        learningActivityId: notificationEvents.learningActivityId,
        courseOfferingId: notificationEvents.courseOfferingId,
      })
      .from(notificationEvents)
      .where(eq(notificationEvents.type, 'assignment_due_published'));

    expect(announced.length).toBeGreaterThan(0);
    for (const event of announced) {
      expect(event.learningActivityId).not.toBeNull();
      expect(event.courseOfferingId).not.toBeNull();
    }
  });

  it('announces nothing a second time when the same run is repeated', async () => {
    await syncBothHalves();
    const [first] = await harness.db.select({ value: count() }).from(notificationEvents);

    await learning.execute((await startRun('lms')).id);

    const [second] = await harness.db.select({ value: count() }).from(notificationEvents);

    expect(second?.value).toBe(first?.value);
  });

  it('serves the imported spaces to a caller holding offering:read', async () => {
    await syncBothHalves();

    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/learning-spaces`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);

    const body = response.json<{
      total: number;
      linked: number;
      spaces: { name: string; activityCount: number; offeringId: string | null }[];
    }>();

    expect(body.total).toBeGreaterThan(0);
    expect(body.linked).toBe(body.total);
    expect(body.spaces[0]?.activityCount).toBeGreaterThan(0);
    expect(body.spaces[0]?.offeringId).not.toBeNull();
  });

  it('serves every timestamp as ISO 8601, not as a raw database string', async () => {
    await syncBothHalves();

    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/learning-spaces`,
      headers: actor.headers,
    });

    const { spaces } = response.json<{
      spaces: { nextDueAt: string | null; lastSynchronizedAt: string | null }[];
    }>();
    const dated = spaces.filter((space) => space.nextDueAt !== null);

    expect(dated.length).toBeGreaterThan(0);
    for (const space of spaces) {
      for (const stamp of [space.nextDueAt, space.lastSynchronizedAt]) {
        if (stamp === null) continue;
        expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      }
    }
  });

  it('counts the linked spaces across the institution, not across one page', async () => {
    await syncBothHalves();

    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/learning-spaces`,
      headers: actor.headers,
    });

    const body = response.json<{ total: number; linked: number; unlinked: number }>();

    expect(body.linked).toBe(body.total);
    expect(body.unlinked).toBe(0);
  });

  it('refuses the spaces list to a caller without offering:read', async () => {
    const actor = await harness.actingAs();
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/learning-spaces`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(403);
  });
});

import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  courseOfferings,
  courses,
  enrollments,
  externalIdentities,
  institutions,
  institutionSettings,
  orgUnits,
  roleAssignments,
  syncWatermarks,
  timetableEvents,
  type CanonicalRole,
} from '../../src/database/schema';
import {
  MOCK_SIS_OPTIONS,
  type MockSisOptions,
} from '../../src/modules/connectors/mock-sis/mock-sis.options';
import { AcademicSyncService } from '../../src/modules/synchronization/academic-sync.service';
import { QUEUES } from '../../src/queue/queue.constants';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

// The shipped dataset is ~5k records, which is a load test rather than a
// behaviour test. The connector reads its options lazily, so shrinking them
// before the first read yields the same generator over a handful of records.
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

interface ReconciliationBody {
  connectorName: string;
  discrepancyCount: number;
  domains: {
    domain: string;
    status: string;
    sourceCount: number;
    platformCount: number;
    matched: number;
    discrepancies: { kind: string; externalId: string }[];
  }[];
}

describe('Academic synchronization (e2e)', () => {
  let harness: TestHarness;
  let sync: AcademicSyncService;
  let queue: Queue;
  let institutionId: string;

  type CountableTable =
    | typeof orgUnits
    | typeof courses
    | typeof courseOfferings
    | typeof enrollments
    | typeof timetableEvents
    | typeof externalIdentities;

  const countOf = async (table: CountableTable): Promise<number> => {
    const [row] = await harness.db.select({ value: count() }).from(table);

    return row?.value ?? 0;
  };

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

  const startRun = async (mode: 'incremental' | 'full' = 'incremental') => {
    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/synchronization/runs`,
      headers: actor.headers,
      payload: { mode },
    });

    expect(response.statusCode).toBe(202);

    return response.json<{ id: string; status: string }>();
  };

  beforeAll(async () => {
    harness = await createTestHarness();
    sync = harness.app.get(AcademicSyncService);
    queue = harness.app.get<Queue>(getQueueToken(QUEUES.SYNCHRONIZATION));

    Object.assign(harness.app.get<MockSisOptions>(MOCK_SIS_OPTIONS), SMALL_UNIVERSITY);

    // The worker runs in-process here; pausing keeps it from racing the
    // explicit execute() calls below.
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

    await harness.db
      .insert(institutionSettings)
      .values({ institutionId, academicSystemConnector: 'mock-sis' });
  });

  it('imports the connector dataset into the canonical tables', async () => {
    const queued = await startRun();
    expect(queued.status).toBe('queued');

    const run = await sync.execute(queued.id);

    expect(run.status).toBe('succeeded');
    expect(run.created).toBeGreaterThan(0);
    expect(run.failed).toBe(0);

    expect(await countOf(orgUnits)).toBeGreaterThan(0);
    expect(await countOf(courses)).toBeGreaterThan(0);
    expect(await countOf(courseOfferings)).toBeGreaterThan(0);
    expect(await countOf(enrollments)).toBeGreaterThan(0);
    expect(await countOf(timetableEvents)).toBeGreaterThan(0);
  });

  it('provisions a platform account per person and links it to the source identity', async () => {
    const queued = await startRun();
    await sync.execute(queued.id);

    const identities = await harness.db
      .select()
      .from(externalIdentities)
      .where(eq(externalIdentities.institutionId, institutionId));

    expect(identities.length).toBeGreaterThan(0);
    expect(identities[0]).toMatchObject({ issuer: 'mock-sis', sourceSystem: 'sis' });

    const [enrollment] = await harness.db.select().from(enrollments).limit(1);
    expect(identities.some((identity) => identity.userId === enrollment!.userId)).toBe(true);
  });

  it('stamps provenance so a row can be traced back to the record it came from', async () => {
    const queued = await startRun();
    await sync.execute(queued.id);

    const [course] = await harness.db.select().from(courses).limit(1);

    expect(course).toMatchObject({ institutionId, sourceSystem: 'sis' });
    expect(course!.externalId).toBeTruthy();
    expect(course!.lastSynchronizedAt).toBeInstanceOf(Date);
  });

  it('records a watermark per domain, so the next run only asks for changes', async () => {
    const queued = await startRun();
    await sync.execute(queued.id);

    const watermarks = await harness.db
      .select()
      .from(syncWatermarks)
      .where(eq(syncWatermarks.institutionId, institutionId));

    expect(watermarks.length).toBeGreaterThan(0);
    expect(watermarks.every((watermark) => watermark.lastStatus === 'succeeded')).toBe(true);

    // A domain the source had no records for keeps a null watermark, so the
    // next run still asks it for everything.
    const courseWatermark = watermarks.find((watermark) => watermark.domain === 'courses');
    expect(courseWatermark?.sourceUpdatedAt).toBeInstanceOf(Date);
    expect(courseWatermark?.connectorName).toBe('mock-sis');
  });

  it('takes in nothing on a second incremental run, because nothing changed', async () => {
    const first = await startRun();
    await sync.execute(first.id);
    const before = await countOf(courses);

    const second = await startRun();
    const run = await sync.execute(second.id);

    expect(run.status).toBe('succeeded');
    expect(run.fetched).toBe(0);
    expect(run.created).toBe(0);
    expect(await countOf(courses)).toBe(before);
  });

  it('re-reads everything on a full run without duplicating a single row', async () => {
    const first = await startRun();
    await sync.execute(first.id);
    const before = await countOf(courseOfferings);

    const second = await startRun('full');
    const run = await sync.execute(second.id);

    expect(run.fetched).toBeGreaterThan(0);
    expect(run.created).toBe(0);
    expect(run.updated).toBeGreaterThan(0);
    expect(await countOf(courseOfferings)).toBe(before);
  });

  it('reports every domain of a finished run', async () => {
    const queued = await startRun();
    await sync.execute(queued.id);
    const actor = await actingAs('institution_admin');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/runs/${queued.id}`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      run: { status: string };
      domains: { domain: string; status: string; fetched: number }[];
    }>();

    expect(body.run.status).toBe('succeeded');
    expect(body.domains.map((domain) => domain.domain)).toContain('enrollments');
    expect(body.domains.every((domain) => domain.status === 'succeeded')).toBe(true);
  });

  it('reports a clean reconciliation right after a run', async () => {
    const queued = await startRun();
    await sync.execute(queued.id);
    const actor = await actingAs('institution_admin');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<ReconciliationBody>();

    expect(body.connectorName).toBe('mock-sis');
    expect(body.discrepancyCount).toBe(0);

    const courseDomain = body.domains.find((domain) => domain.domain === 'courses');
    expect(courseDomain).toMatchObject({ status: 'checked' });
    expect(courseDomain!.matched).toBe(courseDomain!.sourceCount);
    expect(courseDomain!.sourceCount).toBeGreaterThan(0);
  });

  it('sees a canonical row the platform has fallen behind on', async () => {
    const queued = await startRun();
    await sync.execute(queued.id);

    const [course] = await harness.db.select().from(courses).limit(1);
    await harness.db
      .update(courses)
      .set({ sourceUpdatedAt: new Date('2000-01-01T00:00:00.000Z') })
      .where(eq(courses.id, course!.id));

    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation`,
      headers: actor.headers,
    });

    const body = response.json<ReconciliationBody>();
    const courseDomain = body.domains.find((domain) => domain.domain === 'courses');

    expect(body.discrepancyCount).toBeGreaterThan(0);
    expect(courseDomain!.discrepancies).toContainEqual(
      expect.objectContaining({ kind: 'stale', externalId: course!.externalId }),
    );
  });

  it('sees a canonical row the source never offered', async () => {
    const queued = await startRun();
    await sync.execute(queued.id);

    const [orgUnit] = await harness.db.select().from(orgUnits).limit(1);
    await harness.db.insert(courses).values({
      institutionId,
      orgUnitId: orgUnit!.id,
      code: 'GHOST-1',
      title: 'A course no source knows about',
      credits: '5',
      sourceSystem: 'sis',
      externalId: 'ghost-course',
      lastSynchronizedAt: new Date(),
    });

    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation`,
      headers: actor.headers,
    });

    const courseDomain = response
      .json<ReconciliationBody>()
      .domains.find((domain) => domain.domain === 'courses');

    expect(courseDomain!.discrepancies).toContainEqual(
      expect.objectContaining({ kind: 'missing_in_source', externalId: 'ghost-course' }),
    );
  });

  it('refuses to queue a run for an institution with no connector configured', async () => {
    await harness.db
      .update(institutionSettings)
      .set({ academicSystemConnector: null })
      .where(eq(institutionSettings.institutionId, institutionId));
    const actor = await actingAs('institution_admin');

    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/synchronization/runs`,
      headers: actor.headers,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SYNC_CONNECTOR_NOT_CONFIGURED' });
  });

  it('keeps a student out of the operations endpoints', async () => {
    const student = await actingAs('student');

    const start = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/synchronization/runs`,
      headers: student.headers,
      payload: {},
    });
    const state = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/state`,
      headers: student.headers,
    });
    const reconciliation = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation`,
      headers: student.headers,
    });

    expect(start.statusCode).toBe(403);
    expect(state.statusCode).toBe(403);
    expect(reconciliation.statusCode).toBe(403);
  });
});

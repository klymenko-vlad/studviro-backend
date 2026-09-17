import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { count, eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  activityCompletions,
  assessmentResults,
  assessments,
  courseOfferings,
  institutions,
  institutionSettings,
  learningActivities,
  notificationEvents,
  learningSpaces,
  roleAssignments,
  submissionRefs,
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

interface ReconciliationBody {
  sourceSystem: string;
  connectorName: string;
  discrepancyCount: number;
  domains: {
    domain: string;
    status: string;
    sourceCount: number;
    matched: number;
    discrepancies: { kind: string; externalId: string }[];
  }[];
}

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
    table:
      | typeof learningSpaces
      | typeof learningActivities
      | typeof courseOfferings
      | typeof assessments
      | typeof assessmentResults
      | typeof activityCompletions
      | typeof submissionRefs,
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

    expect(domains).toEqual([
      'activityCompletions',
      'assessmentResults',
      'assessments',
      'learningActivities',
      'learningSpaces',
      'submissions',
    ]);
  });

  it('leaves the space unlinked when the SIS half has not run', async () => {
    const run = await learning.execute((await startRun('lms')).id);

    // Partial, not succeeded: a mark names a person only the SIS half provisions.
    expect(run.status).toBe('partial');

    const [linked] = await harness.db
      .select({ value: count() })
      .from(learningSpaces)
      .where(isNotNull(learningSpaces.courseOfferingId));

    expect(await countOf(learningSpaces)).toBeGreaterThan(0);
    expect(linked?.value).toBe(0);
  });

  it('imports the gradebook, the marks, the hand-ins and the completions', async () => {
    const run = await syncBothHalves();

    expect(run.status).toBe('succeeded');
    expect(await countOf(assessments)).toBeGreaterThan(0);
    expect(await countOf(assessmentResults)).toBeGreaterThan(0);
    expect(await countOf(submissionRefs)).toBeGreaterThan(0);
    expect(await countOf(activityCompletions)).toBeGreaterThan(0);
  });

  it('opens one gradebook column per activity that carries a deadline', async () => {
    await syncBothHalves();

    const [dated] = await harness.db
      .select({ value: count() })
      .from(learningActivities)
      .where(isNotNull(learningActivities.dueAt));

    expect(await countOf(assessments)).toBe(dated?.value);
  });

  it('attaches a mark to the person the SIS provisioned, not to a shadow of its own', async () => {
    await syncBothHalves();

    const rows = await harness.db
      .select({ userId: assessmentResults.userId })
      .from(assessmentResults);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.userId).toBeTruthy();
  });

  it('records the share of the maximum alongside the raw points', async () => {
    await syncBothHalves();

    const rows = await harness.db
      .select({
        points: assessmentResults.points,
        normalizedScore: assessmentResults.normalizedScore,
      })
      .from(assessmentResults);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const share = Number(row.normalizedScore);

      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThanOrEqual(1);
      expect(share).toBeCloseTo(Number(row.points) / 100, 3);
    }
  });

  it('leaves more work handed in than marked, so an ungraded hand-in exists', async () => {
    await syncBothHalves();

    expect(await countOf(submissionRefs)).toBeGreaterThan(await countOf(assessmentResults));
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

  it('reconciles the learning half against the learning connector', async () => {
    await syncBothHalves();
    const actor = await actingAs('institution_admin');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation?sourceSystem=lms`,
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<ReconciliationBody>();

    expect(body.sourceSystem).toBe('lms');
    expect(body.connectorName).toBe('mock-lms');
    expect(body.discrepancyCount).toBe(0);
    expect(body.domains.map((domain) => domain.domain)).toEqual([
      'learningSpaces',
      'learningActivities',
      'assessments',
      'assessmentResults',
      'activityCompletions',
      'submissions',
    ]);

    const spaces = body.domains.find((domain) => domain.domain === 'learningSpaces');
    expect(spaces).toMatchObject({ status: 'checked' });
    expect(spaces!.sourceCount).toBeGreaterThan(0);
    expect(spaces!.matched).toBe(spaces!.sourceCount);
  });

  it('never mentions a learning domain in the academic report', async () => {
    await syncBothHalves();
    const actor = await actingAs('institution_admin');

    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation`,
      headers: actor.headers,
    });

    const body = response.json<ReconciliationBody>();

    expect(body.sourceSystem).toBe('sis');
    expect(body.domains.map((domain) => domain.domain)).not.toContain('learningSpaces');
  });

  it('sees a learning row the platform has fallen behind on', async () => {
    await syncBothHalves();

    const [space] = await harness.db.select().from(learningSpaces).limit(1);
    await harness.db
      .update(learningSpaces)
      .set({ sourceUpdatedAt: new Date('2000-01-01T00:00:00.000Z') })
      .where(eq(learningSpaces.id, space!.id));

    const actor = await actingAs('institution_admin');
    const response = await harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation?sourceSystem=lms`,
      headers: actor.headers,
    });

    const body = response.json<ReconciliationBody>();
    const spaces = body.domains.find((domain) => domain.domain === 'learningSpaces');

    expect(spaces!.discrepancies).toContainEqual(
      expect.objectContaining({ kind: 'stale', externalId: space!.externalId }),
    );
  });

  it('settles a learning discrepancy by keeping the platform row', async () => {
    await syncBothHalves();

    const [space] = await harness.db.select().from(learningSpaces).limit(1);
    const actor = await actingAs('institution_admin');

    const response = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/synchronization/reconciliation/resolutions`,
      headers: actor.headers,
      payload: {
        domain: 'learningSpaces',
        kind: 'stale',
        action: 'keep_platform',
        canonicalId: space!.id,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ sourceSystem: string }>().sourceSystem).toBe('lms');

    const [detached] = await harness.db
      .select()
      .from(learningSpaces)
      .where(eq(learningSpaces.id, space!.id));

    expect(detached).toMatchObject({ sourceSystem: 'platform', externalId: null });
  });
});

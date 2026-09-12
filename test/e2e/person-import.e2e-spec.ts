import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { eq, isNotNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  externalIdentities,
  institutions,
  institutionSettings,
  roleAssignments,
  userEmails,
  users,
} from '../../src/database/schema';
import {
  MOCK_SIS_OPTIONS,
  type MockSisOptions,
} from '../../src/modules/connectors/mock-sis/mock-sis.options';
import { AcademicSyncService } from '../../src/modules/synchronization/academic-sync.service';
import { QUEUES } from '../../src/queue/queue.constants';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const SMALL_UNIVERSITY: Partial<MockSisOptions> = {
  academicYears: 1,
  faculties: 1,
  departmentsPerFaculty: 1,
  programsPerFaculty: 1,
  studyYears: 1,
  coursesPerStudyYearPerTerm: 1,
  studentsPerProgram: 2,
  teachersPerDepartment: 1,
  roomsPerFaculty: 1,
  teachingWeeks: 1,
};

describe('Person import (e2e)', () => {
  let harness: TestHarness;
  let sync: AcademicSyncService;
  let queue: Queue;
  let institutionId: string;

  const runImport = async () => {
    const actor = await harness.actingAs();
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId: actor.user.id,
      role: 'institution_admin',
      scopeType: 'institution',
      scopeId: null,
    });

    const queued = await harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${institutionId}/synchronization/runs`,
      headers: actor.headers,
      payload: { mode: 'full' },
    });

    return sync.execute(queued.json<{ id: string }>().id);
  };

  const importedPeople = async () =>
    harness.db
      .select()
      .from(users)
      .innerJoin(externalIdentities, eq(externalIdentities.userId, users.id))
      .where(eq(externalIdentities.institutionId, institutionId));

  const createInstitution = async () => {
    const [institution] = await harness.db
      .insert(institutions)
      .values({ code: 'mocku', name: 'Mock University' })
      .returning();
    institutionId = institution!.id;

    await harness.db
      .insert(institutionSettings)
      .values({ institutionId, academicSystemConnector: 'mock-sis' });
  };

  beforeAll(async () => {
    harness = await createTestHarness();
    sync = harness.app.get(AcademicSyncService);
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
    await createInstitution();
  });

  it('lands an imported person as an invited record with no credential', async () => {
    await runImport();

    const people = await importedPeople();

    expect(people.length).toBeGreaterThan(0);
    expect(people.every((row) => row.users.status === 'invited')).toBe(true);
    expect(people.every((row) => row.users.passwordHash === null)).toBe(true);
  });

  it('refuses to sign an imported person in, whatever password they try', async () => {
    await runImport();

    const [person] = await importedPeople();

    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: person!.users.email, password: 'correct horse battery staple' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('records the address the source asserted without treating it as proven', async () => {
    await runImport();

    const [person] = await importedPeople();

    expect(person!.external_identities.assertedEmail).toBe(person!.users.email);

    const [address] = await harness.db
      .select()
      .from(userEmails)
      .where(eq(userEmails.userId, person!.users.id));

    expect(address).toMatchObject({
      address: person!.users.email,
      institutionId,
      verifiedAt: null,
    });
  });

  it('imports a person whose address already belongs to an account, without failing the run', async () => {
    await runImport();
    const [known] = await importedPeople();
    const taken = known!.users.email;

    await harness.truncateAll();
    await createInstitution();
    const holder = await harness.actingAs({ email: taken });

    const run = await runImport();

    expect(run.failed).toBe(0);
    expect(run.status).toBe('succeeded');

    const shadow = await importedPeople();
    const imported = shadow.find((row) => row.users.email === taken);

    expect(imported).toBeDefined();
    expect(imported!.users.id).not.toBe(holder.user.id);
    expect(imported!.users.status).toBe('invited');

    const [stillActive] = await harness.db
      .select()
      .from(users)
      .where(eq(users.id, holder.user.id));

    expect(stillActive).toMatchObject({ status: 'active', email: taken });
  });

  it('never claims an address for the imported record when an account already holds it', async () => {
    await runImport();
    const [known] = await importedPeople();
    const taken = known!.users.email;

    await harness.truncateAll();
    await createInstitution();
    await harness.actingAs({ email: taken });
    await runImport();

    const verified = await harness.db
      .select()
      .from(userEmails)
      .where(isNotNull(userEmails.verifiedAt));

    expect(verified).toHaveLength(0);
  });

  it('leaves a claimed account address alone while still syncing the name', async () => {
    await runImport();
    const [person] = await importedPeople();

    await harness.db
      .update(users)
      .set({ status: 'active', email: 'chosen@gmail.com', displayName: 'Stale Name' })
      .where(eq(users.id, person!.users.id));

    await runImport();

    const [after] = await harness.db.select().from(users).where(eq(users.id, person!.users.id));

    expect(after!.email).toBe('chosen@gmail.com');
    expect(after!.displayName).toBe(person!.users.displayName);
  });
});

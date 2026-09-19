import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/common/crypto/password.service';
import { buildPlan } from '../../src/database/demo-seed/build-plan';
import type { DemoSeedOptions } from '../../src/database/demo-seed/options';
import { DEFAULT_DEMO_SEED_OPTIONS } from '../../src/database/demo-seed/options';
import { DEFAULT_NAMED_ACCOUNTS, writePlan } from '../../src/database/demo-seed/write-plan';
import {
  courseOfferings,
  enrollments,
  examTerms,
  institutions,
  orgUnits,
  programMemberships,
  roleAssignments,
  teachingAssignments,
  timetableEvents,
  users,
} from '../../src/database/schema';
import { DerivedRolesRepository } from '../../src/modules/authorization/derived-roles.repository';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

/** Small enough to seed in a test, big enough to have every relationship in it. */
const options: DemoSeedOptions = {
  ...DEFAULT_DEMO_SEED_OPTIONS,
  faculties: 1,
  departmentsPerFaculty: 1,
  programsPerFaculty: 1,
  studyYears: 2,
  coursesPerStudyYearPerTerm: 1,
  studentsPerProgram: 4,
  teachersPerDepartment: 2,
  roomsPerFaculty: 2,
  teachingWeeks: 2,
};

describe('the demo seed (e2e)', () => {
  let harness: TestHarness;
  let passwordHash: string;

  const seed = () =>
    writePlan(harness.db, buildPlan(options), options, passwordHash, DEFAULT_NAMED_ACCOUNTS);

  beforeAll(async () => {
    harness = await createTestHarness();
    passwordHash = await harness.app.get(PasswordService).hash('correct horse battery staple');
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('writes a whole university, in dependency order', async () => {
    const summary = await seed();

    const [institution] = await harness.db
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions);

    expect(institution?.id).toBe(summary.institutionId);
    expect(institution?.name).toBe(options.universityName);

    // university + faculty + department
    await expect(harness.db.select().from(orgUnits)).resolves.toHaveLength(3);
    await expect(harness.db.select().from(programMemberships)).resolves.toHaveLength(
      options.studentsPerProgram,
    );
    expect(summary.counts.courseOfferings).toBeGreaterThan(0);
    expect(summary.counts.enrollments).toBeGreaterThan(0);
    expect(summary.counts.officialCourseResults).toBeGreaterThan(0);
  });

  it('scopes every canonical row to the institution it created', async () => {
    const { institutionId } = await seed();

    for (const table of [
      orgUnits,
      courseOfferings,
      enrollments,
      examTerms,
      timetableEvents,
      teachingAssignments,
      programMemberships,
    ]) {
      const rows = await harness.db.select({ id: table.institutionId }).from(table);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.id === institutionId)).toBe(true);
    }
  });

  it('replaces the demo rather than doubling it when run twice', async () => {
    const first = await seed();
    const second = await seed();

    expect(second.institutionId).not.toBe(first.institutionId);
    await expect(harness.db.select().from(institutions)).resolves.toHaveLength(1);
    await expect(harness.db.select().from(enrollments)).resolves.toHaveLength(
      second.counts.enrollments ?? 0,
    );
  });

  it('leaves the named accounts able to sign in with the roles they are for', async () => {
    const { institutionId } = await seed();
    const derived = harness.app.get(DerivedRolesRepository);

    const byEmail = async (email: string) => {
      const [row] = await harness.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email));

      return row;
    };

    const admin = await byEmail(DEFAULT_NAMED_ACCOUNTS.adminEmail);
    const registrar = await byEmail(DEFAULT_NAMED_ACCOUNTS.registrarEmail);
    const teacher = await byEmail(DEFAULT_NAMED_ACCOUNTS.teacherEmail);
    const student = await byEmail(DEFAULT_NAMED_ACCOUNTS.studentEmail);

    expect([admin, registrar, teacher, student].every(Boolean)).toBe(true);

    const granted = await harness.db
      .select({ userId: roleAssignments.userId, role: roleAssignments.role })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.institutionId, institutionId),
          isNull(roleAssignments.deletedAt),
        ),
      );

    expect(granted).toEqual(
      expect.arrayContaining([
        { userId: admin?.id, role: 'institution_admin' },
        { userId: registrar?.id, role: 'registrar' },
      ]),
    );

    // The teacher and the student are not granted: they are derived from a
    // teaching assignment and a programme membership (ADRs 0015–0018).
    await expect(derived.findFor(institutionId, teacher?.id ?? '')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'teacher' })]),
    );
    await expect(derived.findFor(institutionId, student?.id ?? '')).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'student' })]),
    );
  });
});

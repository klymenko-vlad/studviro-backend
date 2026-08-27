import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  courseOfferings,
  courses,
  institutions,
  orgUnits,
  programs,
  roleAssignments,
  type NewRoleAssignment,
} from '../../src/database/schema';
import { AuthorizationService } from '../../src/modules/authorization/authorization.service';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

describe('Scoped authorization (e2e)', () => {
  let harness: TestHarness;
  let authorization: AuthorizationService;
  let institutionId: string;
  let facultyId: string;
  let departmentId: string;
  let programId: string;
  let offeringId: string;

  beforeAll(async () => {
    harness = await createTestHarness();
    authorization = harness.app.get(AuthorizationService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    institutionId = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    ).id;

    facultyId = only(
      await harness.db
        .insert(orgUnits)
        .values({ institutionId, type: 'faculty', code: 'pf', name: 'Faculty of Science' })
        .returning(),
    ).id;

    departmentId = only(
      await harness.db
        .insert(orgUnits)
        .values({
          institutionId,
          parentId: facultyId,
          type: 'department',
          code: 'ki',
          name: 'Institute of Computer Science',
        })
        .returning(),
    ).id;

    programId = only(
      await harness.db
        .insert(programs)
        .values({ institutionId, orgUnitId: departmentId, code: 'INF-BC', name: 'Informatics' })
        .returning(),
    ).id;

    const courseId = only(
      await harness.db
        .insert(courses)
        .values({
          institutionId,
          orgUnitId: departmentId,
          code: 'INF101',
          title: 'Programming',
        })
        .returning(),
    ).id;

    const academicTermId = only(
      await harness.db
        .insert(academicTerms)
        .values({
          institutionId,
          code: '2026-WS',
          name: 'Winter 2026',
          academicYear: '2026/2027',
          startsAt: new Date('2026-09-01T00:00:00.000Z'),
          endsAt: new Date('2027-01-31T00:00:00.000Z'),
        })
        .returning(),
    ).id;

    offeringId = only(
      await harness.db
        .insert(courseOfferings)
        .values({ institutionId, courseId, academicTermId })
        .returning(),
    ).id;
  });

  const grant = async (
    userId: string,
    values: Omit<NewRoleAssignment, 'institutionId' | 'userId'>,
  ): Promise<void> => {
    await harness.db.insert(roleAssignments).values({ institutionId, userId, ...values });
  };

  it('honours a grant made on the requested offering', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'teacher',
      scopeType: 'course_offering',
      scopeId: offeringId,
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'grade:publish',
        scope: { type: 'course_offering', id: offeringId },
      }),
    ).resolves.toBe(true);
  });

  it('propagates a faculty grant down through the department to an offering', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'org_unit_manager',
      scopeType: 'org_unit',
      scopeId: facultyId,
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'offering:manage',
        scope: { type: 'course_offering', id: offeringId },
      }),
    ).resolves.toBe(true);
  });

  it('does not propagate a department grant up to the faculty', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'org_unit_manager',
      scopeType: 'org_unit',
      scopeId: departmentId,
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'offering:manage',
        scope: { type: 'org_unit', id: facultyId },
      }),
    ).resolves.toBe(false);
  });

  it('covers a program from the org unit that owns it', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'program_coordinator',
      scopeType: 'org_unit',
      scopeId: facultyId,
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'program:manage',
        scope: { type: 'program', id: programId },
      }),
    ).resolves.toBe(true);
  });

  it('lets an institution-wide grant reach every scope inside it', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'institution_admin',
      scopeType: 'institution',
      scopeId: null,
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'institution:manage',
        scope: { type: 'course_offering', id: offeringId },
      }),
    ).resolves.toBe(true);
  });

  it('ignores an assignment that has expired', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'teacher',
      scopeType: 'course_offering',
      scopeId: offeringId,
      validUntil: new Date(Date.now() - 60_000),
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'grade:publish',
        scope: { type: 'course_offering', id: offeringId },
      }),
    ).resolves.toBe(false);
  });

  it('ignores an assignment that has not started yet', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'teacher',
      scopeType: 'course_offering',
      scopeId: offeringId,
      validFrom: new Date(Date.now() + 3_600_000),
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'grade:publish',
        scope: { type: 'course_offering', id: offeringId },
      }),
    ).resolves.toBe(false);
  });

  it('ignores an assignment that has been revoked', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'teacher',
      scopeType: 'course_offering',
      scopeId: offeringId,
      deletedAt: new Date(),
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'grade:publish',
        scope: { type: 'course_offering', id: offeringId },
      }),
    ).resolves.toBe(false);
  });

  it('refuses a scope that does not exist', async () => {
    const actor = await harness.actingAs();
    await grant(actor.user.id, {
      role: 'institution_admin',
      scopeType: 'institution',
      scopeId: null,
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'course:read',
        scope: { type: 'course_offering', id: '00000000-0000-0000-0000-000000000000' },
      }),
    ).resolves.toBe(false);
  });

  it('keeps a grant in one institution from reaching another', async () => {
    const actor = await harness.actingAs();
    const other = only(
      await harness.db.insert(institutions).values({ code: 'tuke', name: 'TUKE' }).returning(),
    );

    await harness.db.insert(roleAssignments).values({
      institutionId: other.id,
      userId: actor.user.id,
      role: 'institution_admin',
      scopeType: 'institution',
      scopeId: null,
    });

    await expect(
      authorization.can({
        userId: actor.user.id,
        permission: 'course:read',
        scope: { type: 'course_offering', id: offeringId },
      }),
    ).resolves.toBe(false);
  });
});

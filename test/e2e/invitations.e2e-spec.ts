import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  courseOfferings,
  courses,
  academicTerms,
  enrollments,
  examRegistrations,
  examTerms,
  externalIdentities,
  institutions,
  invitations,
  notificationDeliveries,
  notificationEvents,
  programMemberships,
  programs,
  roleAssignments,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  users,
} from '../../src/database/schema';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

const only = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error('expected the insert to return a row');

  return row;
};

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

describe('Invitations (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;
  let admin: ActingUser;

  const path = (suffix = ''): string =>
    `/api/v1/institutions/${institutionId}/invitations${suffix}`;

  const grantInDatabase = async (userId: string, role: 'institution_admin' | 'registrar') => {
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId,
      role,
      scopeType: 'institution',
      scopeId: null,
    });
  };

  const insertInvitation = async (
    address: string,
    token: string,
    overrides: Partial<typeof invitations.$inferInsert> = {},
  ) =>
    only(
      await harness.db
        .insert(invitations)
        .values({
          institutionId,
          address,
          role: 'student',
          scopeType: 'institution',
          scopeId: null,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 60_000),
          ...overrides,
        })
        .returning(),
    );

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    institutionId = only(
      await harness.db.insert(institutions).values({ code: 'upjs', name: 'UPJŠ' }).returning(),
    ).id;

    admin = await harness.actingAs();
    await grantInDatabase(admin.user.id, 'institution_admin');
  });

  describe('creating an invitation', () => {
    it('rejects an anonymous caller', async () => {
      const response = await harness.inject({
        method: 'POST',
        url: path(),
        payload: { address: 'new@upjs.sk', role: 'student', scopeType: 'institution' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('rejects a caller without role:assign', async () => {
      const actor = await harness.actingAs();

      const response = await harness.inject({
        method: 'POST',
        url: path(),
        headers: actor.headers,
        payload: { address: 'new@upjs.sk', role: 'student', scopeType: 'institution' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('refuses to invite someone into a role the caller does not hold', async () => {
      const actor = await harness.actingAs();
      await harness.db.insert(roleAssignments).values({
        institutionId,
        userId: actor.user.id,
        role: 'org_unit_manager',
        scopeType: 'institution',
        scopeId: null,
      });

      const response = await harness.inject({
        method: 'POST',
        url: path(),
        headers: actor.headers,
        payload: {
          address: 'new@upjs.sk',
          role: 'institution_admin',
          scopeType: 'institution',
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'ROLE_NOT_HELD_BY_GRANTER' });
    });

    it('creates an invitation and returns the raw token outside production', async () => {
      const response = await harness.inject({
        method: 'POST',
        url: path(),
        headers: admin.headers,
        payload: { address: 'New@UPJS.sk', role: 'registrar', scopeType: 'institution' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ devToken: string; address: string }>();
      expect(body.address).toBe('new@upjs.sk');
      expect(body.devToken).toMatch(/^[a-f0-9]{64}$/);

      const [stored] = await harness.db
        .select()
        .from(invitations)
        .where(eq(invitations.institutionId, institutionId));
      expect(stored?.tokenHash).toBe(hash(body.devToken));
    });
  });

  describe('accepting an invitation', () => {
    it('answers identically for an unknown token', async () => {
      const response = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/does-not-exist/accept',
        payload: { password: 'correct horse battery staple', displayName: 'A Student' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'INVITATION_TOKEN_INVALID' });
    });

    it('answers identically for an expired token', async () => {
      const invitation = await insertInvitation('student1@upjs.sk', 'expired-token', {
        expiresAt: new Date(Date.now() - 1000),
      });

      const response = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/expired-token/accept',
        payload: { password: 'correct horse battery staple', displayName: 'A Student' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'INVITATION_TOKEN_INVALID' });
      expect(invitation.acceptedAt).toBeNull();
    });

    it('answers identically for an already-consumed token', async () => {
      await insertInvitation('student2@upjs.sk', 'used-token', {
        acceptedAt: new Date(),
        acceptedUserId: admin.user.id,
      });

      const response = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/used-token/accept',
        payload: { password: 'correct horse battery staple', displayName: 'A Student' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'INVITATION_TOKEN_INVALID' });
    });

    it('requires a password when there is no existing account', async () => {
      await insertInvitation('fresh@upjs.sk', 'fresh-token');

      const response = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/fresh-token/accept',
        payload: { displayName: 'Fresh Person' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'PROFILE_REQUIRED' });
    });

    it('creates a brand-new account, activates it and grants the role, single-use', async () => {
      await insertInvitation('brandnew@upjs.sk', 'brand-new-token');

      const accepted = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/brand-new-token/accept',
        payload: { displayName: 'Brand New', password: 'correct horse battery staple' },
      });
      expect(accepted.statusCode).toBe(204);

      const login = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'brandnew@upjs.sk', password: 'correct horse battery staple' },
      });
      expect(login.statusCode).toBe(200);

      const [createdUser] = await harness.db
        .select()
        .from(users)
        .where(eq(users.email, 'brandnew@upjs.sk'));
      expect(createdUser?.status).toBe('active');

      const [grant] = await harness.db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, createdUser!.id));
      expect(grant).toMatchObject({ role: 'student', scopeType: 'institution' });

      const repeated = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/brand-new-token/accept',
        payload: { displayName: 'Brand New', password: 'correct horse battery staple' },
      });
      expect(repeated.statusCode).toBe(400);
      expect(repeated.json()).toMatchObject({ code: 'INVITATION_TOKEN_INVALID' });
    });

    it('claims an imported (invited) record without needing a display name again', async () => {
      const [shadow] = await harness.db
        .insert(users)
        .values({
          email: 'imported@upjs.sk',
          displayName: 'Imported Person',
          status: 'invited',
        })
        .returning();
      await harness.db.insert(externalIdentities).values({
        institutionId,
        userId: shadow!.id,
        sourceSystem: 'sis',
        issuer: 'mock-sis',
        subject: 'ext-1',
        assertedEmail: 'imported@upjs.sk',
      });
      await insertInvitation('imported@upjs.sk', 'claim-token');

      const accepted = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/claim-token/accept',
        payload: { password: 'correct horse battery staple' },
      });
      expect(accepted.statusCode).toBe(204);

      const [claimed] = await harness.db.select().from(users).where(eq(users.id, shadow!.id));
      expect(claimed).toMatchObject({ status: 'active' });
      expect(claimed?.displayName).toBe('Imported Person');

      const login = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'imported@upjs.sk', password: 'correct horse battery staple' },
      });
      expect(login.statusCode).toBe(200);
    });
  });

  describe('merging into a self-registered account', () => {
    const address = 'both@upjs.sk';

    const seedShadowAndSurvivor = async () => {
      const [shadow] = await harness.db
        .insert(users)
        .values({ email: address, displayName: 'Imported Person', status: 'invited' })
        .returning();

      const register = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: address,
          displayName: 'Self Registered',
          password: 'correct horse battery staple',
        },
      });
      const survivorId = register.json<{ user: { id: string } }>().user.id;

      return { shadowId: shadow!.id, survivorId };
    };

    it('repoints every referencing table onto the survivor and soft-deletes the shadow', async () => {
      const { shadowId, survivorId } = await seedShadowAndSurvivor();

      await harness.db.insert(externalIdentities).values({
        institutionId,
        userId: shadowId,
        sourceSystem: 'sis',
        issuer: 'mock-sis',
        subject: 'ext-merge',
        assertedEmail: address,
      });
      await harness.db.insert(roleAssignments).values({
        institutionId,
        userId: shadowId,
        role: 'student',
        scopeType: 'institution',
        scopeId: null,
      });
      const program = only(
        await harness.db
          .insert(programs)
          .values({ institutionId, code: 'INF-BC', name: 'Informatics' })
          .returning(),
      );
      await harness.db
        .insert(programMemberships)
        .values({ institutionId, programId: program.id, userId: shadowId });

      const term = only(
        await harness.db
          .insert(academicTerms)
          .values({
            institutionId,
            code: '2026Z',
            name: 'Winter 2026',
            academicYear: '2026/2027',
            startsAt: new Date(),
            endsAt: new Date(Date.now() + 1000),
          })
          .returning(),
      );
      const course = only(
        await harness.db
          .insert(courses)
          .values({ institutionId, code: 'I-PRG1', title: 'Programming 1' })
          .returning(),
      );
      const offering = only(
        await harness.db
          .insert(courseOfferings)
          .values({ institutionId, courseId: course.id, academicTermId: term.id })
          .returning(),
      );
      await harness.db.insert(teachingAssignments).values({
        institutionId,
        courseOfferingId: offering.id,
        userId: shadowId,
        role: 'lecturer',
      });
      const enrollment = only(
        await harness.db
          .insert(enrollments)
          .values({ institutionId, courseOfferingId: offering.id, userId: shadowId })
          .returning(),
      );
      const group = only(
        await harness.db
          .insert(studyGroups)
          .values({ institutionId, courseOfferingId: offering.id, code: 'G1' })
          .returning(),
      );
      await harness.db
        .insert(studyGroupMemberships)
        .values({ institutionId, studyGroupId: group.id, userId: shadowId });
      const term1 = only(
        await harness.db
          .insert(examTerms)
          .values({ institutionId, courseOfferingId: offering.id, startsAt: new Date() })
          .returning(),
      );
      await harness.db
        .insert(examRegistrations)
        .values({ institutionId, examTermId: term1.id, userId: shadowId });
      const event = only(
        await harness.db
          .insert(notificationEvents)
          .values({
            institutionId,
            type: 'exam_term_published',
            dedupeKey: 'k1',
            occurredAt: new Date(),
          })
          .returning(),
      );
      await harness.db
        .insert(notificationDeliveries)
        .values({ institutionId, notificationEventId: event.id, userId: shadowId });

      await insertInvitation(address, 'merge-token', { role: 'registrar' });

      const accepted = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/merge-token/accept',
        payload: {},
      });
      expect(accepted.statusCode).toBe(204);

      const [shadowAfter] = await harness.db.select().from(users).where(eq(users.id, shadowId));
      expect(shadowAfter?.deletedAt).not.toBeNull();
      expect(shadowAfter?.mergedIntoUserId).toBe(survivorId);

      const tables = [
        externalIdentities,
        roleAssignments,
        programMemberships,
        enrollments,
        teachingAssignments,
        examRegistrations,
        studyGroupMemberships,
        notificationDeliveries,
      ];
      for (const table of tables) {
        const rows = await harness.db.select().from(table).where(eq(table.userId, survivorId));
        expect(rows.length).toBeGreaterThan(0);
        const leftBehind = await harness.db
          .select()
          .from(table)
          .where(eq(table.userId, shadowId));
        expect(leftBehind).toHaveLength(0);
      }

      const grant = await harness.db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, survivorId));
      expect(grant.some((row) => row.role === 'registrar')).toBe(true);

      expect(enrollment.id).toBeTruthy();
    });

    it('lets an already-active target claim the grant without a password', async () => {
      const { survivorId } = await seedShadowAndSurvivor();
      await insertInvitation(address, 'active-only-token', { role: 'registrar' });

      const accepted = await harness.inject({
        method: 'POST',
        url: '/api/v1/invitations/active-only-token/accept',
        payload: {},
      });
      expect(accepted.statusCode).toBe(204);

      const [grant] = await harness.db
        .select()
        .from(roleAssignments)
        .where(eq(roleAssignments.userId, survivorId));
      expect(grant).toMatchObject({ role: 'registrar' });
    });
  });
});

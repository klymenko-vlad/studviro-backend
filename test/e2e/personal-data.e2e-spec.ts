import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  academicTerms,
  activityCompletions,
  assessmentResults,
  assessments,
  auditEvents,
  calendarFeeds,
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  externalIdentities,
  institutions,
  invitations,
  learningActivities,
  learningMaterialFiles,
  learningMaterials,
  learningSpaces,
  notificationDeliveries,
  notificationEvents,
  officialCourseResults,
  passwordResetTokens,
  programMemberships,
  programs,
  refreshTokens,
  roleAssignments,
  studyGroupMemberships,
  studyGroups,
  submissionFiles,
  submissions,
  twoFactorCredentials,
  twoFactorRecoveryCodes,
  userEmails,
  users,
} from '../../src/database/schema';
import { StorageService } from '../../src/modules/storage/storage.service';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';

const PASSWORD = 'correct horse battery staple';
const CONFLICT_NOTE = 'Disputed in person on 3 March; the student was unwell that week.';
const FEEDBACK = 'Jana, your proof of termination is the strongest in the cohort.';
const SUBMISSION_NOTES = 'Handed in late because my laptop died.';

describe('Personal data export and erasure (e2e)', () => {
  let harness: TestHarness;
  let storage: StorageService;

  let institutionId: string;
  let otherInstitutionId: string;
  let admin: ActingUser;
  let student: ActingUser;
  let classmate: ActingUser;
  let enrollmentId: string;
  let storageKey: string;

  const url = (path: string) => `/api/v1/institutions/${institutionId}${path}`;

  const grant = async (
    actor: ActingUser,
    role: 'institution_admin' | 'student',
    at = institutionId,
  ) => {
    await harness.db.insert(roleAssignments).values({
      institutionId: at,
      userId: actor.user.id,
      role,
      scopeType: 'institution',
      scopeId: null,
    });
  };

  const exportAs = (actor: ActingUser) =>
    harness.inject({ method: 'GET', url: url('/me/personal-data'), headers: actor.headers });

  const eraseAs = (actor: ActingUser, subjectId: string) =>
    harness.inject({
      method: 'DELETE',
      url: url(`/people/${subjectId}/personal-data`),
      headers: actor.headers,
    });

  const rowsOf = async (userId: string) => {
    const [tokens, resets, emails, identities, invites] = await Promise.all([
      harness.db.select().from(refreshTokens).where(eq(refreshTokens.userId, userId)),
      harness.db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, userId)),
      harness.db.select().from(userEmails).where(eq(userEmails.userId, userId)),
      harness.db.select().from(externalIdentities).where(eq(externalIdentities.userId, userId)),
      harness.db.select().from(invitations).where(eq(invitations.institutionId, institutionId)),
    ]);

    return { tokens, resets, emails, identities, invites };
  };

  const personRow = async (userId: string) =>
    (await harness.db.select().from(users).where(eq(users.id, userId)))[0]!;

  beforeAll(async () => {
    harness = await createTestHarness();
    storage = harness.app.get(StorageService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [home, elsewhere] = await harness.db
      .insert(institutions)
      .values([
        { code: 'upjs', name: 'UPJŠ' },
        { code: 'tuke', name: 'TUKE' },
      ])
      .returning();
    institutionId = home!.id;
    otherInstitutionId = elsewhere!.id;

    admin = await harness.actingAs({ email: 'registrar@example.com' });
    student = await harness.actingAs({ email: 'jana@example.com' });
    classmate = await harness.actingAs({ email: 'peter@example.com' });
    await grant(admin, 'institution_admin');
    await grant(student, 'student');
    await grant(classmate, 'student');

    const [term] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId,
        code: '2026W',
        name: 'Winter 2026/2027',
        academicYear: '2026/2027',
        startsAt: new Date('2026-09-21T00:00:00.000Z'),
        endsAt: new Date('2027-02-14T00:00:00.000Z'),
      })
      .returning();

    const [course] = await harness.db
      .insert(courses)
      .values({ institutionId, code: 'INF/ALG/22', title: 'Algorithms' })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({ institutionId, courseId: course!.id, academicTermId: term!.id })
      .returning();
    const [program] = await harness.db
      .insert(programs)
      .values({ institutionId, code: 'INF-BC', name: 'Informatics' })
      .returning();

    await harness.db.insert(programMemberships).values({
      institutionId,
      programId: program!.id,
      userId: student.user.id,
      status: 'active',
      studyYear: 2,
    });

    const [enrollment, classmateEnrollment] = await harness.db
      .insert(enrollments)
      .values([
        {
          institutionId,
          courseOfferingId: offering!.id,
          userId: student.user.id,
          status: 'active',
        },
        {
          institutionId,
          courseOfferingId: offering!.id,
          userId: classmate.user.id,
          status: 'active',
        },
      ])
      .returning();
    enrollmentId = enrollment!.id;

    await harness.db.insert(officialCourseResults).values([
      {
        institutionId,
        enrollmentId,
        status: 'disputed',
        officialGrade: 'C',
        officialRecordedById: admin.user.id,
        officialRecordedAt: new Date(),
        conflictNote: CONFLICT_NOTE,
      },
      {
        institutionId,
        enrollmentId: classmateEnrollment!.id,
        status: 'official',
        officialGrade: 'A',
      },
    ]);

    const [examTerm] = await harness.db
      .insert(examTerms)
      .values({
        institutionId,
        courseOfferingId: offering!.id,
        startsAt: new Date('2027-01-15T09:00:00.000Z'),
      })
      .returning();
    await harness.db.insert(examRegistrations).values({
      institutionId,
      examTermId: examTerm!.id,
      userId: student.user.id,
      status: 'registered',
      registeredAt: new Date(),
    });

    const [group] = await harness.db
      .insert(studyGroups)
      .values({ institutionId, courseOfferingId: offering!.id, code: 'S1' })
      .returning();
    await harness.db
      .insert(studyGroupMemberships)
      .values({ institutionId, studyGroupId: group!.id, userId: student.user.id });

    const [space] = await harness.db
      .insert(learningSpaces)
      .values({ institutionId, courseOfferingId: offering!.id, name: 'Algorithms' })
      .returning();
    const [activity] = await harness.db
      .insert(learningActivities)
      .values({
        institutionId,
        learningSpaceId: space!.id,
        type: 'assignment',
        name: 'Assignment 1',
      })
      .returning();
    const [assessment] = await harness.db
      .insert(assessments)
      .values({
        institutionId,
        learningSpaceId: space!.id,
        name: 'Assignment 1',
        maxPoints: '20',
      })
      .returning();

    await harness.db.insert(assessmentResults).values({
      institutionId,
      assessmentId: assessment!.id,
      userId: student.user.id,
      points: '17',
      feedback: FEEDBACK,
      gradedAt: new Date(),
      gradedById: admin.user.id,
    });
    const [material] = await harness.db
      .insert(learningMaterials)
      .values({
        institutionId,
        learningSpaceId: space!.id,
        kind: 'text',
        title: 'Week 1 notes',
      })
      .returning();
    await harness.db.insert(activityCompletions).values([
      {
        institutionId,
        learningActivityId: activity!.id,
        userId: student.user.id,
        state: 'complete',
        completedAt: new Date(),
      },
      {
        institutionId,
        learningMaterialId: material!.id,
        userId: student.user.id,
        state: 'complete',
        completedAt: new Date(),
        viewedAt: new Date(),
      },
    ]);

    const [submission] = await harness.db
      .insert(submissions)
      .values({
        institutionId,
        learningActivityId: activity!.id,
        userId: student.user.id,
        state: 'submitted',
        submittedAt: new Date(),
        isLate: true,
        notes: SUBMISSION_NOTES,
        fileCount: 1,
      })
      .returning();

    const ticket = await storage.createUploadTicket({
      institutionId,
      purpose: 'submissions',
      filename: 'answer.pdf',
      contentType: 'application/pdf',
    });
    const put = await fetch(ticket.url, {
      method: 'PUT',
      headers: ticket.headers,
      body: 'my answer',
    });
    expect(put.status).toBe(200);
    storageKey = ticket.key;

    await harness.db.insert(submissionFiles).values({
      institutionId,
      submissionId: submission!.id,
      storageKey,
      filename: 'answer.pdf',
      contentType: 'application/pdf',
      sizeBytes: 9,
    });

    const [event] = await harness.db
      .insert(notificationEvents)
      .values({
        institutionId,
        type: 'grade_published',
        dedupeKey: 'grade_published:1:2026-09-19',
        courseOfferingId: offering!.id,
        payload: { grade: 'C', attempt: 1 },
        occurredAt: new Date(),
      })
      .returning();
    await harness.db.insert(notificationDeliveries).values({
      institutionId,
      notificationEventId: event!.id,
      userId: student.user.id,
    });

    await harness.db.insert(userEmails).values({
      institutionId,
      userId: student.user.id,
      address: 'jana.institutional@example.com',
      isPrimary: true,
    });
    await harness.db.insert(externalIdentities).values({
      institutionId,
      userId: student.user.id,
      issuer: 'https://idp.example.com',
      subject: 'jana-1',
      assertedEmail: 'jana@example.com',
    });
    await harness.db.insert(refreshTokens).values({
      userId: student.user.id,
      tokenHash: 'hash-of-a-live-session',
      expiresAt: new Date(Date.now() + 86_400_000),
      userAgent: 'Firefox',
      ipAddress: '10.0.0.7',
    });
    await harness.db.insert(passwordResetTokens).values({
      userId: student.user.id,
      tokenHash: 'hash-of-a-reset',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    await harness.db.insert(invitations).values({
      institutionId,
      address: 'jana@example.com',
      role: 'student',
      scopeType: 'institution',
      scopeId: null,
      tokenHash: 'hash-of-an-invitation',
      expiresAt: new Date(Date.now() + 86_400_000),
      acceptedAt: new Date(),
      acceptedUserId: student.user.id,
    });
  });

  describe('export', () => {
    it('answers the caller with everything the institution holds about them', async () => {
      const response = await exportAs(student);
      expect(response.statusCode).toBe(200);

      const document = response.json();

      expect(document.institutionId).toBe(institutionId);
      expect(document.account).toMatchObject({
        id: student.user.id,
        email: 'jana@example.com',
      });
      expect(document.emails).toHaveLength(1);
      expect(document.externalIdentities[0].issuer).toBe('https://idp.example.com');
      expect(document.sessions[0]).toMatchObject({ ipAddress: '10.0.0.7' });
      expect(document.passwordResets).toHaveLength(1);
      expect(document.invitations[0].address).toBe('jana@example.com');
      expect(document.roles[0].role).toBe('student');
      expect(document.programMemberships[0]).toMatchObject({ programCode: 'INF-BC' });
      expect(document.enrollments[0]).toMatchObject({ courseCode: 'INF/ALG/22' });
      expect(document.courseResults[0]).toMatchObject({
        officialGrade: 'C',
        conflictNote: CONFLICT_NOTE,
      });
      expect(document.examRegistrations[0].status).toBe('registered');
      expect(document.studyGroupMemberships[0].code).toBe('S1');
      expect(document.assessmentResults[0]).toMatchObject({ points: 17, feedback: FEEDBACK });
      expect(document.activityCompletions).toEqual([
        expect.objectContaining({ activityName: 'Assignment 1', state: 'complete' }),
        expect.objectContaining({
          activityName: 'Week 1 notes',
          learningActivityId: null,
          learningMaterialId: expect.any(String),
          viewedAt: expect.any(String),
        }),
      ]);
      expect(document.submissions[0]).toMatchObject({ notes: SUBMISSION_NOTES, isLate: true });
      expect(document.submissions[0].files[0].storageKey).toBe(storageKey);
      expect(document.notifications[0].payload).toMatchObject({ grade: 'C' });
      expect(document.files[0].storageKey).toBe(storageKey);
    });

    it('never answers with anybody else’s data', async () => {
      const response = await exportAs(classmate);
      expect(response.statusCode).toBe(200);

      const document = response.json();
      const serialised = JSON.stringify(document);

      expect(document.account.id).toBe(classmate.user.id);
      expect(document.courseResults[0].officialGrade).toBe('A');
      expect(serialised).not.toContain('jana@example.com');
      expect(serialised).not.toContain(CONFLICT_NOTE);
      expect(serialised).not.toContain(student.user.id);
    });

    it('refuses a caller with no standing in the institution', async () => {
      const outsider = await harness.actingAs({ email: 'outsider@example.com' });

      expect((await exportAs(outsider)).statusCode).toBe(403);
    });
  });

  describe('erasure', () => {
    it('anonymises the person and keeps the grades pointing at the row', async () => {
      const response = await eraseAs(admin, student.user.id);
      expect(response.statusCode).toBe(200);

      const erased = await personRow(student.user.id);
      expect(erased.email).toMatch(/^erased-.+@erased\.invalid$/u);
      expect(erased.displayName).not.toContain('Actor');
      expect(erased.passwordHash).toBeNull();
      expect(erased.tokenVersion).toBe(student.user.tokenVersion + 1);

      const results = await harness.db
        .select()
        .from(officialCourseResults)
        .where(eq(officialCourseResults.enrollmentId, enrollmentId));
      expect(results).toHaveLength(1);
      expect(results[0]!.officialGrade).toBe('C');

      const kept = await harness.db
        .select()
        .from(enrollments)
        .where(eq(enrollments.userId, student.user.id));
      expect(kept).toHaveLength(1);
    });

    it('destroys the credentials rather than soft-deleting them', async () => {
      await harness.db.insert(twoFactorCredentials).values({
        userId: student.user.id,
        secretCiphertext: 'v1.a.b.c',
        enabledAt: new Date(),
      });
      await harness.db
        .insert(twoFactorRecoveryCodes)
        .values({ userId: student.user.id, codeHash: 'hash' });
      await harness.db
        .insert(calendarFeeds)
        .values({ institutionId, userId: student.user.id, tokenHash: 'feed-hash' });

      const erased = await eraseAs(admin, student.user.id);
      expect(erased.json()).toMatchObject({
        tally: { twoFactorCredentials: 1, recoveryCodes: 1, calendarFeeds: 1 },
      });
      expect(
        await harness.db
          .select()
          .from(calendarFeeds)
          .where(eq(calendarFeeds.userId, student.user.id)),
      ).toEqual([]);

      const { tokens, resets, emails, identities, invites } = await rowsOf(student.user.id);

      expect(tokens).toEqual([]);
      expect(resets).toEqual([]);
      expect(emails).toEqual([]);
      expect(identities).toEqual([]);
      expect(invites).toEqual([]);
      expect(
        await harness.db
          .select()
          .from(twoFactorCredentials)
          .where(eq(twoFactorCredentials.userId, student.user.id)),
      ).toEqual([]);
      expect(
        await harness.db
          .select()
          .from(twoFactorRecoveryCodes)
          .where(eq(twoFactorRecoveryCodes.userId, student.user.id)),
      ).toEqual([]);
    });

    it('leaves an erased person unable to sign in', async () => {
      const before = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'jana@example.com', password: PASSWORD },
      });
      expect(before.statusCode).toBe(200);

      await eraseAs(admin, student.user.id);

      const after = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'jana@example.com', password: PASSWORD },
      });
      expect(after.statusCode).toBe(401);
    });

    it('clears the free text a human wrote about the person', async () => {
      await eraseAs(admin, student.user.id);

      const [result] = await harness.db
        .select()
        .from(officialCourseResults)
        .where(eq(officialCourseResults.enrollmentId, enrollmentId));
      const [mark] = await harness.db
        .select()
        .from(assessmentResults)
        .where(eq(assessmentResults.userId, student.user.id));
      const [submission] = await harness.db
        .select()
        .from(submissions)
        .where(eq(submissions.userId, student.user.id));

      expect(result!.conflictNote).toBeNull();
      expect(mark!.feedback).toBeNull();
      expect(mark!.points).toBe('17.0000');
      expect(submission!.notes).toBeNull();
    });

    it('deletes their files from the object store', async () => {
      expect(await storage.head(storageKey)).toBeDefined();

      await eraseAs(admin, student.user.id);

      expect(await storage.head(storageKey)).toBeUndefined();
      expect(
        await harness.db
          .select()
          .from(submissionFiles)
          .where(eq(submissionFiles.storageKey, storageKey)),
      ).toEqual([]);
    });

    it('keeps the folder files a person put on a course page, which are the course’s', async () => {
      const [space] = await harness.db
        .select({ id: learningSpaces.id })
        .from(learningSpaces)
        .where(eq(learningSpaces.institutionId, institutionId));
      const [folder] = await harness.db
        .insert(learningMaterials)
        .values({
          institutionId,
          learningSpaceId: space!.id,
          kind: 'folder',
          title: 'Handouts',
          createdById: classmate.user.id,
        })
        .returning();
      const ticket = await storage.createUploadTicket({
        institutionId,
        purpose: 'materials',
        filename: 'sheet.pdf',
        contentType: 'application/pdf',
      });
      await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: 'handout' });
      await harness.db.insert(learningMaterialFiles).values({
        institutionId,
        learningMaterialId: folder!.id,
        storageKey: ticket.key,
        filename: 'sheet.pdf',
        contentType: 'application/pdf',
        sizeBytes: 7,
      });

      expect((await eraseAs(admin, classmate.user.id)).statusCode).toBe(200);

      expect(await storage.head(ticket.key)).toBeDefined();
      expect(
        await harness.db
          .select({ filename: learningMaterialFiles.filename })
          .from(learningMaterialFiles)
          .where(eq(learningMaterialFiles.learningMaterialId, folder!.id)),
      ).toEqual([{ filename: 'sheet.pdf' }]);
    });

    it('refuses while another institution still has an active relationship', async () => {
      await harness.db.insert(roleAssignments).values({
        institutionId: otherInstitutionId,
        userId: student.user.id,
        role: 'student',
        scopeType: 'institution',
        scopeId: null,
      });

      const response = await eraseAs(admin, student.user.id);

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('PERSON_KNOWN_TO_ANOTHER_INSTITUTION');
      expect(JSON.stringify(response.json())).not.toContain(otherInstitutionId);
      expect((await personRow(student.user.id)).email).toBe('jana@example.com');
    });

    it('refuses a caller without institution:manage', async () => {
      const response = await eraseAs(classmate, student.user.id);

      expect(response.statusCode).toBe(403);
      expect((await personRow(student.user.id)).email).toBe('jana@example.com');
    });

    it('records an audit event that names no identifier of the erased person', async () => {
      const response = await eraseAs(admin, student.user.id);
      const { erasureId } = response.json();

      const [event] = await harness.db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.institutionId, institutionId),
            eq(auditEvents.action, 'personal_data.erased'),
          ),
        );

      expect(event).toBeDefined();
      expect(event!.subjectType).toBe('personal_data_erasure');
      expect(event!.subjectId).toBe(erasureId);
      expect(event!.actorUserId).toBe(admin.user.id);

      const serialised = JSON.stringify(event);
      expect(serialised).not.toContain(student.user.id);
      expect(serialised).not.toContain('jana@example.com');
      expect(serialised).not.toContain(student.user.displayName);
    });
  });
});

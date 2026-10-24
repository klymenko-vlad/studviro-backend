import { and, count, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  academicTerms,
  activityCompletions,
  assessmentResults,
  assessments,
  auditEvents,
  courseOfferings,
  enrollments,
  institutions,
  learningActivities,
  learningMaterialFiles,
  learningMaterials,
  learningSections,
  learningSpaces,
  questions,
  questionVersions,
  quizAttempts,
  roleAssignments,
  quizSlots,
  studyGroups,
  submissions,
  teachingAssignments,
} from '../../src/database/schema';
import { AuditService } from '../../src/modules/audit/audit.service';
import { StorageService } from '../../src/modules/storage/storage.service';
import { createTestHarness, type ActingUser, type TestHarness } from '../setup/app-harness';
import {
  putToStore,
  seedLearningFixture,
  type LearningFixture,
} from '../setup/learning-fixture';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Row = { id: string } & Record<string, unknown>;

const SOURCE_START = new Date('2025-09-22T00:00:00.000Z');
const TARGET_START = new Date('2026-09-21T00:00:00.000Z');
const GAP = TARGET_START.getTime() - SOURCE_START.getTime();
const later = (iso: string) => new Date(Date.parse(iso) + GAP).toISOString();

describe('Reuse last year’s course (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;
  let pastStudent: ActingUser;
  let sourceOfferingId: string;
  let sourceId: string;
  let targetId: string;

  const call = (actor: ActingUser, method: Method, url: string, payload?: unknown) =>
    harness.inject({
      method,
      url: `/api/v1/institutions/${fixture.institutionId}${url}`,
      headers: actor.headers,
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  const ok = async <T = Row>(
    actor: ActingUser,
    method: Method,
    url: string,
    payload?: unknown,
    status = method === 'POST' ? 201 : 200,
  ): Promise<T> => {
    const response = await call(actor, method, url, payload);
    expect(response.statusCode, response.body).toBe(status);

    return response.json<T>();
  };

  const in_ = (spaceId: string, path: string) => `/learning-spaces/${spaceId}${path}`;
  const author = (spaceId: string, path: string, payload: unknown) =>
    ok(fixture.teacher, 'POST', in_(spaceId, path), payload);
  const importInto = (spaceId: string, payload: unknown, actor = fixture.teacher) =>
    call(actor, 'POST', in_(spaceId, '/import'), payload);

  const openSpace = async (offeringId: string, name: string) =>
    (
      await ok(fixture.admin, 'POST', '/learning-spaces', {
        courseOfferingId: offeringId,
        name,
        visible: true,
      })
    ).id;

  const upload = async (spaceId: string, filename: string, body: string) => {
    const ticket = await ok<{ key: string; url: string; headers: Record<string, string> }>(
      fixture.teacher,
      'POST',
      in_(spaceId, '/materials/upload-tickets'),
      { filename, contentType: 'application/pdf' },
    );
    expect(await putToStore(ticket, body)).toBe(200);

    return ticket.key;
  };

  const downloaded = async (spaceId: string, path: string) => {
    const link = await ok<{ url: string }>(fixture.teacher, 'GET', in_(spaceId, path));

    return (await fetch(link.url)).text();
  };

  interface Source {
    week1: Row;
    week2: Row;
    note: Row;
    file: Row;
    folder: Row;
    forGroups: Row;
    afterQuiz: Row;
    assignment: Row;
    quiz: Row;
    s1: string;
    s9: string;
  }

  const buildSource = async (): Promise<Source> => {
    const [s1, s9] = await harness.db
      .insert(studyGroups)
      .values([
        {
          institutionId: fixture.institutionId,
          courseOfferingId: sourceOfferingId,
          code: 'S1',
        },
        {
          institutionId: fixture.institutionId,
          courseOfferingId: sourceOfferingId,
          code: 'S9',
        },
      ])
      .returning();

    const week1 = await author(sourceId, '/sections', {
      title: 'Week 1',
      summary: 'Searching',
      availableFrom: '2025-09-29T07:00:00.000Z',
    });
    const assignment = await author(sourceId, '/assignments', {
      name: 'Assignment 1',
      brief: 'Sort it.',
      sectionId: week1.id,
      opensAt: '2025-09-29T07:00:00.000Z',
      dueAt: '2025-10-06T21:59:00.000Z',
      closesAt: '2025-10-13T21:59:00.000Z',
      maxAttempts: 2,
      allowsLateSubmission: true,
      maxPoints: 20,
      completionRule: 'passed',
      completionPassPoints: 10,
    });
    const week2 = await author(sourceId, '/sections', {
      title: 'Week 2',
      restriction: {
        match: 'all',
        conditions: [{ type: 'completed', itemKind: 'assignment', itemId: assignment.id }],
      },
    });
    const note = await author(sourceId, '/materials', {
      kind: 'text',
      title: 'How this course works',
      body: 'Weekly lectures.',
      completionRule: 'manual',
    });
    const file = await author(sourceId, '/materials', {
      kind: 'file',
      title: 'Lecture 1 slides',
      sectionId: week1.id,
      storageKey: await upload(sourceId, 'lecture-01.pdf', 'SLIDES-BYTES'),
      filename: 'lecture-01.pdf',
    });
    const folder = await author(sourceId, '/materials', {
      kind: 'folder',
      title: 'Handouts',
      sectionId: week1.id,
    });
    for (const name of ['sheet-1.pdf', 'sheet-2.pdf']) {
      await author(sourceId, `/materials/${folder.id}/files`, {
        storageKey: await upload(sourceId, name, `BYTES-${name}`),
        filename: name,
      });
    }
    await author(sourceId, '/materials', {
      kind: 'page',
      title: 'Study guide',
      sectionId: week1.id,
      body: '# Guide\n\nRead it.',
    });
    const forGroups = await author(sourceId, '/materials', {
      kind: 'text',
      title: 'Seminar worksheet',
      sectionId: week2.id,
      body: 'For S1 and S9.',
      restriction: {
        match: 'all',
        conditions: [{ type: 'date', from: '2025-10-20T07:00:00.000Z' }],
      },
      audience: { groupIds: [s1!.id, s9!.id], hideFromOthers: true },
    });

    const sorting = await author(sourceId, '/question-categories', { name: 'Sorting' });
    const graphs = await author(sourceId, '/question-categories', { name: 'Graphs' });
    const stable = await author(sourceId, '/questions', {
      categoryId: sorting.id,
      type: 'true_false',
      name: 'Merge sort is stable',
      text: 'Merge sort is stable.',
      defaultMark: 1,
      correct: false,
    });
    await ok(fixture.teacher, 'PUT', in_(sourceId, `/questions/${stable.id}`), {
      categoryId: sorting.id,
      name: 'Merge sort is stable',
      text: 'Merge sort is stable, as usually written.',
      defaultMark: 1,
      correct: true,
    });
    await author(sourceId, '/questions', {
      categoryId: graphs.id,
      type: 'short_answer',
      name: 'Queue search',
      text: 'Which search uses a queue?',
      defaultMark: 2,
      acceptedAnswers: ['BFS'],
    });
    const quiz = await author(sourceId, '/quizzes', {
      name: 'Week 2 quiz',
      sectionId: week2.id,
      opensAt: '2025-09-22T07:00:00.000Z',
      closesAt: '2027-01-31T21:59:00.000Z',
      timeLimitMinutes: 15,
      gradingMethod: 'last',
      maxAttempts: 3,
      maxPoints: 12,
    });
    await author(sourceId, `/quizzes/${quiz.id}/slots`, {
      kind: 'question',
      questionIds: [stable.id],
    });
    await author(sourceId, `/quizzes/${quiz.id}/slots`, {
      kind: 'random',
      categoryId: graphs.id,
      pickCount: 1,
    });
    const afterQuiz = await author(sourceId, '/materials', {
      kind: 'link',
      title: 'Extension reading',
      sectionId: week2.id,
      url: 'https://example.org/extension',
      restriction: {
        match: 'all',
        conditions: [{ type: 'mark', itemKind: 'quiz', itemId: quiz.id, atLeast: 5 }],
      },
    });

    await harness.db
      .update(learningMaterials)
      .set({ scanStatus: 'clean' })
      .where(eq(learningMaterials.id, file.id));
    await harness.db
      .update(learningMaterialFiles)
      .set({ scanStatus: 'clean' })
      .where(eq(learningMaterialFiles.learningMaterialId, folder.id));

    return {
      week1,
      week2,
      note,
      file,
      folder,
      forGroups,
      afterQuiz,
      assignment,
      quiz,
      s1: s1!.id,
      s9: s9!.id,
    };
  };

  const studentWork = async (source: Source) => {
    const [submission] = await harness.db
      .insert(submissions)
      .values({
        institutionId: fixture.institutionId,
        learningActivityId: source.assignment.id,
        userId: pastStudent.user.id,
        state: 'graded',
        submittedAt: new Date('2025-10-05T10:00:00.000Z'),
      })
      .returning();
    const [column] = await harness.db
      .select()
      .from(assessments)
      .where(eq(assessments.learningActivityId, source.assignment.id));
    await harness.db.insert(assessmentResults).values({
      institutionId: fixture.institutionId,
      assessmentId: column!.id,
      userId: pastStudent.user.id,
      points: '15.0000',
      gradedAt: new Date('2025-10-08T10:00:00.000Z'),
    });
    await harness.db.insert(activityCompletions).values([
      {
        institutionId: fixture.institutionId,
        learningMaterialId: source.note.id,
        userId: pastStudent.user.id,
        state: 'complete',
        markedDoneAt: new Date('2025-09-30T10:00:00.000Z'),
        completedAt: new Date('2025-09-30T10:00:00.000Z'),
      },
      {
        institutionId: fixture.institutionId,
        learningActivityId: source.assignment.id,
        userId: pastStudent.user.id,
        state: 'complete_pass',
        completedAt: new Date('2025-10-08T10:00:00.000Z'),
      },
    ]);
    const attempt = await ok(
      pastStudent,
      'POST',
      in_(sourceId, `/quizzes/${source.quiz.id}/attempts`),
      undefined,
      200,
    );
    await ok(
      pastStudent,
      'POST',
      in_(sourceId, `/quizzes/${source.quiz.id}/attempts/${attempt.id}/submit`),
      undefined,
      200,
    );

    return submission!;
  };

  const rowsOf = async (spaceId: string) => {
    const [sections, materials, activities] = await Promise.all([
      harness.db
        .select()
        .from(learningSections)
        .where(eq(learningSections.learningSpaceId, spaceId)),
      harness.db
        .select()
        .from(learningMaterials)
        .where(eq(learningMaterials.learningSpaceId, spaceId)),
      harness.db
        .select()
        .from(learningActivities)
        .where(eq(learningActivities.learningSpaceId, spaceId)),
    ]);

    return { sections, materials, activities };
  };

  const byTitle = <T extends { title: string }>(rows: readonly T[], title: string): T => {
    const row = rows.find((candidate) => candidate.title === title);
    expect(row, title).toBeDefined();

    return row!;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);

    const [target] = await harness.db
      .select()
      .from(courseOfferings)
      .where(eq(courseOfferings.id, fixture.offeringId));
    await harness.db
      .update(academicTerms)
      .set({ startsAt: TARGET_START })
      .where(eq(academicTerms.id, target!.academicTermId));
    const [past] = await harness.db
      .insert(academicTerms)
      .values({
        institutionId: fixture.institutionId,
        code: '2025W',
        name: 'Winter 2025/2026',
        academicYear: '2025/2026',
        startsAt: SOURCE_START,
        endsAt: new Date('2026-02-15T00:00:00.000Z'),
      })
      .returning();
    const [offering] = await harness.db
      .insert(courseOfferings)
      .values({
        institutionId: fixture.institutionId,
        courseId: target!.courseId,
        academicTermId: past!.id,
      })
      .returning();
    sourceOfferingId = offering!.id;
    await harness.db.insert(teachingAssignments).values({
      institutionId: fixture.institutionId,
      courseOfferingId: sourceOfferingId,
      userId: fixture.teacher.user.id,
      role: 'lecturer',
    });
    pastStudent = await harness.actingAs({ email: 'past-student@example.com' });
    await harness.db.insert(roleAssignments).values({
      institutionId: fixture.institutionId,
      userId: pastStudent.user.id,
      role: 'student',
      scopeType: 'institution',
      scopeId: null,
    });
    await harness.db.insert(enrollments).values({
      institutionId: fixture.institutionId,
      courseOfferingId: sourceOfferingId,
      userId: pastStudent.user.id,
      status: 'active',
    });

    sourceId = await openSpace(sourceOfferingId, 'Algorithms 2025');
    targetId = await openSpace(fixture.offeringId, 'Algorithms 2026');
  });

  it('copies sections, materials, files, assignments, quizzes and the bank, every date moved by the gap between the terms', async () => {
    const source = await buildSource();

    const report = await ok(fixture.teacher, 'POST', in_(targetId, '/import'), {
      from: sourceId,
    });

    expect(report).toMatchObject({
      source: { spaceId: sourceId, name: 'Algorithms 2025', termName: 'Winter 2025/2026' },
      imported: true,
      visibility: 'hidden',
      counts: {
        sections: 2,
        materials: 6,
        files: 3,
        assignments: 1,
        quizzes: 1,
        quizSlots: 2,
        questionCategories: 2,
        questions: 2,
      },
      dateShift: {
        applied: true,
        days: 364,
        sourceStartsAt: SOURCE_START.toISOString(),
        targetStartsAt: TARGET_START.toISOString(),
      },
      shiftedDates: 7,
    });

    const copied = await rowsOf(targetId);
    const week1 = byTitle(copied.sections, 'Week 1');
    const week2 = byTitle(copied.sections, 'Week 2');
    expect(week1).toMatchObject({
      summary: 'Searching',
      availableFrom: new Date(later('2025-09-29T07:00:00.000Z')),
    });

    const assignment = copied.activities.find((row) => row.type === 'assignment')!;
    expect(assignment).toMatchObject({
      name: 'Assignment 1',
      sectionId: week1.id,
      opensAt: new Date(later('2025-09-29T07:00:00.000Z')),
      dueAt: new Date(later('2025-10-06T21:59:00.000Z')),
      closesAt: new Date(later('2025-10-13T21:59:00.000Z')),
      maxAttempts: 2,
      allowsLateSubmission: true,
      completionRule: 'passed',
      completionPassPoints: '10.0000',
      announcedAt: null,
    });
    expect(assignment.id).not.toBe(source.assignment.id);
    expect(week2.restriction).toEqual({
      match: 'all',
      hideWhenLocked: false,
      conditions: [{ type: 'completed', itemKind: 'assignment', itemId: assignment.id }],
    });
    const [column] = await harness.db
      .select()
      .from(assessments)
      .where(eq(assessments.learningActivityId, assignment.id));
    expect(column).toMatchObject({ learningSpaceId: targetId, maxPoints: '20.0000' });

    const quiz = copied.activities.find((row) => row.type === 'quiz')!;
    expect(quiz).toMatchObject({
      sectionId: week2.id,
      opensAt: new Date(later('2025-09-22T07:00:00.000Z')),
      dueAt: new Date(later('2027-01-31T21:59:00.000Z')),
      maxAttempts: 3,
    });
    const quizRead = await ok(fixture.teacher, 'GET', in_(targetId, `/quizzes/${quiz.id}`));
    expect(quizRead).toMatchObject({
      settings: { timeLimitMinutes: 15, gradingMethod: 'last' },
      maxPoints: 12,
    });
    expect(byTitle(copied.materials, 'Extension reading').restriction?.conditions).toEqual([
      { type: 'mark', itemKind: 'quiz', itemId: quiz.id, atLeast: 5 },
    ]);

    const bank = await harness.db
      .select({ question: questions, version: questionVersions })
      .from(questions)
      .innerJoin(questionVersions, eq(questionVersions.questionId, questions.id))
      .where(eq(questions.learningSpaceId, targetId));
    expect(bank).toHaveLength(2);
    expect(
      bank.every(
        ({ question, version }) => question.latestVersion === 1 && version.version === 1,
      ),
    ).toBe(true);
    const stable = bank.find(({ version }) => version.name === 'Merge sort is stable')!;
    expect(stable.version).toMatchObject({
      text: 'Merge sort is stable, as usually written.',
      answerKey: { correct: true },
      createdById: fixture.teacher.user.id,
    });
    const slots = await harness.db
      .select()
      .from(quizSlots)
      .where(eq(quizSlots.learningActivityId, quiz.id));
    expect(slots.map((slot) => slot.kind).sort()).toEqual(['question', 'random']);
    expect(slots.find((slot) => slot.kind === 'question')?.questionId).toBe(stable.question.id);
    const [graphs] = await harness.db
      .select({ categoryId: questions.categoryId })
      .from(questions)
      .where(and(eq(questions.learningSpaceId, targetId), eq(questions.type, 'short_answer')));
    expect(slots.find((slot) => slot.kind === 'random')?.categoryId).toBe(graphs!.categoryId);

    const file = byTitle(copied.materials, 'Lecture 1 slides');
    const [original] = await harness.db
      .select()
      .from(learningMaterials)
      .where(eq(learningMaterials.id, source.file.id));
    expect(file.storageKey).not.toBe(original!.storageKey);
    expect(file.storageKey).toMatch(
      new RegExp(`^institutions/${fixture.institutionId}/materials/`),
    );
    expect(file.filename).toBe('lecture-01.pdf');
    await expect(downloaded(targetId, `/materials/${file.id}/download`)).resolves.toBe(
      'SLIDES-BYTES',
    );

    const folder = byTitle(copied.materials, 'Handouts');
    const files = await ok<{ items: Row[] }>(
      fixture.teacher,
      'GET',
      in_(targetId, `/materials/${folder.id}/files`),
    );
    expect(files.items.map((row) => row.filename)).toEqual(['sheet-1.pdf', 'sheet-2.pdf']);
    await expect(
      downloaded(targetId, `/materials/${folder.id}/files/${files.items[0]!.id}/download`),
    ).resolves.toBe('BYTES-sheet-1.pdf');

    await harness.db
      .update(learningMaterials)
      .set({ deletedAt: new Date() })
      .where(eq(learningMaterials.id, source.file.id));
    await expect(downloaded(targetId, `/materials/${file.id}/download`)).resolves.toBe(
      'SLIDES-BYTES',
    );
  });

  it('copies nothing a student did, and leaves the source’s student work as it was', async () => {
    const source = await buildSource();
    await studentWork(source);
    const before = await harness.db.select({ n: count() }).from(quizAttempts);

    await ok(fixture.teacher, 'POST', in_(targetId, '/import'), { from: sourceId });

    const copied = await rowsOf(targetId);
    const activityIds = copied.activities.map((row) => row.id);
    const materialIds = copied.materials.map((row) => row.id);
    const columnIds = (
      await harness.db
        .select({ id: assessments.id })
        .from(assessments)
        .where(eq(assessments.learningSpaceId, targetId))
    ).map((row) => row.id);
    expect(activityIds).toHaveLength(2);

    const counted = async (query: Promise<{ n: number }[]>) => (await query)[0]!.n;
    expect(
      await counted(
        harness.db
          .select({ n: count() })
          .from(submissions)
          .where(inArray(submissions.learningActivityId, activityIds)),
      ),
    ).toBe(0);
    expect(
      await counted(
        harness.db
          .select({ n: count() })
          .from(assessmentResults)
          .where(inArray(assessmentResults.assessmentId, columnIds)),
      ),
    ).toBe(0);
    expect(
      await counted(
        harness.db
          .select({ n: count() })
          .from(activityCompletions)
          .where(inArray(activityCompletions.learningMaterialId, materialIds)),
      ),
    ).toBe(0);
    expect(
      await counted(
        harness.db
          .select({ n: count() })
          .from(activityCompletions)
          .where(inArray(activityCompletions.learningActivityId, activityIds)),
      ),
    ).toBe(0);
    expect(
      await counted(
        harness.db
          .select({ n: count() })
          .from(quizAttempts)
          .where(inArray(quizAttempts.learningActivityId, activityIds)),
      ),
    ).toBe(0);

    expect(await harness.db.select({ n: count() }).from(quizAttempts)).toEqual(before);
    expect(
      await counted(
        harness.db
          .select({ n: count() })
          .from(submissions)
          .where(eq(submissions.learningActivityId, source.assignment.id)),
      ),
    ).toBe(1);
  });

  it('lands hidden from students by default: every copied section and everything outside one', async () => {
    await buildSource();

    await ok(fixture.teacher, 'POST', in_(targetId, '/import'), { from: sourceId });

    const copied = await rowsOf(targetId);
    expect(copied.sections.every((row) => !row.visible)).toBe(true);
    expect(byTitle(copied.materials, 'How this course works').visible).toBe(false);
    expect(byTitle(copied.materials, 'Lecture 1 slides').visible).toBe(true);

    const sections = await ok<Row[]>(fixture.student, 'GET', in_(targetId, '/sections'));
    const materials = await ok<Row[]>(fixture.student, 'GET', in_(targetId, '/materials'));
    const assignments = await ok<Row[]>(fixture.student, 'GET', in_(targetId, '/assignments'));
    const quizzes = await ok<Row[]>(fixture.student, 'GET', in_(targetId, '/quizzes'));
    expect([...sections, ...materials, ...assignments, ...quizzes]).toEqual([]);
  });

  it('keeps the source’s visibility when asked to', async () => {
    await buildSource();

    const report = await ok(fixture.teacher, 'POST', in_(targetId, '/import'), {
      from: sourceId,
      visibility: 'source',
    });

    expect(report.visibility).toBe('source');
    const copied = await rowsOf(targetId);
    expect(copied.sections.every((row) => row.visible)).toBe(true);
    expect(byTitle(copied.materials, 'How this course works').visible).toBe(true);
    const materials = await ok<Row[]>(fixture.student, 'GET', in_(targetId, '/materials'));
    expect(materials.map((row) => row.title)).toContain('How this course works');
  });

  it('adds after what the page already holds and overwrites nothing', async () => {
    await buildSource();
    const intro = await author(targetId, '/sections', { title: 'Introduction' });
    const welcome = await author(targetId, '/materials', {
      kind: 'text',
      title: 'Welcome',
      body: 'Hello.',
    });

    await ok(fixture.teacher, 'POST', in_(targetId, '/import'), { from: sourceId });

    const sections = await ok<Row[]>(fixture.teacher, 'GET', in_(targetId, '/sections'));
    expect(sections.map((row) => row.title)).toEqual(['Introduction', 'Week 1', 'Week 2']);
    expect(sections[0]!.id).toBe(intro.id);

    const materials = await ok<Row[]>(fixture.teacher, 'GET', in_(targetId, '/materials'));
    const general = materials.filter((row) => row.sectionId === null);
    expect(general.map((row) => row.title)).toEqual(['Welcome', 'How this course works']);
    expect(general[0]).toMatchObject({ id: welcome.id, body: 'Hello.' });
  });

  it('matches groups by code in the new offering, drops the rest, hides what lost one, and says so', async () => {
    await buildSource();
    const [s1] = await harness.db
      .insert(studyGroups)
      .values({
        institutionId: fixture.institutionId,
        courseOfferingId: fixture.offeringId,
        code: 's1',
      })
      .returning();

    const report = await ok(fixture.teacher, 'POST', in_(targetId, '/import'), {
      from: sourceId,
      visibility: 'source',
    });

    const worksheet = byTitle((await rowsOf(targetId)).materials, 'Seminar worksheet');
    expect(worksheet.restriction).toEqual({
      match: 'all',
      hideWhenLocked: false,
      conditions: [{ type: 'date', from: later('2025-10-20T07:00:00.000Z') }],
      audience: { groupIds: [s1!.id], hideFromOthers: true },
    });
    expect(worksheet.visible).toBe(false);
    expect(report.flags).toContainEqual({
      code: 'group_dropped',
      count: 1,
      titles: ['Seminar worksheet'],
    });
  });

  it('leaves out files not yet checked or found infected, and flags them', async () => {
    const source = await buildSource();
    await harness.db
      .update(learningMaterials)
      .set({ scanStatus: 'pending' })
      .where(eq(learningMaterials.id, source.file.id));
    await harness.db
      .update(learningMaterialFiles)
      .set({ scanStatus: 'infected', storageKey: null })
      .where(
        and(
          eq(learningMaterialFiles.learningMaterialId, source.folder.id),
          eq(learningMaterialFiles.filename, 'sheet-2.pdf'),
        ),
      );
    await harness.db
      .update(learningMaterialFiles)
      .set({ scanStatus: 'clean' })
      .where(
        and(
          eq(learningMaterialFiles.learningMaterialId, source.folder.id),
          eq(learningMaterialFiles.filename, 'sheet-1.pdf'),
        ),
      );

    const report = await ok(fixture.teacher, 'POST', in_(targetId, '/import'), {
      from: sourceId,
    });

    expect(report.counts).toMatchObject({ materials: 5, files: 1 });
    expect(report.flags).toEqual(
      expect.arrayContaining([
        { code: 'file_not_scanned', count: 1, titles: ['Lecture 1 slides'] },
        { code: 'file_missing', count: 1, titles: ['sheet-2.pdf'] },
      ]),
    );
    const copied = await rowsOf(targetId);
    expect(copied.materials.map((row) => row.title)).not.toContain('Lecture 1 slides');
    const [kept] = await harness.db
      .select()
      .from(learningMaterialFiles)
      .where(
        eq(learningMaterialFiles.learningMaterialId, byTitle(copied.materials, 'Handouts').id),
      );
    expect(kept).toMatchObject({ filename: 'sheet-1.pdf', scanStatus: 'clean' });
  });

  it('previews exactly what the import does, writing nothing', async () => {
    await buildSource();

    const preview = await ok(
      fixture.teacher,
      'GET',
      in_(targetId, `/import/preview?from=${sourceId}`),
    );

    expect(preview.imported).toBe(false);
    expect(await rowsOf(targetId)).toEqual({ sections: [], materials: [], activities: [] });

    const report = await ok(fixture.teacher, 'POST', in_(targetId, '/import'), {
      from: sourceId,
    });
    expect({ ...report, imported: false }).toEqual(preview);
  });

  it('renames a copied category whose name the bank already holds', async () => {
    await buildSource();
    await author(targetId, '/question-categories', { name: 'sorting' });

    const report = await ok(fixture.teacher, 'POST', in_(targetId, '/import'), {
      from: sourceId,
    });

    expect(report.flags).toContainEqual({
      code: 'category_renamed',
      count: 1,
      titles: ['Sorting (2025W)'],
    });
    const categories = await ok<{ items: { name: string }[] }>(
      fixture.teacher,
      'GET',
      in_(targetId, '/question-categories'),
    );
    expect(new Set(categories.items.map((row) => row.name))).toEqual(
      new Set(['Graphs', 'sorting', 'Sorting (2025W)']),
    );
  });

  it('records the import in the audit log', async () => {
    await buildSource();

    await ok(fixture.teacher, 'POST', in_(targetId, '/import'), { from: sourceId });

    const [event] = await harness.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'learning_space.imported'));
    expect(event).toMatchObject({
      actorUserId: fixture.teacher.user.id,
      subjectType: 'learning_space',
      subjectId: targetId,
      after: expect.objectContaining({ fromSpaceId: sourceId, shiftDays: 364 }),
    });
  });

  it('writes nothing and removes the copied files when the transaction fails', async () => {
    await buildSource();
    const storage = harness.app.get(StorageService);
    const copiedKeys: string[] = [];
    const copy = storage.copy.bind(storage);
    vi.spyOn(storage, 'copy').mockImplementation(async (from, to, institutionId) => {
      copiedKeys.push(to);
      await copy(from, to, institutionId);
    });
    vi.spyOn(harness.app.get(AuditService), 'record').mockRejectedValueOnce(new Error('boom'));

    const response = await importInto(targetId, { from: sourceId });

    expect(response.statusCode).toBe(500);
    expect(await rowsOf(targetId)).toEqual({ sections: [], materials: [], activities: [] });
    expect(copiedKeys).toHaveLength(3);
    for (const key of copiedKeys) await expect(storage.head(key)).resolves.toBeUndefined();
  });

  it('writes nothing when a file cannot be copied, and removes the copies already made', async () => {
    await buildSource();
    const storage = harness.app.get(StorageService);
    const copiedKeys: string[] = [];
    const copy = storage.copy.bind(storage);
    let calls = 0;
    vi.spyOn(storage, 'copy').mockImplementation(async (from, to, institutionId) => {
      calls += 1;
      if (calls === 2) throw new Error('store down');
      await copy(from, to, institutionId);
      copiedKeys.push(to);
    });

    const response = await importInto(targetId, { from: sourceId });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('COURSE_IMPORT_COPY_FAILED');
    expect(await rowsOf(targetId)).toEqual({ sections: [], materials: [], activities: [] });
    for (const key of copiedKeys) await expect(storage.head(key)).resolves.toBeUndefined();
  });

  describe('who may import', () => {
    it('refuses a student, and a teacher of neither page', async () => {
      await buildSource();

      for (const actor of [fixture.student, fixture.otherTeacher]) {
        expect((await importInto(targetId, { from: sourceId }, actor)).statusCode).toBe(403);
        expect(
          (await call(actor, 'GET', in_(targetId, `/import/preview?from=${sourceId}`)))
            .statusCode,
        ).toBe(403);
        expect((await call(actor, 'GET', in_(targetId, '/import/sources'))).statusCode).toBe(
          403,
        );
      }
    });

    it('refuses a source page the author does not teach', async () => {
      const databases = await openSpace(fixture.otherOfferingId, 'Databases');

      const response = await importInto(targetId, { from: databases });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('LEARNING_AUTHORING_DENIED');
    });

    it('does not find a page of another institution, or one that does not exist', async () => {
      const [other] = await harness.db
        .insert(institutions)
        .values({ code: 'tuke', name: 'TUKE' })
        .returning();
      const [foreign] = await harness.db
        .insert(learningSpaces)
        .values({ institutionId: other!.id, name: 'Elsewhere' })
        .returning();

      expect(
        (await importInto(targetId, { from: foreign!.id }, fixture.admin)).statusCode,
      ).toBe(404);
      expect(
        (await importInto(targetId, { from: '00000000-0000-4000-8000-000000000000' }))
          .statusCode,
      ).toBe(404);
    });

    it('refuses to import a page into itself', async () => {
      const response = await importInto(targetId, { from: targetId });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('COURSE_IMPORT_SAME_PAGE');
    });

    it('refuses an unknown visibility', async () => {
      const response = await importInto(targetId, { from: sourceId, visibility: 'public' });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('choosing what to import from', () => {
    it('lists the author’s other pages, the same course first, a page at a time, filtered', async () => {
      const databases = await openSpace(fixture.otherOfferingId, 'Databases 2026');
      await harness.db.insert(teachingAssignments).values({
        institutionId: fixture.institutionId,
        courseOfferingId: fixture.otherOfferingId,
        userId: fixture.teacher.user.id,
        role: 'lecturer',
      });

      const all = await ok<{ items: Row[]; meta: Record<string, unknown> }>(
        fixture.teacher,
        'GET',
        in_(targetId, '/import/sources'),
      );
      expect(all.items.map((row) => row.spaceId)).toEqual([sourceId, databases]);
      expect(all.items[0]).toMatchObject({
        name: 'Algorithms 2025',
        courseCode: 'INF/ALG/22',
        termCode: '2025W',
        sameCourse: true,
      });
      expect(all.items[1]).toMatchObject({ sameCourse: false });

      const page = await ok<{ items: Row[]; meta: Record<string, unknown> }>(
        fixture.teacher,
        'GET',
        in_(targetId, '/import/sources?limit=1&page=2'),
      );
      expect(page.items.map((row) => row.spaceId)).toEqual([databases]);
      expect(page.meta).toMatchObject({ total: 2, page: 2 });

      const filtered = await ok<{ items: Row[] }>(
        fixture.teacher,
        'GET',
        in_(targetId, '/import/sources?q=dbs'),
      );
      expect(filtered.items.map((row) => row.spaceId)).toEqual([databases]);
    });

    it('lists only pages of offerings the teacher teaches; an administrator sees every page', async () => {
      const databases = await openSpace(fixture.otherOfferingId, 'Databases 2026');

      const teacher = await ok<{ items: Row[] }>(
        fixture.teacher,
        'GET',
        in_(targetId, '/import/sources'),
      );
      expect(teacher.items.map((row) => row.spaceId)).toEqual([sourceId]);

      const admin = await ok<{ items: Row[] }>(
        fixture.admin,
        'GET',
        in_(targetId, '/import/sources'),
      );
      expect(admin.items.map((row) => row.spaceId)).toEqual([sourceId, databases]);
    });
  });
});

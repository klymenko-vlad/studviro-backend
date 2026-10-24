import { describe, expect, it } from 'vitest';

import type {
  Assessment,
  LearningActivity,
  LearningMaterial,
  LearningMaterialFile,
  LearningSection,
  Question,
  QuestionCategory,
  QuestionVersion,
  Quiz,
  QuizSlot,
} from '../../database/schema';

import { dateShiftBetween } from './course-import-dates';
import { planImport, type ImportPlanInput } from './course-import-plan';
import type { ImportSnapshot } from './course-import.types';

const DAY = 86_400_000;
const T0 = new Date('2025-09-01T00:00:00.000Z');
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const SHIFT = dateShiftBetween(
  new Date('2025-09-22T00:00:00.000Z'),
  new Date('2026-09-21T00:00:00.000Z'),
);

const base = { institutionId: 'inst', createdAt: T0, updatedAt: T0, deletedAt: null };

const section = (
  id: string,
  position: number,
  extra: Partial<LearningSection> = {},
): LearningSection => ({
  ...base,
  id,
  learningSpaceId: 'source',
  title: `Section ${id}`,
  summary: null,
  position,
  visible: true,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  restriction: null,
  ...extra,
});

const material = (id: string, extra: Partial<LearningMaterial> = {}): LearningMaterial => ({
  ...base,
  id,
  learningSpaceId: 'source',
  sectionId: null,
  kind: 'text',
  title: `Material ${id}`,
  description: null,
  body: 'Read this',
  url: null,
  storageKey: null,
  filename: null,
  contentType: null,
  sizeBytes: null,
  scanStatus: 'unscanned',
  position: 0,
  visible: true,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  restriction: null,
  completionRule: 'none',
  createdById: 'old-author',
  ...extra,
});

const activity = (id: string, extra: Partial<LearningActivity> = {}): LearningActivity => ({
  ...base,
  id,
  learningSpaceId: 'source',
  sectionId: null,
  type: 'assignment',
  name: `Activity ${id}`,
  brief: 'Do it',
  position: 0,
  opensAt: null,
  dueAt: null,
  closesAt: null,
  maxAttempts: 1,
  allowsLateSubmission: false,
  visible: true,
  availableFrom: null,
  availableUntil: null,
  hiddenUntilAvailable: false,
  restriction: null,
  announcedAt: at(1),
  completionRule: 'none',
  completionPassPoints: null,
  ...extra,
});

const assessment = (activityId: string, extra: Partial<Assessment> = {}): Assessment => ({
  ...base,
  id: `col-${activityId}`,
  learningSpaceId: 'source',
  learningActivityId: activityId,
  name: `Activity ${activityId}`,
  maxPoints: '20.0000',
  weight: null,
  countsTowardFinalGrade: true,
  ...extra,
});

const folderFile = (
  id: string,
  folderId: string,
  extra: Partial<LearningMaterialFile> = {},
): LearningMaterialFile => ({
  ...base,
  id,
  learningMaterialId: folderId,
  storageKey: `institutions/inst/materials/${id}/f.pdf`,
  filename: `${id}.pdf`,
  contentType: 'application/pdf',
  sizeBytes: 10,
  scanStatus: 'clean',
  ...extra,
});

const quizSettings = (activityId: string): Quiz => ({
  learningActivityId: activityId,
  institutionId: 'inst',
  timeLimitSeconds: 600,
  gradingMethod: 'average',
  shuffleQuestions: true,
  shuffleChoices: false,
  layout: 'all_on_one',
  reviewResponses: 'never',
  reviewCorrectness: 'after_close',
  reviewCorrectAnswer: 'never',
  reviewFeedback: 'after_close',
  reviewOverallMark: 'immediately',
  createdAt: T0,
  updatedAt: T0,
});

const category = (id: string, name: string): QuestionCategory => ({
  ...base,
  id,
  learningSpaceId: 'source',
  name,
});

const question = (id: string, categoryId: string, latest = 3) => ({
  question: {
    ...base,
    id,
    learningSpaceId: 'source',
    categoryId,
    type: 'true_false',
    latestVersion: latest,
    createdById: 'old-author',
  } satisfies Question,
  version: {
    id: `v-${id}`,
    institutionId: 'inst',
    questionId: id,
    version: latest,
    name: `Question ${id}`,
    text: 'Is it?',
    defaultMark: '2.0000',
    generalFeedback: 'Because.',
    answerKey: { correct: true, trueFeedback: null, falseFeedback: null },
    createdById: 'old-author',
    createdAt: T0,
  } satisfies QuestionVersion,
});

const slot = (id: string, quizId: string, extra: Partial<QuizSlot>): QuizSlot => ({
  id,
  institutionId: 'inst',
  learningActivityId: quizId,
  position: 0,
  kind: 'question',
  questionId: null,
  categoryId: null,
  pickCount: null,
  mark: '1.0000',
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

const EMPTY: ImportSnapshot = {
  sections: [],
  materials: [],
  folderFiles: [],
  activities: [],
  quizzes: [],
  slots: [],
  categories: [],
  questions: [],
};

const plan = (snapshot: Partial<ImportSnapshot>, extra: Partial<ImportPlanInput> = {}) => {
  let id = 0;
  let key = 0;

  return planImport({
    snapshot: { ...EMPTY, ...snapshot },
    institutionId: 'inst',
    spaceId: 'target',
    userId: 'importer',
    shift: SHIFT,
    groups: new Map(),
    takenCategoryNames: [],
    categorySuffix: '2025W',
    visibility: 'hidden',
    newId: () => `new-${(id += 1)}`,
    newKey: (filename) => `institutions/inst/materials/copy-${(key += 1)}/${filename}`,
    ...extra,
  });
};

describe('planImport', () => {
  it('copies sections in order, into the target, hidden, with their windows shifted', () => {
    const result = plan({
      sections: [
        section('b', 5, { availableFrom: at(10), availableUntil: at(20), summary: 'Second' }),
        section('a', 2, { visible: false, hiddenUntilAvailable: true }),
      ],
    });

    expect(result.rows.sections).toEqual([
      expect.objectContaining({
        title: 'Section a',
        position: 0,
        visible: false,
        learningSpaceId: 'target',
        hiddenUntilAvailable: true,
      }),
      expect.objectContaining({
        title: 'Section b',
        position: 1,
        visible: false,
        summary: 'Second',
        availableFrom: new Date(at(10).getTime() + SHIFT.milliseconds),
        availableUntil: new Date(at(20).getTime() + SHIFT.milliseconds),
      }),
    ]);
    expect(result.report.shiftedDates).toBe(2);
    expect(result.report.counts.sections).toBe(2);
  });

  it('keeps each section’s and item’s own visibility when asked to', () => {
    const result = plan(
      {
        sections: [section('a', 0), section('b', 1, { visible: false })],
        materials: [material('m', { visible: false }), material('n')],
      },
      { visibility: 'source' },
    );

    expect(result.rows.sections.map((row) => row.visible)).toEqual([true, false]);
    expect(result.rows.materials.map((row) => row.visible)).toEqual([false, true]);
  });

  it('hides what lands in the general area but keeps an item’s own setting inside a hidden section', () => {
    const result = plan({
      sections: [section('s', 0)],
      materials: [
        material('general'),
        material('inside', { sectionId: 's', position: 3 }),
        material('inside-hidden', { sectionId: 's', position: 4, visible: false }),
      ],
    });

    const byTitle = new Map(result.rows.materials.map((row) => [row.title, row]));
    expect(byTitle.get('Material general')).toMatchObject({ visible: false, sectionId: null });
    expect(byTitle.get('Material inside')).toMatchObject({
      visible: true,
      sectionId: 'new-1',
      position: 3,
    });
    expect(byTitle.get('Material inside-hidden')).toMatchObject({ visible: false });
  });

  it('orders the general area across materials and activities, from zero', () => {
    const result = plan({
      materials: [material('m1', { position: 4 }), material('m2', { position: 1 })],
      activities: [{ activity: activity('a1', { position: 2 }), assessment: assessment('a1') }],
    });

    expect(result.rows.materials.map((row) => [row.title, row.position])).toEqual([
      ['Material m1', 2],
      ['Material m2', 0],
    ]);
    expect(result.rows.activities[0]).toMatchObject({ position: 1, sectionId: null });
  });

  it('copies a file into a new key and a folder’s clean files, and flags the rest', () => {
    const result = plan({
      materials: [
        material('file', {
          kind: 'file',
          storageKey: 'institutions/inst/materials/x/slides.pdf',
          filename: 'slides.pdf',
          scanStatus: 'clean',
        }),
        material('pending', {
          kind: 'file',
          storageKey: 'institutions/inst/materials/y/a.pdf',
          filename: 'a.pdf',
          scanStatus: 'pending',
        }),
        material('bad', {
          kind: 'file',
          storageKey: null,
          filename: 'b.pdf',
          scanStatus: 'infected',
        }),
        material('folder', { kind: 'folder', body: null }),
      ],
      folderFiles: [
        folderFile('ok', 'folder'),
        folderFile('unscanned', 'folder', { scanStatus: 'unscanned' }),
        folderFile('virus', 'folder', { scanStatus: 'infected' }),
      ],
    });

    expect(result.rows.materials.map((row) => row.title)).toEqual([
      'Material file',
      'Material folder',
    ]);
    expect(result.rows.materials[0]).toMatchObject({
      storageKey: 'institutions/inst/materials/copy-1/slides.pdf',
      scanStatus: 'clean',
      createdById: 'importer',
    });
    expect(result.copies).toEqual([
      {
        from: 'institutions/inst/materials/x/slides.pdf',
        to: 'institutions/inst/materials/copy-1/slides.pdf',
      },
      {
        from: 'institutions/inst/materials/ok/f.pdf',
        to: 'institutions/inst/materials/copy-2/ok.pdf',
      },
      {
        from: 'institutions/inst/materials/unscanned/f.pdf',
        to: 'institutions/inst/materials/copy-3/unscanned.pdf',
      },
    ]);
    expect(result.rows.folderFiles.map((row) => row.learningMaterialId)).toEqual([
      'new-2',
      'new-2',
    ]);
    expect(result.report.flags).toEqual([
      { code: 'file_not_scanned', title: 'Material pending' },
      { code: 'file_missing', title: 'Material bad' },
      { code: 'file_infected', title: 'virus.pdf' },
    ]);
    expect(result.report.counts).toMatchObject({ materials: 2, files: 3 });
  });

  it('copies assignments with their settings and a new gradebook column, dates shifted, never announced', () => {
    const result = plan({
      activities: [
        {
          activity: activity('a', {
            opensAt: at(1),
            dueAt: at(8),
            closesAt: at(10),
            maxAttempts: 3,
            allowsLateSubmission: true,
            completionRule: 'passed',
            completionPassPoints: '12.0000',
          }),
          assessment: assessment('a', {
            maxPoints: '30.0000',
            weight: '0.4000',
            countsTowardFinalGrade: false,
          }),
        },
      ],
    });

    expect(result.rows.activities[0]).toMatchObject({
      id: 'new-1',
      type: 'assignment',
      opensAt: new Date(at(1).getTime() + SHIFT.milliseconds),
      dueAt: new Date(at(8).getTime() + SHIFT.milliseconds),
      closesAt: new Date(at(10).getTime() + SHIFT.milliseconds),
      maxAttempts: 3,
      allowsLateSubmission: true,
      announcedAt: null,
      completionRule: 'passed',
      completionPassPoints: '12.0000',
    });
    expect(result.rows.assessments).toEqual([
      {
        institutionId: 'inst',
        learningSpaceId: 'target',
        learningActivityId: 'new-1',
        name: 'Activity a',
        maxPoints: '30.0000',
        weight: '0.4000',
        countsTowardFinalGrade: false,
      },
    ]);
    expect(result.report.shiftedDates).toBe(3);
    expect(result.report.counts.assignments).toBe(1);
  });

  it('copies the bank as version 1 of new questions and points quiz slots at the copies', () => {
    const result = plan(
      {
        activities: [
          { activity: activity('quiz', { type: 'quiz' }), assessment: assessment('quiz') },
        ],
        quizzes: [quizSettings('quiz')],
        categories: [category('c1', 'Sorting'), category('c2', 'Graphs')],
        questions: [question('q1', 'c1'), question('q2', 'c2', 1)],
        slots: [
          slot('s1', 'quiz', { questionId: 'q1', mark: '3.0000' }),
          slot('s2', 'quiz', { kind: 'random', categoryId: 'c2', pickCount: 2, position: 1 }),
          slot('s3', 'quiz', { questionId: 'gone', position: 2 }),
        ],
      },
      { takenCategoryNames: ['sorting'] },
    );

    expect(result.rows.quizzes).toEqual([
      expect.objectContaining({
        learningActivityId: 'new-1',
        timeLimitSeconds: 600,
        gradingMethod: 'average',
        layout: 'all_on_one',
        reviewCorrectAnswer: 'never',
      }),
    ]);
    expect(result.rows.categories.map((row) => row.name)).toEqual([
      'Sorting (2025W)',
      'Graphs',
    ]);
    const [c1, c2] = result.rows.categories.map((row) => row.id);
    expect(result.rows.questions).toEqual([
      expect.objectContaining({
        categoryId: c1,
        latestVersion: 1,
        type: 'true_false',
        createdById: 'importer',
      }),
      expect.objectContaining({ categoryId: c2, latestVersion: 1 }),
    ]);
    expect(result.rows.questionVersions[0]).toMatchObject({
      questionId: result.rows.questions[0]!.id,
      version: 1,
      name: 'Question q1',
      defaultMark: '2.0000',
      answerKey: { correct: true, trueFeedback: null, falseFeedback: null },
    });
    expect(result.rows.slots).toEqual([
      expect.objectContaining({
        learningActivityId: 'new-1',
        kind: 'question',
        questionId: result.rows.questions[0]!.id,
        categoryId: null,
        mark: '3.0000',
      }),
      expect.objectContaining({
        kind: 'random',
        questionId: null,
        categoryId: c2,
        pickCount: 2,
      }),
    ]);
    expect(result.report.flags).toEqual([
      { code: 'category_renamed', title: 'Sorting (2025W)' },
      { code: 'slot_dropped', title: 'Activity quiz' },
    ]);
    expect(result.report.counts).toMatchObject({
      quizzes: 1,
      assignments: 0,
      quizSlots: 2,
      questionCategories: 2,
      questions: 2,
    });
  });

  it('remaps restrictions to the copies and hides an item that lost its groups', () => {
    const result = plan(
      {
        sections: [
          section('s', 0, {
            restriction: {
              match: 'all',
              hideWhenLocked: false,
              conditions: [{ type: 'completed', itemKind: 'assignment', itemId: 'a' }],
            },
          }),
        ],
        materials: [
          material('only-s9', {
            sectionId: 's',
            restriction: {
              match: 'all',
              hideWhenLocked: false,
              conditions: [],
              audience: { groupIds: ['old-s9'], hideFromOthers: true },
            },
          }),
          material('only-s1', {
            sectionId: 's',
            restriction: {
              match: 'all',
              hideWhenLocked: false,
              conditions: [{ type: 'date', from: '2025-10-01T00:00:00.000Z' }],
              audience: { groupIds: ['old-s1'], hideFromOthers: true },
            },
          }),
        ],
        activities: [{ activity: activity('a'), assessment: assessment('a') }],
      },
      { groups: new Map([['old-s1', 'new-s1']]), visibility: 'source' },
    );

    const assignmentId = result.rows.activities[0]!.id;
    expect(result.rows.sections[0]!.restriction).toEqual({
      match: 'all',
      hideWhenLocked: false,
      conditions: [{ type: 'completed', itemKind: 'assignment', itemId: assignmentId }],
    });
    const [lost, kept] = result.rows.materials;
    expect(lost).toMatchObject({ restriction: null, visible: false });
    expect(kept).toMatchObject({
      visible: true,
      restriction: {
        conditions: [
          {
            type: 'date',
            from: new Date(
              Date.parse('2025-10-01T00:00:00.000Z') + SHIFT.milliseconds,
            ).toISOString(),
          },
        ],
        audience: { groupIds: ['new-s1'], hideFromOthers: true },
      },
    });
    expect(result.report.flags).toEqual([{ code: 'group_dropped', title: 'Material only-s9' }]);
    expect(result.report.remappedReferences).toBe(2);
  });

  it('flags a condition on something that was not copied and keeps it failing closed', () => {
    const result = plan({
      materials: [
        material('pending', {
          kind: 'file',
          storageKey: 'institutions/inst/materials/p/a.pdf',
          scanStatus: 'pending',
        }),
        material('after', {
          restriction: {
            match: 'all',
            hideWhenLocked: false,
            conditions: [{ type: 'completed', itemKind: 'material', itemId: 'pending' }],
          },
        }),
      ],
    });

    expect(result.rows.materials[0]!.restriction?.conditions).toEqual([
      { type: 'completed', itemKind: 'material', itemId: 'pending' },
    ]);
    expect(result.report.flags).toContainEqual({
      code: 'reference_missing',
      title: 'Material after',
    });
  });

  it('moves no date when there is no shift to apply', () => {
    const none = dateShiftBetween(null, new Date());
    const result = plan(
      {
        activities: [
          { activity: activity('a', { dueAt: at(5) }), assessment: assessment('a') },
        ],
      },
      { shift: none },
    );

    expect(result.rows.activities[0]!.dueAt).toEqual(at(5));
    expect(result.report.shift.applied).toBe(false);
  });

  it('plans nothing from an empty course page', () => {
    const result = plan({});

    expect(result.copies).toEqual([]);
    expect(Object.values(result.report.counts).every((count) => count === 0)).toBe(true);
  });
});

import { addDays } from './calendar';
import type { PlannedEnrollment, PlannedOffering } from './derive';
import { createRandom } from './deterministic-random';
import type { DemoSeedOptions } from './options';

export interface PlannedSpace {
  readonly key: string;
  readonly offering: PlannedOffering;
  readonly name: string;
  readonly summary: string;
}

export interface PlannedSection {
  readonly key: string;
  readonly spaceKey: string;
  readonly title: string;
  readonly summary: string;
  readonly position: number;
  readonly availableFrom: Date | null;
}

export interface PlannedMaterial {
  readonly key: string;
  readonly spaceKey: string;
  readonly sectionKey: string | null;
  readonly kind: 'link' | 'text' | 'page' | 'label' | 'video' | 'folder';
  readonly title: string;
  readonly body: string | null;
  readonly url: string | null;
  readonly position: number;
  readonly availableFrom: Date | null;
  readonly completionRule: 'none' | 'manual' | 'viewed';
}

export interface PlannedFolderFile {
  readonly materialKey: string;
  readonly spaceKey: string;
  readonly filename: string;
  readonly body: string;
}

export interface PlannedAssignment {
  readonly key: string;
  readonly spaceKey: string;
  readonly sectionKey: string;
  readonly position: number;
  readonly offering: PlannedOffering;
  readonly name: string;
  readonly brief: string;
  readonly opensAt: Date;
  readonly dueAt: Date;
  readonly closesAt: Date;
  readonly maxAttempts: number;
  readonly allowsLateSubmission: boolean;
  readonly maxPoints: number;
  readonly completionRule: 'passed' | 'submitted';
  readonly completionPassPoints: number | null;
}

export interface PlannedRestriction {
  readonly target: { readonly kind: 'section' | 'material'; readonly key: string };
  readonly condition:
    | { readonly type: 'completed'; readonly assignmentKey: string }
    | { readonly type: 'mark'; readonly assignmentKey: string; readonly atLeast: number };
}

export interface PlannedGroupAudience {
  readonly materialKey: string;
  readonly groupKey: string;
  readonly hideFromOthers: boolean;
}

export interface PlannedSubmission {
  readonly assignmentKey: string;
  readonly studentKey: string;
  readonly state: 'draft' | 'submitted' | 'graded';
  readonly submittedAt: Date | null;
  readonly isLate: boolean;
  readonly notes: string | null;
  readonly points: number | null;
  readonly feedback: string | null;
}

const MATERIALS_PER_SPACE = 3;
const ASSIGNMENTS_PER_SPACE = 2;

/**
 * Only the current academic year gets a learning space. A past year's
 * materials are rows nobody opens, and the point of the demo is that the
 * screens have something on them now.
 */
export function planSpaces(offerings: readonly PlannedOffering[]): PlannedSpace[] {
  return offerings
    .filter((offering) => offering.term.yearOffset === 0)
    .map((offering) => ({
      key: `SPACE-${offering.key}`,
      offering,
      name: `${offering.course.title} (${offering.term.code})`,
      summary: `Everything for ${offering.course.title} this term: slides, reading and the assignments.`,
    }));
}

const SECTIONS = [
  {
    title: 'Weeks 1–4 — foundations',
    summary: 'The first block of lectures and the first assignment.',
    opensAfterDays: null,
  },
  {
    title: 'Weeks 5–8 — going further',
    summary: 'The second block, ending with the report.',
    opensAfterDays: null,
  },
  {
    title: 'Weeks 9–12 — revision',
    summary: 'Past papers and a revision plan, opened once the second block is done.',
    opensAfterDays: 56,
  },
] as const;

const REPORT_TEMPLATE_OPENS_AFTER_DAYS = 42;

const opensAfter = (space: PlannedSpace, days: number | null) =>
  days === null ? null : addDays(space.offering.term.startsAt, days);

const sectionKey = (space: PlannedSpace, index: number) => `SEC-${space.key}-${index + 1}`;

export function planSections(spaces: readonly PlannedSpace[]): PlannedSection[] {
  return spaces.flatMap((space) =>
    SECTIONS.map((section, index) => ({
      key: sectionKey(space, index),
      spaceKey: space.key,
      title: section.title,
      summary: section.summary,
      position: index,
      availableFrom: opensAfter(space, section.opensAfterDays),
    })),
  );
}

export const ASSIGNMENT_PASS_POINTS = 80;

const materialKey = (space: PlannedSpace, slug: string) => `MAT-${space.key}-${slug}`;

export function planMaterials(spaces: readonly PlannedSpace[]): PlannedMaterial[] {
  return spaces.flatMap((space) => [
    ...Array.from({ length: MATERIALS_PER_SPACE }, (_, index) =>
      index === 0
        ? {
            key: materialKey(space, 'rules'),
            spaceKey: space.key,
            sectionKey: null,
            kind: 'text' as const,
            title: 'How this course runs',
            body: `Lectures are weekly. Two assignments carry the coursework mark, and the exam is at the end of term. Ask in the seminar if anything here is unclear.`,
            url: null,
            position: 0,
            availableFrom: null,
            completionRule: 'manual' as const,
          }
        : {
            key: materialKey(space, index === 1 ? 'slides' : 'reading'),
            spaceKey: space.key,
            sectionKey: sectionKey(space, 0),
            kind: 'link' as const,
            title: index === 1 ? 'Lecture slides' : 'Recommended reading',
            body: null,
            url: `https://example.edu/${space.offering.course.code.toLowerCase().replaceAll('/', '-')}/${index}`,
            position: index - 1,
            availableFrom: null,
            completionRule: 'viewed' as const,
          },
    ),
    {
      key: materialKey(space, 'extension'),
      spaceKey: space.key,
      sectionKey: sectionKey(space, 0),
      kind: 'text' as const,
      title: 'Extension exercises',
      body: 'Harder versions of the Assignment 1 exercises, for anyone who found it easy. Bring your answers to the seminar.',
      url: null,
      position: MATERIALS_PER_SPACE,
      availableFrom: null,
      completionRule: 'none' as const,
    },
    ...SEMINAR_GROUPS.map((group) => ({
      key: materialKey(space, `worksheet-${group.number}`),
      spaceKey: space.key,
      sectionKey: sectionKey(space, 0),
      kind: 'text' as const,
      title: `Seminar S${group.number} worksheet`,
      body: `Exercises for seminar group S${group.number} this week. Work through them before you come; we go over them together.`,
      url: null,
      position: MATERIALS_PER_SPACE + group.number,
      availableFrom: null,
      completionRule: 'none' as const,
    })),
    ...newKindsFor(space),
    {
      key: materialKey(space, 'template'),
      spaceKey: space.key,
      sectionKey: sectionKey(space, 1),
      kind: 'text' as const,
      title: 'Report template',
      body: 'Use these headings: question, method, findings, what you would do next. Four pages at most.',
      url: null,
      position: 1,
      availableFrom: opensAfter(space, REPORT_TEMPLATE_OPENS_AFTER_DAYS),
      completionRule: 'none' as const,
    },
    {
      key: materialKey(space, 'past-papers'),
      spaceKey: space.key,
      sectionKey: sectionKey(space, 2),
      kind: 'link' as const,
      title: 'Past exam papers',
      body: null,
      url: `https://example.edu/${space.offering.course.code.toLowerCase().replaceAll('/', '-')}/past-papers`,
      position: 0,
      availableFrom: null,
      completionRule: 'viewed' as const,
    },
  ]);
}

const STUDY_GUIDE = `## How to use this course

Each week has **one lecture**, a seminar and some reading. Work in this order:

1. Watch or attend the lecture.
2. Read the chapter it names.
3. Try the seminar worksheet *before* the seminar.

### What to bring

- Your worksheet answers, even the wrong ones
- Questions about the lecture

Write pseudocode the way the lectures do, for example \`for i in 1..n\`.

> Stuck for more than an hour? Ask in the course discussion.

The [course handbook](https://example.edu/handbook) has the rules on deadlines.`;

const LECTURE_ONE = 'https://www.youtube-nocookie.com/embed/ZA-tUyM_y7s';
const SEMINAR_NOTE =
  'Before the seminar: watch the first lecture and bring the handouts below.';

function newKindsFor(space: PlannedSpace): PlannedMaterial[] {
  const common = { spaceKey: space.key, availableFrom: null, body: null, url: null };
  const firstSection = sectionKey(space, 0);

  return [
    {
      ...common,
      key: materialKey(space, 'guide'),
      sectionKey: null,
      kind: 'page',
      title: 'Study guide',
      body: STUDY_GUIDE,
      position: 1,
      completionRule: 'viewed',
    },
    {
      ...common,
      key: materialKey(space, 'seminar-note'),
      sectionKey: firstSection,
      kind: 'label',
      title: SEMINAR_NOTE,
      body: SEMINAR_NOTE,
      position: MATERIALS_PER_SPACE + SEMINAR_GROUPS.length + 1,
      completionRule: 'none',
    },
    {
      ...common,
      key: materialKey(space, 'recording'),
      sectionKey: firstSection,
      kind: 'video',
      title: 'Lecture 1 recording',
      url: LECTURE_ONE,
      position: MATERIALS_PER_SPACE + SEMINAR_GROUPS.length + 2,
      completionRule: 'none',
    },
    {
      ...common,
      key: materialKey(space, 'handouts'),
      sectionKey: firstSection,
      kind: 'folder',
      title: 'Week 1 handouts',
      position: MATERIALS_PER_SPACE + SEMINAR_GROUPS.length + 3,
      completionRule: 'viewed',
    },
  ];
}

export function planFolderFiles(spaces: readonly PlannedSpace[]): PlannedFolderFile[] {
  return spaces.flatMap((space) => [
    {
      materialKey: materialKey(space, 'handouts'),
      spaceKey: space.key,
      filename: 'exercise-sheet.txt',
      body: `Exercise sheet, week 1 — ${space.offering.course.title}\n\n1. Sort 5 3 8 1 by hand.\n2. Count the comparisons.\n`,
    },
    {
      materialKey: materialKey(space, 'handouts'),
      spaceKey: space.key,
      filename: 'week-1-notes.txt',
      body: `Notes, week 1 — ${space.offering.course.title}\n\nWhat an algorithm is, and how we measure one.\n`,
    },
  ]);
}

export const EXTENSION_MARK = 90;

const SEMINAR_GROUPS = [
  { number: 1, hideFromOthers: true },
  { number: 2, hideFromOthers: false },
] as const;

export function planGroupAudiences(spaces: readonly PlannedSpace[]): PlannedGroupAudience[] {
  return spaces.flatMap((space) =>
    SEMINAR_GROUPS.map((group) => ({
      materialKey: materialKey(space, `worksheet-${group.number}`),
      groupKey: `GRP-${space.offering.key}-${group.number}`,
      hideFromOthers: group.hideFromOthers,
    })),
  );
}

/**
 * Step by step: the second block opens once Assignment 1 is complete (passed),
 * and the extension exercises once it is marked at 90 or more.
 */
export function planRestrictions(spaces: readonly PlannedSpace[]): PlannedRestriction[] {
  return spaces.flatMap((space) => {
    const firstAssignment = `ASG-${space.key}-1`;

    return [
      {
        target: { kind: 'section' as const, key: sectionKey(space, 1) },
        condition: { type: 'completed' as const, assignmentKey: firstAssignment },
      },
      {
        target: { kind: 'material' as const, key: materialKey(space, 'extension') },
        condition: {
          type: 'mark' as const,
          assignmentKey: firstAssignment,
          atLeast: EXTENSION_MARK,
        },
      },
    ];
  });
}

/**
 * Two assignments per space, positioned so that one is always already due and
 * one is still open. A demo where every deadline has passed shows none of the
 * states that matter.
 */
export function planAssignments(spaces: readonly PlannedSpace[]): PlannedAssignment[] {
  return spaces.flatMap((space) => {
    const termStart = space.offering.term.startsAt;

    return Array.from({ length: ASSIGNMENTS_PER_SPACE }, (_, index) => {
      // The first assignment must already be due at the anchor and the second
      // must not: a demo where every deadline has passed shows no open
      // assignment, and one where none has shows no submissions or marks.
      const opensAt = addDays(termStart, index * 28);
      const dueAt = addDays(opensAt, 14);

      return {
        key: `ASG-${space.key}-${index + 1}`,
        spaceKey: space.key,
        sectionKey: sectionKey(space, index),
        position: index === 0 ? MATERIALS_PER_SPACE - 1 : 0,
        offering: space.offering,
        name: `Assignment ${index + 1}`,
        brief:
          index === 0
            ? 'Work through the exercises from the first three lectures and hand in your solutions as a single PDF.'
            : 'A short report on the topic you chose in the seminar. Four pages, PDF.',
        opensAt,
        dueAt,
        closesAt: addDays(dueAt, 7),
        maxAttempts: 2,
        allowsLateSubmission: index === 0,
        maxPoints: 100,
        completionRule: index === 0 ? ('passed' as const) : ('submitted' as const),
        completionPassPoints: index === 0 ? ASSIGNMENT_PASS_POINTS : null,
      };
    });
  });
}

/**
 * Roughly two thirds of a cohort hands the first assignment in, and most of
 * those are marked. The rest are the states a marking screen has to cope
 * with: nothing handed in, a draft, and one that arrived late.
 */
export function planSubmissions(
  assignments: readonly PlannedAssignment[],
  enrollments: readonly PlannedEnrollment[],
  options: DemoSeedOptions,
): PlannedSubmission[] {
  const random = createRandom(options.seed + 4_211);
  const byOffering = new Map<string, PlannedEnrollment[]>();

  for (const enrollment of enrollments) {
    const bucket = byOffering.get(enrollment.offering.key);
    if (bucket) bucket.push(enrollment);
    else byOffering.set(enrollment.offering.key, [enrollment]);
  }

  return assignments.flatMap((assignment) => {
    const cohort = byOffering.get(assignment.offering.key) ?? [];
    if (assignment.dueAt > options.anchor) return [];

    return cohort.flatMap((enrollment, index) => {
      // Every third student has handed in nothing at all.
      if (index % 3 === 2) return [];

      const late = index % 7 === 0;
      const submittedAt = addDays(assignment.dueAt, late ? 2 : -(index % 5) - 1);
      const draft = index % 5 === 3;

      return [
        {
          assignmentKey: assignment.key,
          studentKey: enrollment.student.person.key,
          state: draft ? ('draft' as const) : ('graded' as const),
          submittedAt: draft ? null : submittedAt,
          isLate: draft ? false : late,
          notes: draft ? 'Still working on the last exercise.' : null,
          points: draft ? null : 55 + random.int(0, 45),
          feedback: draft
            ? null
            : late
              ? 'Good work, but it arrived after the deadline.'
              : 'Clear and complete. Watch the formatting of your references.',
        },
      ];
    });
  });
}

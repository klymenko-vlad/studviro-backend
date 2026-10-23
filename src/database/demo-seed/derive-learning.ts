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
  readonly kind: 'link' | 'text';
  readonly title: string;
  readonly body: string | null;
  readonly url: string | null;
  readonly position: number;
  readonly availableFrom: Date | null;
  readonly completionRule: 'none' | 'manual' | 'viewed';
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

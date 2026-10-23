import { describe, expect, it } from 'vitest';

import { buildPlan } from './build-plan';
import {
  planEnrollments,
  planExamTerms,
  planOfferings,
  planResults,
  planStudyGroups,
  planTimetableEvents,
} from './derive';
import { planCompletions } from './derive-completion';
import {
  ASSIGNMENT_PASS_POINTS,
  EXTENSION_MARK,
  planAssignments,
  planMaterials,
  planRestrictions,
  planSections,
  planSpaces,
  planSubmissions,
} from './derive-learning';
import { DEFAULT_DEMO_SEED_OPTIONS } from './options';
import { allCourses, allPersons, allPrograms, allRooms } from './plan';

const options = DEFAULT_DEMO_SEED_OPTIONS;

describe('the demo university plan', () => {
  it('is deterministic — two builds are the same university', () => {
    expect(JSON.stringify(buildPlan(options))).toBe(JSON.stringify(buildPlan(options)));
  });

  it('differs when the seed does', () => {
    const other = buildPlan({ ...options, seed: options.seed + 1 });

    expect(JSON.stringify(other)).not.toBe(JSON.stringify(buildPlan(options)));
  });

  it('builds the structure the options ask for', () => {
    const plan = buildPlan(options);

    expect(plan.faculties).toHaveLength(options.faculties);
    expect(allPrograms(plan)).toHaveLength(options.faculties * options.programsPerFaculty);
    expect(allRooms(plan)).toHaveLength(options.faculties * options.roomsPerFaculty);
    expect(plan.terms).toHaveLength(options.academicYears * 2);
  });

  it('gives every person a unique email and every course a unique code', () => {
    const plan = buildPlan(options);
    const emails = allPersons(plan).map((person) => person.email);
    const codes = allCourses(plan).map((course) => course.code);

    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has exactly one current academic year, and the rest in the past', () => {
    const plan = buildPlan(options);
    const current = plan.terms.filter((term) => term.yearOffset === 0);

    expect(current).toHaveLength(2);
    expect(current.every((term) => !term.isPast)).toBe(true);
  });
});

describe('what the plan derives', () => {
  const plan = buildPlan(options);
  const offerings = planOfferings(plan, options.anchor);
  const enrollments = planEnrollments(offerings, options.anchor);

  it('offers every course once per matching term', () => {
    expect(offerings).toHaveLength(allCourses(plan).length * options.academicYears);
    expect(new Set(offerings.map((offering) => offering.key)).size).toBe(offerings.length);
  });

  it('enrols a student in the courses of the study year they were in that academic year', () => {
    expect(
      enrollments.every(
        (enrollment) =>
          enrollment.student.studyYear + enrollment.offering.term.yearOffset ===
          enrollment.offering.course.studyYear,
      ),
    ).toBe(true);
  });

  it('gives a first-year student no history from before they started', () => {
    expect(
      enrollments.some(
        (enrollment) => enrollment.student.studyYear === 1 && enrollment.offering.term.isPast,
      ),
    ).toBe(false);
  });

  it('never has a student take the same course in two academic years', () => {
    const taken = enrollments.map(
      (enrollment) => `${enrollment.student.person.key}:${enrollment.offering.course.key}`,
    );

    expect(new Set(taken).size).toBe(taken.length);
  });

  it('never enrols the same student in the same offering twice', () => {
    expect(new Set(enrollments.map((enrollment) => enrollment.key)).size).toBe(
      enrollments.length,
    );
  });

  it('splits every offering into study groups that partition its enrolment', () => {
    const groups = planStudyGroups(enrollments);
    const members = groups.flatMap((group) => group.memberKeys);

    expect(members).toHaveLength(enrollments.length);
    expect(new Set(groups.map((group) => group.key)).size).toBe(groups.length);
  });

  it('timetables only the current academic year, inside its term', () => {
    const events = planTimetableEvents(offerings, options);

    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every(
        (event) =>
          event.offering.term.yearOffset === 0 &&
          event.startsAt >= event.offering.term.startsAt &&
          event.startsAt < event.endsAt,
      ),
    ).toBe(true);
  });

  it('opens every exam registration window before the exam, and closes it before too', () => {
    const exams = planExamTerms(offerings, options);

    expect(
      exams.every(
        (exam) =>
          exam.registrationOpensAt < exam.registrationClosesAt &&
          exam.registrationClosesAt < exam.startsAt,
      ),
    ).toBe(true);
  });

  it('records a result only for a finished term', () => {
    const results = planResults(enrollments, options);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.enrollment.offering.term.isPast)).toBe(true);
    expect(results.length).toBe(
      enrollments.filter((enrollment) => enrollment.offering.term.isPast).length,
    );
  });
});

describe('the learning half it seeds', () => {
  const plan = buildPlan(options);
  const offerings = planOfferings(plan, options.anchor);
  const enrollments = planEnrollments(offerings, options.anchor);
  const spaces = planSpaces(offerings);
  const assignments = planAssignments(spaces);

  it('gives only the current year a learning space', () => {
    expect(spaces.length).toBeGreaterThan(0);
    expect(spaces.every((space) => space.offering.term.yearOffset === 0)).toBe(true);
  });

  it('gives every space materials and two assignments', () => {
    expect(planMaterials(spaces)).toHaveLength(spaces.length * 6);
    expect(assignments).toHaveLength(spaces.length * 2);
  });

  it('lays every space out in three sections, with the course rules above them', () => {
    const sections = planSections(spaces);
    const space = spaces[0]!;
    const [first, second, third] = sections.filter((section) => section.spaceKey === space.key);
    const outline = [
      ...planMaterials(spaces),
      ...assignments.map((a) => ({ title: a.name, ...a })),
    ]
      .filter((item) => item.spaceKey === space.key)
      .sort((a, b) => a.position - b.position);

    expect(sections).toHaveLength(spaces.length * 3);
    expect(outline.filter((item) => item.sectionKey === null).map((i) => i.title)).toEqual([
      'How this course runs',
    ]);
    expect(
      outline.filter((item) => item.sectionKey === first!.key).map((i) => i.title),
    ).toEqual(['Lecture slides', 'Recommended reading', 'Assignment 1', 'Extension exercises']);
    expect(
      outline.filter((item) => item.sectionKey === second!.key).map((i) => i.title),
    ).toEqual(['Assignment 2', 'Report template']);
    expect(
      outline.filter((item) => item.sectionKey === third!.key).map((i) => i.title),
    ).toEqual(['Past exam papers']);
  });

  it('locks the second block behind Assignment 1 and the extension behind a high mark', () => {
    const space = spaces[0]!;
    const [, second] = planSections(spaces).filter((section) => section.spaceKey === space.key);
    const extension = planMaterials(spaces).find(
      (material) => material.spaceKey === space.key && material.title === 'Extension exercises',
    );
    const firstAssignment = assignments.find(
      (assignment) => assignment.spaceKey === space.key && assignment.name === 'Assignment 1',
    );
    const restrictions = planRestrictions(spaces).filter((planned) =>
      [second!.key, extension!.key].includes(planned.target.key),
    );

    expect(planRestrictions(spaces)).toHaveLength(spaces.length * 2);
    expect(restrictions).toEqual([
      {
        target: { kind: 'section', key: second!.key },
        condition: { type: 'completed', assignmentKey: firstAssignment!.key },
      },
      {
        target: { kind: 'material', key: extension!.key },
        condition: {
          type: 'mark',
          assignmentKey: firstAssignment!.key,
          atLeast: EXTENSION_MARK,
        },
      },
    ]);
    expect(EXTENSION_MARK).toBeLessThanOrEqual(firstAssignment!.maxPoints);
  });

  it('schedules a section and an item to open after the anchor, so both states show', () => {
    const space = spaces[0]!;
    const third = planSections(spaces).filter((section) => section.spaceKey === space.key)[2]!;
    const template = planMaterials(spaces).find(
      (material) => material.spaceKey === space.key && material.title === 'Report template',
    )!;

    expect(third.availableFrom!.getTime()).toBeGreaterThan(options.anchor.getTime());
    expect(template.availableFrom!.getTime()).toBeGreaterThan(options.anchor.getTime());
    expect(template.availableFrom!.getTime()).toBeLessThan(third.availableFrom!.getTime());
  });

  it('closes an assignment before the anchor and leaves one open, or the demo shows one state', () => {
    const due = assignments.filter((a) => a.dueAt <= options.anchor);
    const open = assignments.filter((a) => a.dueAt > options.anchor);

    expect(due.length).toBeGreaterThan(0);
    expect(open.length).toBeGreaterThan(0);
  });

  it('never opens an assignment after it is due, or closes it before', () => {
    expect(assignments.every((a) => a.opensAt < a.dueAt && a.dueAt < a.closesAt)).toBe(true);
  });

  it('hands in only against assignments that are actually due', () => {
    const submissions = planSubmissions(assignments, enrollments, options);
    const dueKeys = new Set(
      assignments.filter((a) => a.dueAt <= options.anchor).map((a) => a.key),
    );

    expect(submissions.length).toBeGreaterThan(0);
    expect(submissions.every((s) => dueKeys.has(s.assignmentKey))).toBe(true);
  });

  it('leaves a marking screen every state it has to cope with', () => {
    const submissions = planSubmissions(assignments, enrollments, options);
    const states = new Set(submissions.map((s) => s.state));

    expect(states).toContain('graded');
    expect(states).toContain('draft');
    expect(submissions.some((s) => s.isLate)).toBe(true);
    // And somebody who handed in nothing at all.
    expect(submissions.length).toBeLessThan(enrollments.length * 2);
  });

  it('marks only what was handed in, and never a draft', () => {
    const submissions = planSubmissions(assignments, enrollments, options);

    expect(
      submissions.every((s) => (s.state === 'draft' ? s.points === null : s.points !== null)),
    ).toBe(true);
  });

  it('is deterministic', () => {
    const once = planSubmissions(assignments, enrollments, options);
    const twice = planSubmissions(assignments, enrollments, options);

    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });

  describe('completion', () => {
    const materials = planMaterials(spaces);
    const submissions = planSubmissions(assignments, enrollments, options);
    const completions = planCompletions(
      spaces,
      materials,
      assignments,
      submissions,
      enrollments,
      options,
    );

    it('tracks most items, each in a way that suits it', () => {
      const rules = new Set(materials.map((m) => m.completionRule));
      expect(rules).toEqual(new Set(['none', 'manual', 'viewed']));
      expect(new Set(assignments.map((a) => a.completionRule))).toEqual(
        new Set(['passed', 'submitted']),
      );
      expect(
        assignments
          .filter((a) => a.completionRule === 'passed')
          .every((a) => a.completionPassPoints === ASSIGNMENT_PASS_POINTS),
      ).toBe(true);
    });

    it('gives the teacher’s table some of everything: ticked, opened, passed and failed', () => {
      const states = new Set(completions.map((c) => c.state));

      expect(states).toEqual(new Set(['complete', 'complete_pass', 'complete_fail']));
      expect(completions.some((c) => c.markedDoneAt !== null)).toBe(true);
      expect(completions.some((c) => c.viewedAt !== null)).toBe(true);
    });

    it('completes nothing that has not opened yet, or that is not tracked', () => {
      const untracked = new Set(
        materials
          .filter((m) => m.completionRule === 'none' || m.availableFrom !== null)
          .map((m) => m.key),
      );
      const pastPapers = new Set(
        materials.filter((m) => m.title === 'Past exam papers').map((m) => m.key),
      );

      expect(
        completions.some(
          (c) =>
            c.target.kind === 'material' &&
            (untracked.has(c.target.key) || pastPapers.has(c.target.key)),
        ),
      ).toBe(false);
    });

    it('passes exactly the marks at or above the pass mark', () => {
      const marked = submissions.filter((s) => s.points !== null);
      const graded = completions.filter((c) => c.target.kind === 'assignment');

      expect(graded).toHaveLength(marked.length);
      for (const completion of graded) {
        const source = marked.find(
          (s) =>
            completion.target.kind === 'assignment' &&
            s.assignmentKey === completion.target.key &&
            s.studentKey === completion.studentKey,
        )!;
        expect(completion.state).toBe(
          source.points! >= ASSIGNMENT_PASS_POINTS ? 'complete_pass' : 'complete_fail',
        );
      }
    });

    it('dates every completion before the anchor', () => {
      expect(completions.every((c) => c.completedAt! <= options.anchor)).toBe(true);
    });
  });
});

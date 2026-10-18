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
import { planAssignments, planMaterials, planSpaces, planSubmissions } from './derive-learning';
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
    expect(planMaterials(spaces)).toHaveLength(spaces.length * 3);
    expect(assignments).toHaveLength(spaces.length * 2);
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
});

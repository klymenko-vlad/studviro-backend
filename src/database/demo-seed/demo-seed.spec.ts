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

  it('only enrols students of the course’s study year', () => {
    expect(
      enrollments.every(
        (enrollment) => enrollment.student.studyYear === enrollment.offering.course.studyYear,
      ),
    ).toBe(true);
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

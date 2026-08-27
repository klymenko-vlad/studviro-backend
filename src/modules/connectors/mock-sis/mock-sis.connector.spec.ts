import { describe, expect, it } from 'vitest';

import type { ConnectorRecord } from '../connector.types';

import { MockSisConnector } from './mock-sis.connector';
import { DEFAULT_MOCK_SIS_OPTIONS, type MockSisOptions } from './mock-sis.options';

const connector = (overrides: Partial<MockSisOptions> = {}): MockSisConnector =>
  new MockSisConnector({ ...DEFAULT_MOCK_SIS_OPTIONS, ...overrides });

const externalIds = (records: ConnectorRecord<unknown>[]): string[] =>
  records.map((entry) => entry.externalId);

describe('MockSisConnector', () => {
  it('reports itself as reachable', async () => {
    await expect(connector().healthCheck()).resolves.toMatchObject({ reachable: true });
  });

  it('advertises every read capability and no write capability', () => {
    const capabilities = connector().capabilities();

    expect(capabilities['courses.read']).toBe(true);
    expect(capabilities['officialResults.read']).toBe(true);
    expect(capabilities['examRegistration.write']).toBe(false);
    expect(capabilities['courseRegistration.write']).toBe(false);
  });

  it('does not implement the optional write operations it does not advertise', () => {
    const academic = connector() as unknown as Record<string, unknown>;

    expect(academic.registerForExam).toBeUndefined();
    expect(academic.registerForCourse).toBeUndefined();
  });

  describe('determinism', () => {
    it('returns identical records across two instances built from the same options', async () => {
      const [first, second] = await Promise.all([
        connector().getCourses(),
        connector().getCourses(),
      ]);

      expect(first).toEqual(second);
    });

    it('returns identical records across repeated calls on one instance', async () => {
      const instance = connector();

      expect(await instance.getEnrollments()).toEqual(await instance.getEnrollments());
    });

    it('produces a different population under a different seed', async () => {
      const original = await connector().getPersons();
      const reseeded = await connector({ seed: 1 }).getPersons();

      expect(reseeded).toHaveLength(original.length);
      expect(reseeded).not.toEqual(original);
    });
  });

  describe('referential integrity', () => {
    it('roots every org unit except the university at a known parent', async () => {
      const orgUnits = await connector().getOrgUnits();
      const known = new Set(externalIds(orgUnits));
      const roots = orgUnits.filter((unit) => unit.data.parentExternalId === null);

      expect(roots).toHaveLength(1);
      for (const unit of orgUnits) {
        if (unit.data.parentExternalId !== null) {
          expect(known.has(unit.data.parentExternalId)).toBe(true);
        }
      }
    });

    it('points every offering at a course, a term and a teaching person that exist', async () => {
      const instance = connector();
      const [offerings, courses, terms, persons] = await Promise.all([
        instance.getCourseOfferings(),
        instance.getCourses(),
        instance.getAcademicTerms(),
        instance.getPersons(),
      ]);
      const courseIds = new Set(externalIds(courses));
      const termIds = new Set(externalIds(terms));
      const personIds = new Set(externalIds(persons));

      expect(offerings.length).toBeGreaterThan(0);
      for (const offering of offerings) {
        expect(courseIds.has(offering.data.courseExternalId)).toBe(true);
        expect(termIds.has(offering.data.academicTermExternalId)).toBe(true);
        for (const teaching of offering.data.teaching) {
          expect(personIds.has(teaching.personExternalId)).toBe(true);
        }
      }
    });

    it('points every enrollment at an offering and a student that exist', async () => {
      const instance = connector();
      const [enrollments, offerings, persons] = await Promise.all([
        instance.getEnrollments(),
        instance.getCourseOfferings(),
        instance.getPersons(),
      ]);
      const offeringIds = new Set(externalIds(offerings));
      const studentIds = new Set(
        persons.filter((entry) => entry.data.isStudent).map((entry) => entry.externalId),
      );

      expect(enrollments.length).toBeGreaterThan(0);
      for (const enrollment of enrollments) {
        expect(offeringIds.has(enrollment.data.courseOfferingExternalId)).toBe(true);
        expect(studentIds.has(enrollment.data.personExternalId)).toBe(true);
      }
    });

    it('reports a result only for an enrollment it also reports', async () => {
      const instance = connector();
      const [results, enrollments] = await Promise.all([
        instance.getOfficialResults(),
        instance.getEnrollments(),
      ]);
      const enrollmentIds = new Set(externalIds(enrollments));

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(enrollmentIds.has(result.data.enrollmentExternalId)).toBe(true);
      }
    });

    it('issues a unique external id per entity', async () => {
      const persons = await connector().getPersons();

      expect(new Set(externalIds(persons)).size).toBe(persons.length);
    });

    it('issues a unique email per person, students and staff sharing one namespace', async () => {
      const persons = await connector().getPersons();
      const emails = persons.map((entry) => entry.data.email);

      expect(new Set(emails).size).toBe(persons.length);
    });

    it('gives every student a student identifier and every teacher none', async () => {
      const persons = await connector().getPersons();

      for (const person of persons) {
        expect(person.data.studentIdentifier === null).toBe(!person.data.isStudent);
      }
    });
  });

  describe('changedSince', () => {
    it('returns everything when no watermark is given', async () => {
      const all = await connector().getCourses();

      expect(all.length).toBeGreaterThan(0);
    });

    it('returns nothing for a watermark past every change', async () => {
      const instance = connector();
      const all = await instance.getCourses();
      const latest = all.reduce(
        (newest, entry) => (entry.sourceUpdatedAt > newest ? entry.sourceUpdatedAt : newest),
        new Date(0),
      );

      await expect(instance.getCourses({ changedSince: latest })).resolves.toEqual([]);
    });

    it('returns only the records changed after the watermark', async () => {
      const instance = connector();
      const all = await instance.getCourses();
      const middle = all
        .map((entry) => entry.sourceUpdatedAt)
        .sort((left, right) => left.getTime() - right.getTime())[Math.floor(all.length / 2)];

      const since = await instance.getCourses({ changedSince: middle });

      expect(since.length).toBeGreaterThan(0);
      expect(since.length).toBeLessThan(all.length);
      for (const entry of since) {
        expect(entry.sourceUpdatedAt.getTime()).toBeGreaterThan(middle!.getTime());
      }
    });
  });

  describe('academic calendar', () => {
    it('reports past terms with recorded results and the current term without', async () => {
      const instance = connector();
      const [terms, results, enrollments] = await Promise.all([
        instance.getAcademicTerms(),
        instance.getOfficialResults(),
        instance.getEnrollments(),
      ]);
      const pastTermIds = new Set(
        terms
          .filter((term) => term.data.endsAt < DEFAULT_MOCK_SIS_OPTIONS.anchor)
          .map((term) => term.externalId),
      );
      const offeringTerm = new Map(
        enrollments.map((entry) => [entry.externalId, entry.data.courseOfferingExternalId]),
      );

      expect(pastTermIds.size).toBeGreaterThan(0);
      for (const result of results) {
        expect(offeringTerm.has(result.data.enrollmentExternalId)).toBe(true);
      }
    });

    it('schedules every timetable event inside its own term', async () => {
      const instance = connector();
      const [events, offerings, terms] = await Promise.all([
        instance.getTimetableEvents(),
        instance.getCourseOfferings(),
        instance.getAcademicTerms(),
      ]);
      const termOf = new Map(
        offerings.map((entry) => [entry.externalId, entry.data.academicTermExternalId]),
      );
      const spans = new Map(terms.map((entry) => [entry.externalId, entry.data] as const));

      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        const term = spans.get(termOf.get(event.data.courseOfferingExternalId) ?? '');

        expect(term).toBeDefined();
        expect(event.data.startsAt.getTime()).toBeGreaterThanOrEqual(term!.startsAt.getTime());
        expect(event.data.endsAt.getTime()).toBeLessThanOrEqual(term!.endsAt.getTime());
      }
    });
  });
});

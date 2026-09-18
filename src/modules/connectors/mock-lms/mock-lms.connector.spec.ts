import { describe, expect, it } from 'vitest';

import type { ConnectorRecord } from '../connector.types';
import { MockSisConnector } from '../mock-sis/mock-sis.connector';
import { DEFAULT_MOCK_SIS_OPTIONS } from '../mock-sis/mock-sis.options';

import { MockLmsConnector } from './mock-lms.connector';
import { DEFAULT_MOCK_LMS_OPTIONS, type MockLmsOptions } from './mock-lms.options';
import { MOCK_LMS_ARCHIVED_REFUSAL_CODE } from './mock-lms.provisioner';

const connector = (overrides: Partial<MockLmsOptions> = {}): MockLmsConnector =>
  new MockLmsConnector(
    { ...DEFAULT_MOCK_LMS_OPTIONS, ...overrides },
    new MockSisConnector(DEFAULT_MOCK_SIS_OPTIONS),
  );

const externalIds = (records: ConnectorRecord<unknown>[]): string[] =>
  records.map((entry) => entry.externalId);

describe('MockLmsConnector', () => {
  it('reports itself as reachable', async () => {
    await expect(connector().healthCheck()).resolves.toMatchObject({ reachable: true });
  });

  it('advertises only the read capabilities it actually serves', () => {
    const capabilities = connector().capabilities();

    expect(capabilities['courses.read']).toBe(true);
    expect(capabilities['activities.read']).toBe(true);
    expect(capabilities['grades.read']).toBe(true);
    expect(capabilities['submissions.read']).toBe(true);
    expect(capabilities['completion.read']).toBe(true);
    expect(capabilities['enrollments.read']).toBe(false);
    expect(capabilities['course.provision']).toBe(true);
    expect(capabilities['enrollment.write']).toBe(true);
  });

  describe('provisioning write-back', () => {
    it('provisions a course and returns the identifier the LMS assigned', async () => {
      await expect(
        connector().provisionCourse({
          idempotencyKey: '5d2f7a1e-0000-4000-8000-000000000003',
          courseOfferingExternalId: 'OFF-1',
          code: 'INF/ALG/22',
          name: 'Algorithms',
        }),
      ).resolves.toEqual({ externalId: 'LMS-OFF-1' });
    });

    it('relays an enrolment and returns the identifier it assigned', async () => {
      await expect(
        connector().upsertEnrollment({
          idempotencyKey: '5d2f7a1e-0000-4000-8000-000000000004',
          courseExternalId: 'LMS-OFF-1',
          personExternalId: 'PER-1',
          role: 'student',
          active: true,
        }),
      ).resolves.toEqual({ externalId: 'LMSENR-LMS-OFF-1-PER-1' });
    });

    it('refuses to touch an archived course, so the rejected path can be walked', async () => {
      await expect(
        connector().provisionCourse({
          idempotencyKey: '5d2f7a1e-0000-4000-8000-000000000005',
          courseOfferingExternalId: 'OFF-1-ARCH',
          code: 'X',
          name: 'X',
        }),
      ).rejects.toMatchObject({ code: MOCK_LMS_ARCHIVED_REFUSAL_CODE });
    });
  });

  it('declares the one credential field it accepts', () => {
    expect(connector().credentialFields()).toEqual([
      {
        key: 'wsToken',
        label: 'Web service token',
        description:
          'The mock connector accepts any value; the field exists so credential storage can be exercised end to end.',
        secret: true,
        required: false,
      },
    ]);
  });

  it('leaves the enrolment list to the SIS that owns it', async () => {
    await expect(connector().getEnrollments()).resolves.toEqual([]);
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

      expect(await instance.getActivities()).toEqual(await instance.getActivities());
    });
  });

  describe('alignment with the SIS half', () => {
    it('opens exactly one learning space per course offering the SIS reports', async () => {
      const sis = new MockSisConnector(DEFAULT_MOCK_SIS_OPTIONS);
      const [spaces, offerings] = await Promise.all([
        connector().getCourses(),
        sis.getCourseOfferings(),
      ]);

      expect(spaces).toHaveLength(offerings.length);
      expect(new Set(externalIds(spaces)).size).toBe(spaces.length);
    });

    it('names a course offering the SIS also reports', async () => {
      const sis = new MockSisConnector(DEFAULT_MOCK_SIS_OPTIONS);
      const [spaces, offerings] = await Promise.all([
        connector().getCourses(),
        sis.getCourseOfferings(),
      ]);
      const offeringIds = new Set(externalIds(offerings));

      expect(spaces.length).toBeGreaterThan(0);
      for (const space of spaces) {
        expect(space.data.courseOfferingExternalId).not.toBeNull();
        expect(offeringIds.has(space.data.courseOfferingExternalId!)).toBe(true);
      }
    });

    it('links each offering to at most one space, so the unique index holds', async () => {
      const spaces = await connector().getCourses();
      const linked = spaces.map((space) => space.data.courseOfferingExternalId);

      expect(new Set(linked).size).toBe(linked.length);
    });

    it('hides a space every so often, so visibility is exercised both ways', async () => {
      const spaces = await connector().getCourses();
      const hidden = spaces.filter((space) => !space.data.visible);

      expect(hidden.length).toBeGreaterThan(0);
      expect(hidden.length).toBeLessThan(spaces.length);
    });
  });

  describe('activities', () => {
    it('attaches every activity to a space it also reports', async () => {
      const instance = connector();
      const [activities, spaces] = await Promise.all([
        instance.getActivities(),
        instance.getCourses(),
      ]);
      const spaceIds = new Set(externalIds(spaces));

      expect(activities.length).toBeGreaterThan(0);
      for (const activity of activities) {
        expect(spaceIds.has(activity.data.courseExternalId)).toBe(true);
      }
    });

    it('gives every space the configured number of activities', async () => {
      const instance = connector({ activitiesPerSpace: 3 });
      const [activities, spaces] = await Promise.all([
        instance.getActivities(),
        instance.getCourses(),
      ]);

      expect(activities).toHaveLength(spaces.length * 3);
    });

    it('issues a unique external id per activity', async () => {
      const activities = await connector().getActivities();

      expect(new Set(externalIds(activities)).size).toBe(activities.length);
    });

    it('dates the assessable activities and leaves the reading material undated', async () => {
      const activities = await connector().getActivities();
      const dated = activities.filter((activity) => activity.data.dueAt !== null);

      expect(dated.length).toBeGreaterThan(0);
      for (const activity of activities) {
        const assessable = ['assignment', 'quiz', 'workshop'].includes(activity.data.type);

        expect(activity.data.dueAt !== null).toBe(assessable);
      }
    });

    it('opens a dated activity before it is due', async () => {
      const activities = await connector().getActivities();

      for (const activity of activities) {
        if (!activity.data.dueAt) continue;
        expect(activity.data.opensAt).not.toBeNull();
        expect(activity.data.opensAt!.getTime()).toBeLessThan(activity.data.dueAt.getTime());
      }
    });
  });

  describe('changedSince', () => {
    it('returns everything when no watermark is given', async () => {
      expect((await connector().getCourses()).length).toBeGreaterThan(0);
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

  describe('the gradebook', () => {
    it('opens one gradebook column per assessable activity and no more', async () => {
      const instance = connector();
      const [assessments, activities] = await Promise.all([
        instance.getAssessments(),
        instance.getActivities(),
      ]);
      const assessable = activities.filter((activity) => activity.data.dueAt !== null);

      expect(assessments).toHaveLength(assessable.length);
      expect(new Set(externalIds(assessments)).size).toBe(assessments.length);
    });

    it('names an activity and a space it also reports', async () => {
      const instance = connector();
      const [assessments, activities, spaces] = await Promise.all([
        instance.getAssessments(),
        instance.getActivities(),
        instance.getCourses(),
      ]);
      const activityIds = new Set(externalIds(activities));
      const spaceIds = new Set(externalIds(spaces));

      for (const assessment of assessments) {
        expect(spaceIds.has(assessment.data.courseExternalId)).toBe(true);
        expect(activityIds.has(assessment.data.activityExternalId!)).toBe(true);
      }
    });

    it('grades only columns it opened, for people the SIS enrolled', async () => {
      const sis = new MockSisConnector(DEFAULT_MOCK_SIS_OPTIONS);
      const instance = connector();
      const [grades, assessments, enrollments] = await Promise.all([
        instance.getGrades(),
        instance.getAssessments(),
        sis.getEnrollments(),
      ]);
      const columns = new Set(externalIds(assessments));
      const people = new Set(enrollments.map((entry) => entry.data.personExternalId));

      expect(grades.length).toBeGreaterThan(0);
      for (const grade of grades) {
        expect(columns.has(grade.data.assessmentExternalId)).toBe(true);
        expect(people.has(grade.data.personExternalId)).toBe(true);
      }
    });

    it('awards no more than the maximum and never a negative mark', async () => {
      const grades = await connector().getGrades();

      for (const grade of grades) {
        expect(grade.data.points).not.toBeNull();
        expect(grade.data.points!).toBeGreaterThanOrEqual(0);
        expect(grade.data.points!).toBeLessThanOrEqual(grade.data.maxPoints!);
      }
    });
  });

  describe('submissions', () => {
    it('reports work handed in only against deadlines already passed', async () => {
      const instance = connector();
      const [submissions, activities] = await Promise.all([
        instance.getSubmissions(),
        instance.getActivities(),
      ]);
      const dueAt = new Map(
        activities.map((activity) => [activity.externalId, activity.data.dueAt]),
      );

      expect(submissions.length).toBeGreaterThan(0);
      for (const submission of submissions) {
        const due = dueAt.get(submission.data.activityExternalId);

        expect(due).toBeTruthy();
        expect(due!.getTime()).toBeLessThanOrEqual(DEFAULT_MOCK_LMS_OPTIONS.anchor.getTime());
      }
    });

    it('leaves some students with nothing handed in, so a gap is exercised', async () => {
      const instance = connector();
      const [submissions, grades] = await Promise.all([
        instance.getSubmissions(),
        instance.getGrades(),
      ]);

      expect(grades.length).toBeLessThan(submissions.length);
    });

    it('marks a late hand-in as after its deadline and a punctual one as before', async () => {
      const instance = connector();
      const [submissions, activities] = await Promise.all([
        instance.getSubmissions(),
        instance.getActivities(),
      ]);
      const dueAt = new Map(
        activities.map((activity) => [activity.externalId, activity.data.dueAt]),
      );
      const late = submissions.filter((submission) => submission.data.isLate);

      expect(late.length).toBeGreaterThan(0);
      expect(late.length).toBeLessThan(submissions.length);
      for (const submission of submissions) {
        const due = dueAt.get(submission.data.activityExternalId)!;
        const punctual = submission.data.submittedAt!.getTime() <= due.getTime();

        expect(punctual).toBe(!submission.data.isLate);
      }
    });
  });

  describe('completion', () => {
    it('reports completion for the activities the term has already reached', async () => {
      const completions = await connector().getCompletion();

      expect(completions.length).toBeGreaterThan(0);
      expect(new Set(externalIds(completions)).size).toBe(completions.length);
    });

    it('reports both outcomes, so neither branch goes untested', async () => {
      const completions = await connector().getCompletion();
      const states = new Set(completions.map((entry) => entry.data.state));

      expect(states.has('complete')).toBe(true);
      expect(states.has('incomplete')).toBe(true);
    });
  });

  describe('a term in progress', () => {
    it('places deadlines on both sides of the anchor', async () => {
      const activities = await connector().getActivities();
      const dated = activities.filter((activity) => activity.data.dueAt !== null);
      const anchor = DEFAULT_MOCK_LMS_OPTIONS.anchor.getTime();

      expect(dated.some((entry) => entry.data.dueAt!.getTime() < anchor)).toBe(true);
      expect(dated.some((entry) => entry.data.dueAt!.getTime() > anchor)).toBe(true);
    });
  });
});

import { describe, expect, it } from 'vitest';

import type { ConnectorRecord } from '../connector.types';
import { MockSisConnector } from '../mock-sis/mock-sis.connector';
import { DEFAULT_MOCK_SIS_OPTIONS } from '../mock-sis/mock-sis.options';

import { MockLmsConnector } from './mock-lms.connector';
import { DEFAULT_MOCK_LMS_OPTIONS, type MockLmsOptions } from './mock-lms.options';

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
    expect(capabilities['grades.read']).toBe(false);
    expect(capabilities['submissions.read']).toBe(false);
    expect(capabilities['enrollment.write']).toBe(false);
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

  it('returns nothing for the domains it does not advertise', async () => {
    const instance = connector();

    await expect(instance.getGrades()).resolves.toEqual([]);
    await expect(instance.getSubmissions()).resolves.toEqual([]);
    await expect(instance.getCompletion()).resolves.toEqual([]);
    await expect(instance.getEnrollments()).resolves.toEqual([]);
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
});

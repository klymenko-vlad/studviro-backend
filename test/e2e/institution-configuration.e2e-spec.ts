import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { institutions, roleAssignments, type CanonicalRole } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Institution configuration (e2e)', () => {
  let harness: TestHarness;
  let institutionId: string;

  const memberOf = async (userId: string, role: CanonicalRole): Promise<void> => {
    await harness.db.insert(roleAssignments).values({
      institutionId,
      userId,
      role,
      scopeType: 'institution',
      scopeId: null,
    });
  };

  const actingAs = async (role: CanonicalRole) => {
    const actor = await harness.actingAs();
    await memberOf(actor.user.id, role);

    return actor;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();

    const [created] = await harness.db
      .insert(institutions)
      .values({ code: 'upjs', name: 'UPJŠ' })
      .returning();
    institutionId = created!.id;
  });

  describe('reading', () => {
    it('answers with the platform defaults before anything is configured', async () => {
      const actor = await actingAs('student');

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        institutionId,
        code: 'upjs',
        defaultLocale: 'en',
        timezone: 'Europe/Bratislava',
      });
      expect(response.json().terminology.faculty).toBeNull();
      expect(response.json().features.examRegistration).toBe(true);
    });

    it('refuses a caller with no role in the institution', async () => {
      const actor = await harness.actingAs();

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('updating', () => {
    it('refuses a member who cannot manage the institution', async () => {
      const actor = await actingAs('student');

      const response = await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
        payload: { features: { fees: true } },
      });

      expect(response.statusCode).toBe(403);
    });

    it('stores terminology, flags and locale for an administrator', async () => {
      const actor = await actingAs('institution_admin');

      const updated = await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
        payload: {
          defaultLocale: 'sk',
          timezone: 'Europe/Prague',
          terminology: { faculty: 'School', course: 'Module' },
          features: { fees: true, examRegistration: false },
        },
      });

      expect(updated.statusCode).toBe(200);

      const read = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
      });

      expect(read.json()).toMatchObject({
        defaultLocale: 'sk',
        timezone: 'Europe/Prague',
      });
      expect(read.json().terminology).toMatchObject({ faculty: 'School', course: 'Module' });
      expect(read.json().features).toMatchObject({ fees: true, examRegistration: false });
    });

    it('merges a second change into the first rather than replacing it', async () => {
      const actor = await actingAs('institution_admin');
      const url = `/api/v1/institutions/${institutionId}/configuration`;

      await harness.inject({
        method: 'PATCH',
        url,
        headers: actor.headers,
        payload: { terminology: { faculty: 'School' }, features: { fees: true } },
      });
      const second = await harness.inject({
        method: 'PATCH',
        url,
        headers: actor.headers,
        payload: { terminology: { course: 'Module' } },
      });

      expect(second.json().terminology).toMatchObject({
        faculty: 'School',
        course: 'Module',
      });
      expect(second.json().features.fees).toBe(true);
    });

    it('clears an override when it is sent as null', async () => {
      const actor = await actingAs('institution_admin');
      const url = `/api/v1/institutions/${institutionId}/configuration`;

      await harness.inject({
        method: 'PATCH',
        url,
        headers: actor.headers,
        payload: { terminology: { faculty: 'School' } },
      });
      const cleared = await harness.inject({
        method: 'PATCH',
        url,
        headers: actor.headers,
        payload: { terminology: { faculty: null } },
      });

      expect(cleared.json().terminology.faculty).toBeNull();
    });

    it('rejects a terminology key outside the catalogue', async () => {
      const actor = await actingAs('institution_admin');

      const response = await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
        payload: { terminology: { mascot: 'Ada' } },
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejects an unsupported locale and an unknown timezone', async () => {
      const actor = await actingAs('institution_admin');
      const url = `/api/v1/institutions/${institutionId}/configuration`;

      const locale = await harness.inject({
        method: 'PATCH',
        url,
        headers: actor.headers,
        payload: { defaultLocale: 'klingon' },
      });
      const timezone = await harness.inject({
        method: 'PATCH',
        url,
        headers: actor.headers,
        payload: { timezone: 'Middle/Earth' },
      });

      expect(locale.statusCode).toBe(400);
      expect(timezone.statusCode).toBe(400);
    });
  });

  describe('a feature flag closes the door (B6)', () => {
    const turnOff = async (feature: string) => {
      const admin = await actingAs('institution_admin');
      await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: admin.headers,
        payload: { features: { [feature]: false } },
      });
    };

    const listExamTerms = async () => {
      const actor = await actingAs('student');

      return harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/me/exam-terms`,
        headers: actor.headers,
      });
    };

    it('serves the exam terms while the feature is on', async () => {
      expect((await listExamTerms()).statusCode).toBe(200);
    });

    it('refuses the exam terms once the institution turns it off', async () => {
      await turnOff('examRegistration');

      const response = await listExamTerms();

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('FEATURE_DISABLED');
    });

    it('leaves the other features alone', async () => {
      await turnOff('examRegistration');
      const actor = await actingAs('student');

      const grades = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/me/course-results`,
        headers: actor.headers,
      });

      expect(grades.statusCode).toBe(200);
    });

    it('names the flags it actually enforces, so the screen need not guess', async () => {
      const actor = await actingAs('institution_admin');

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
      });

      expect(response.json().implementedFeatures).toEqual([
        'courseRegistration',
        'examRegistration',
        'timetable',
        'grades',
      ]);
    });
  });
});

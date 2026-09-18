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
        connectors: { academicSystem: null, learningSystem: null },
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

    it('stores terminology, flags, locale and connector for an administrator', async () => {
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
          academicSystemConnector: 'mock-sis',
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
        connectors: { academicSystem: 'mock-sis', learningSystem: null },
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

  describe('connectors', () => {
    it('reports both kinds as not configured before anything is selected', async () => {
      const actor = await actingAs('institution_admin');

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/connectors`,
        headers: actor.headers,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject([
        { kind: 'academic', name: null, installed: false },
        { kind: 'learning', name: null, installed: false },
      ]);
    });

    it('reports the mock SIS as healthy once the institution selects it', async () => {
      const actor = await actingAs('institution_admin');

      await harness.inject({
        method: 'PATCH',
        url: `/api/v1/institutions/${institutionId}/configuration`,
        headers: actor.headers,
        payload: { academicSystemConnector: 'mock-sis' },
      });
      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/connectors`,
        headers: actor.headers,
      });

      const [academic] = response.json();

      expect(academic).toMatchObject({ name: 'mock-sis', installed: true, healthy: true });
      expect(academic.capabilities).toContain('courses.read');
      expect(academic.capabilities).toContain('examRegistration.write');
      expect(academic.capabilities).not.toContain('courseRegistration.write');
    });

    it('offers the connectors the deployment ships with as alternatives', async () => {
      const actor = await actingAs('institution_admin');

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/connectors`,
        headers: actor.headers,
      });

      const [academic, learning] = response.json();

      expect(academic.alternatives).toEqual(['mock-sis']);
      expect(learning.alternatives).toEqual(['mock-lms']);
    });

    it('refuses a member who cannot manage the institution', async () => {
      const actor = await actingAs('teacher');

      const response = await harness.inject({
        method: 'GET',
        url: `/api/v1/institutions/${institutionId}/connectors`,
        headers: actor.headers,
      });

      expect(response.statusCode).toBe(403);
    });
  });
});

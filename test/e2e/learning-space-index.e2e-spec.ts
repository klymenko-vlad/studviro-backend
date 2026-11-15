import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';
import { seedLearningFixture, type LearningFixture } from '../setup/learning-fixture';

interface IndexBody {
  total: number;
  offeringsWithoutPage: number;
  spaces: { id: string; courseCode: string | null }[];
}

describe('Learning space index (e2e)', () => {
  let harness: TestHarness;
  let fixture: LearningFixture;

  const list = (actor: { headers: { authorization: string } }, query = '') =>
    harness.inject({
      method: 'GET',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces${query}`,
      headers: actor.headers,
    });

  const openSpace = (offeringId: string, name: string) =>
    harness.inject({
      method: 'POST',
      url: `/api/v1/institutions/${fixture.institutionId}/learning-spaces`,
      headers: fixture.admin.headers,
      payload: { courseOfferingId: offeringId, name, visible: true },
    });

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    fixture = await seedLearningFixture(harness);
  });

  describe('the institution-wide index', () => {
    it('counts the pages written and the offerings still without one', async () => {
      await openSpace(fixture.offeringId, 'Algorithms, winter 2026');

      const body = (await list(fixture.admin)).json<IndexBody>();

      expect(body).toMatchObject({ total: 1, offeringsWithoutPage: 1 });
      expect(body.spaces).toHaveLength(1);
    });

    it('reports every offering as waiting before anybody writes a page', async () => {
      expect((await list(fixture.admin)).json<IndexBody>()).toMatchObject({
        total: 0,
        offeringsWithoutPage: 2,
        spaces: [],
      });
    });

    it('is refused to a student, who was previously offered it in the navigation', async () => {
      await openSpace(fixture.offeringId, 'Algorithms, winter 2026');

      const denied = await list(fixture.student);

      expect(denied.statusCode).toBe(403);
      expect(denied.json().code).toBe('LEARNING_INDEX_DENIED');
    });

    it('is refused to a teacher, who administers no offering but their own', async () => {
      expect((await list(fixture.teacher)).statusCode).toBe(403);
      expect((await list(fixture.derivedTeacher)).statusCode).toBe(403);
    });

    it('is refused to somebody from another institution', async () => {
      const elsewhere = await harness.actingAs({ email: 'elsewhere@example.com' });

      expect((await list(elsewhere)).statusCode).toBe(403);
    });
  });

  describe('the page on one offering', () => {
    it('is open to the student sitting the course', async () => {
      await openSpace(fixture.offeringId, 'Algorithms, winter 2026');

      const body = (
        await list(fixture.student, `?offeringId=${fixture.offeringId}`)
      ).json<IndexBody>();

      expect(body.spaces).toHaveLength(1);
    });

    it('is open to the teacher teaching it', async () => {
      await openSpace(fixture.offeringId, 'Algorithms, winter 2026');

      expect(
        (await list(fixture.teacher, `?offeringId=${fixture.offeringId}`)).statusCode,
      ).toBe(200);
    });

    it('answers with nothing when the offering has no page yet', async () => {
      const response = await list(fixture.student, `?offeringId=${fixture.offeringId}`);

      expect(response.statusCode).toBe(200);
      expect(response.json<IndexBody>().spaces).toEqual([]);
    });

    it('refuses a student who does not take the offering, even before a page exists', async () => {
      const response = await list(fixture.student, `?offeringId=${fixture.otherOfferingId}`);

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('LEARNING_SPACE_NOT_YOURS');
    });

    it('still refuses somebody from another institution', async () => {
      const elsewhere = await harness.actingAs({ email: 'elsewhere@example.com' });

      expect((await list(elsewhere, `?offeringId=${fixture.offeringId}`)).statusCode).toBe(403);
    });
  });
});

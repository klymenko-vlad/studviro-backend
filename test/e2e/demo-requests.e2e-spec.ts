import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { demoRequests } from '../../src/database/schema';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Demo requests (e2e)', () => {
  let harness: TestHarness;

  const validRequest = {
    institutionName: 'Comenius University',
    contactName: 'Ada Lovelace',
    email: 'Ada@University.edu',
    role: 'Vice-dean for study affairs',
    message: 'We run AIS2 and Moodle and would like to see them behind one screen.',
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  const post = (payload: Record<string, unknown>) =>
    harness.inject({ method: 'POST', url: '/api/v1/demo-requests', payload });

  const rows = () => harness.db.select().from(demoRequests);

  it('accepts a request from a visitor holding no session', async () => {
    const response = await post(validRequest);

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: 'accepted' });
  });

  it('echoes nothing the caller submitted', async () => {
    const response = await post(validRequest);

    const body = JSON.stringify(response.json());
    expect(body).not.toContain('ada@university.edu');
    expect(body.toLowerCase()).not.toContain('ada@university.edu');
    expect(body).not.toContain('Comenius');
  });

  it('stores the lead with a normalised email and a first submission counted', async () => {
    await post(validRequest);

    const [row] = await rows();
    expect(row).toMatchObject({
      email: 'ada@university.edu',
      institutionName: 'Comenius University',
      contactName: 'Ada Lovelace',
      status: 'new',
      submissionCount: 1,
    });
  });

  it('records a hash of the caller address rather than the address', async () => {
    await post(validRequest);

    const [row] = await rows();
    expect(row?.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deduplicates a repeat submission onto one row and advances its counter', async () => {
    await post(validRequest);
    const [first] = await rows();

    await post({ ...validRequest, institutionName: 'Comenius University, Bratislava' });
    const all = await rows();

    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      id: first?.id,
      submissionCount: 2,
      institutionName: 'Comenius University, Bratislava',
    });
    expect(all[0]!.lastSubmittedAt.getTime()).toBeGreaterThanOrEqual(
      first!.lastSubmittedAt.getTime(),
    );
  });

  it('stores an omitted message as null', async () => {
    const { message: _omitted, ...withoutMessage } = validRequest;
    await post(withoutMessage);

    const [row] = await rows();
    expect(row?.message).toBeNull();
  });

  it('accepts a filled honeypot without storing anything', async () => {
    const response = await post({ ...validRequest, website: 'https://spam.example' });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: 'accepted' });
    expect(await rows()).toHaveLength(0);
  });

  it.each([
    ['an invalid email', { ...validRequest, email: 'not-an-email' }],
    ['a missing institution', { ...validRequest, institutionName: undefined }],
    ['a one-character institution', { ...validRequest, institutionName: 'C' }],
    ['an over-long message', { ...validRequest, message: 'x'.repeat(2001) }],
    ['an unknown property', { ...validRequest, isAdmin: true }],
  ])('rejects %s with 400 and stores nothing', async (_case, payload) => {
    const response = await post(payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      path: '/api/v1/demo-requests',
    });
    expect(await rows()).toHaveLength(0);
  });

  it('accepts a message at exactly the limit', async () => {
    const response = await post({ ...validRequest, message: 'x'.repeat(2000) });

    expect(response.statusCode).toBe(202);
    expect(await rows()).toHaveLength(1);
  });
});

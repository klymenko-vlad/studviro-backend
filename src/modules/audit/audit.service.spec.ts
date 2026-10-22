import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '../../common/errors/domain.error';
import type { TransactionHost } from '../../database/transaction.host';

import { AuditService, type AuditEventInput } from './audit.service';
import { runWithRequestId } from './request-id.context';

const NOW = new Date('2026-09-19T08:30:00.000Z');
const INSTITUTION = '11111111-1111-1111-1111-111111111111';
const ACTOR = '22222222-2222-2222-2222-222222222222';
const SUBJECT = '33333333-3333-3333-3333-333333333333';

const input = (overrides: Partial<AuditEventInput> = {}): AuditEventInput => ({
  institutionId: INSTITUTION,
  actorUserId: ACTOR,
  action: 'grade.published',
  subjectType: 'course_result',
  subjectId: SUBJECT,
  ...overrides,
});

describe('AuditService', () => {
  const returning = vi.fn();
  const values = vi.fn((_row: Record<string, unknown>) => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  const client = vi.fn(() => ({ insert }));

  const txHost = { client } as unknown as TransactionHost;
  let service: AuditService;

  const recorded = (): Record<string, unknown> => values.mock.calls[0]?.[0] ?? {};

  beforeEach(() => {
    vi.clearAllMocks();
    returning.mockResolvedValue([{ id: 'event-1' }]);
    service = new AuditService(txHost);
  });

  it('writes the event through the caller’s transaction rather than the pool', async () => {
    await service.record(input(), NOW);

    expect(client).toHaveBeenCalledWith();
    expect(recorded()).toMatchObject({
      institutionId: INSTITUTION,
      actorUserId: ACTOR,
      action: 'grade.published',
      subjectType: 'course_result',
      subjectId: SUBJECT,
      occurredAt: NOW,
    });
  });

  it('keeps the before and after values it was given', async () => {
    await service.record(
      input({ before: { officialGrade: 'C' }, after: { officialGrade: 'A' } }),
      NOW,
    );

    expect(recorded()).toMatchObject({
      before: { officialGrade: 'C' },
      after: { officialGrade: 'A' },
    });
  });

  it('records a system action, which has no actor', async () => {
    await service.record(input({ actorUserId: null }), NOW);

    expect(recorded()).toMatchObject({ actorUserId: null });
  });

  it('nulls the optional fields the caller left out', async () => {
    await service.record(input(), NOW);

    expect(recorded()).toMatchObject({
      summary: null,
      before: null,
      after: null,
      requestId: null,
    });
  });

  it('names the request it happened under when there is one', async () => {
    await runWithRequestId('request-7', () => service.record(input(), NOW));

    expect(recorded()).toMatchObject({ requestId: 'request-7' });
  });

  it('refuses to report success when the insert returned nothing', async () => {
    returning.mockResolvedValue([]);

    await expect(service.record(input(), NOW)).rejects.toBeInstanceOf(ConflictError);
  });
});

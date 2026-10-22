import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransactionHost } from '../../database/transaction.host';
import type { AuditService } from '../audit/audit.service';

import { ExamTermCancellationService } from './exam-term-cancellation.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';

describe('ExamTermCancellationService', () => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  const txHost = {
    client: () => ({ update }),
    run: (fn: () => Promise<unknown>) => fn(),
  } as unknown as TransactionHost;
  const recordAudit = vi.fn();
  let service: ExamTermCancellationService;

  beforeEach(() => {
    vi.clearAllMocks();
    returning.mockResolvedValue([{ id: 'registration-1', status: 'cancelled' }]);
    service = new ExamTermCancellationService(txHost, {
      record: recordAudit,
    } as unknown as AuditService);
  });

  it('cancels the seats a cancelled term was holding', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    await expect(service.releaseSeats(INSTITUTION, 'exam-1', now)).resolves.toEqual([
      { id: 'registration-1', status: 'cancelled' },
    ]);
    expect(set).toHaveBeenCalledWith({ status: 'cancelled', cancelledAt: now });
  });

  it('records the cancellation rather than erasing it', async () => {
    await service.releaseSeats(INSTITUTION, 'exam-1', new Date());

    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.anything() }),
    );
  });

  it('records the cancellation as an audit event in the same transaction', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    await service.releaseSeats(INSTITUTION, 'exam-1', now, 'admin-1');

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: INSTITUTION,
        actorUserId: 'admin-1',
        action: 'exam_term.cancelled',
        subjectType: 'exam_term',
        subjectId: 'exam-1',
      }),
      now,
    );
  });
});

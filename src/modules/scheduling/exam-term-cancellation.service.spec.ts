import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransactionHost } from '../../database/transaction.host';

import { ExamTermCancellationService } from './exam-term-cancellation.service';

describe('ExamTermCancellationService', () => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));

  const txHost = { client: () => ({ update }) } as unknown as TransactionHost;
  let service: ExamTermCancellationService;

  beforeEach(() => {
    vi.clearAllMocks();
    returning.mockResolvedValue([{ id: 'registration-1', status: 'cancelled' }]);
    service = new ExamTermCancellationService(txHost);
  });

  it('cancels the seats a cancelled term was holding', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    await expect(service.releaseSeats('exam-1', now)).resolves.toEqual([
      { id: 'registration-1', status: 'cancelled' },
    ]);
    expect(set).toHaveBeenCalledWith({ status: 'cancelled', cancelledAt: now });
  });

  it('records the cancellation rather than erasing it', async () => {
    await service.releaseSeats('exam-1', new Date());

    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ deletedAt: expect.anything() }),
    );
  });
});

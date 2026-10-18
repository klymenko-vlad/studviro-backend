import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TransactionHost } from '../../database/transaction.host';

import { CalendarFeedService, hashFeedToken } from './calendar-feed.service';
import type { CalendarFeedsRepository } from './calendar-feeds.repository';

const CREATED = new Date('2026-10-18T10:00:00.000Z');

describe('CalendarFeedService', () => {
  const feeds = {
    findForOwner: vi.fn(),
    findByTokenHash: vi.fn(),
    removeForOwner: vi.fn(),
    create: vi.fn(),
  };
  const txHost = { run: vi.fn((fn: (tx: unknown) => unknown) => fn('tx')) };
  let service: CalendarFeedService;

  beforeEach(() => {
    vi.clearAllMocks();
    feeds.create.mockResolvedValue({ createdAt: CREATED });
    service = new CalendarFeedService(
      txHost as unknown as TransactionHost,
      feeds as unknown as CalendarFeedsRepository,
    );
  });

  it('stores only the hash of the token it hands out', async () => {
    const issued = await service.issue('institution-1', 'user-1');

    expect(issued.createdAt).toBe(CREATED);
    expect(feeds.create).toHaveBeenCalledWith(
      {
        institutionId: 'institution-1',
        userId: 'user-1',
        tokenHash: hashFeedToken(issued.token),
      },
      'tx',
    );
    expect(JSON.stringify(feeds.create.mock.calls)).not.toContain(issued.token);
  });

  it('issues an unguessable token every time', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i += 1) tokens.add((await service.issue('i', 'u')).token);

    expect(tokens.size).toBe(50);
    expect(Buffer.from([...tokens][0]!, 'base64url')).toHaveLength(32);
  });

  it('replaces the previous feed in the same transaction, so the old URL stops working', async () => {
    await service.issue('institution-1', 'user-1');

    expect(feeds.removeForOwner).toHaveBeenCalledWith('institution-1', 'user-1', 'tx');
    expect(feeds.removeForOwner.mock.invocationCallOrder[0]).toBeLessThan(
      feeds.create.mock.invocationCallOrder[0]!,
    );
  });

  it('reports whether a feed exists without revealing it', async () => {
    feeds.findForOwner.mockResolvedValueOnce({ createdAt: CREATED, tokenHash: 'h' });
    expect(await service.status('i', 'u')).toEqual({ active: true, createdAt: CREATED });

    feeds.findForOwner.mockResolvedValueOnce(undefined);
    expect(await service.status('i', 'u')).toEqual({ active: false, createdAt: null });
  });

  it('looks a presented token up by its hash', async () => {
    await service.resolve('presented');

    expect(feeds.findByTokenHash).toHaveBeenCalledWith(hashFeedToken('presented'));
  });

  it('withdraws the feed of its owner only', async () => {
    await service.revoke('institution-1', 'user-1');

    expect(feeds.removeForOwner).toHaveBeenCalledWith('institution-1', 'user-1');
  });
});

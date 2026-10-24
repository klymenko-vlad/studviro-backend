import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import type { StorageReclamationRepository } from './storage-reclamation.repository';
import { StorageReclamationService } from './storage-reclamation.service';
import type { StorageService } from './storage.service';
import type { StorageKey } from './storage.types';

const NOW = new Date('2026-09-21T04:00:00.000Z');

const object = (id: string) => ({
  source: 'material' as const,
  id,
  institutionId: 'institution-1',
  storageKey: `institutions/institution-1/materials/${id}` satisfies StorageKey,
});

describe(StorageReclamationService.name, () => {
  const findReclaimable = vi.fn();
  const markReclaimed = vi.fn();
  const remove = vi.fn();
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };

  const repository = {
    findReclaimable,
    markReclaimed,
  } as unknown as StorageReclamationRepository;
  const storage = { delete: remove } as unknown as StorageService;

  let service: StorageReclamationService;

  const configWith = (overrides: Record<string, unknown> = {}) =>
    ({
      storage: { enabled: true, reclaimAfterDays: 30, ...overrides },
    }) as unknown as AppConfigService;

  const build = (config = configWith()) =>
    new StorageReclamationService(
      repository,
      storage,
      config,
      logger as unknown as ConstructorParameters<typeof StorageReclamationService>[3],
    );

  beforeEach(() => {
    vi.clearAllMocks();
    findReclaimable.mockResolvedValue([]);
    markReclaimed.mockResolvedValue(undefined);
    remove.mockResolvedValue(undefined);
    service = build();
  });

  it('drops the object of a material tombstoned longer ago than the grace period', async () => {
    findReclaimable.mockResolvedValue([object('m1')]);

    await expect(service.reclaim(NOW)).resolves.toEqual({ reclaimed: 1, failed: 0 });

    expect(remove).toHaveBeenCalledWith(object('m1').storageKey, 'institution-1');
    expect(markReclaimed).toHaveBeenCalledWith(object('m1'));
  });

  it('asks only for rows whose grace period has run out', async () => {
    await service.reclaim(NOW);

    expect(findReclaimable).toHaveBeenCalledWith(
      new Date('2026-08-22T04:00:00.000Z'),
      expect.any(Number),
    );
  });

  it('honours a shorter window without touching anything else', async () => {
    service = build(configWith({ reclaimAfterDays: 1 }));

    await service.reclaim(NOW);

    expect(findReclaimable).toHaveBeenCalledWith(
      new Date('2026-09-20T04:00:00.000Z'),
      expect.any(Number),
    );
  });

  it('keeps going when one object cannot be dropped, and leaves its key for tomorrow', async () => {
    findReclaimable.mockResolvedValue([object('m1'), object('m2')]);
    remove.mockRejectedValueOnce(new Error('store unreachable'));

    await expect(service.reclaim(NOW)).resolves.toEqual({ reclaimed: 1, failed: 1 });

    expect(markReclaimed).toHaveBeenCalledTimes(1);
    expect(markReclaimed).toHaveBeenCalledWith(object('m2'));
  });

  it('does nothing at all when object storage is switched off', async () => {
    service = build(configWith({ enabled: false }));

    await expect(service.reclaim(NOW)).resolves.toEqual({ reclaimed: 0, failed: 0 });

    expect(findReclaimable).not.toHaveBeenCalled();
  });

  it('does not start a second sweep over the first', async () => {
    let release = (): void => undefined;
    findReclaimable.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve([]);
          };
        }),
    );

    const first = service.reclaim(NOW);
    const second = await service.reclaim(NOW);
    release();
    await first;

    expect(second).toEqual({ reclaimed: 0, failed: 0 });
    expect(findReclaimable).toHaveBeenCalledTimes(1);
  });

  it('survives the store being unreachable altogether', async () => {
    findReclaimable.mockRejectedValue(new Error('no route to host'));

    await expect(service.reclaim(NOW)).resolves.toEqual({ reclaimed: 0, failed: 0 });
  });
});

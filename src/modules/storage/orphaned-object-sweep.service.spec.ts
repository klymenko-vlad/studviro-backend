import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import { OrphanedObjectSweepService } from './orphaned-object-sweep.service';
import type { StorageReclamationRepository } from './storage-reclamation.repository';
import type { StorageService } from './storage.service';

const NOW = new Date('2026-09-21T05:00:00.000Z');
const OLD = new Date('2026-09-19T05:00:00.000Z');
const FRESH = new Date('2026-09-21T04:00:00.000Z');

const key = (id: string) => `institutions/institution-1/materials/${id}/file.pdf`;

describe(OrphanedObjectSweepService.name, () => {
  const list = vi.fn();
  const remove = vi.fn();
  const findReferenced = vi.fn();
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };

  const build = (enabled = true) =>
    new OrphanedObjectSweepService(
      { findReferenced } as unknown as StorageReclamationRepository,
      { list, delete: remove } as unknown as StorageService,
      { storage: { enabled } } as unknown as AppConfigService,
      logger as unknown as ConstructorParameters<typeof OrphanedObjectSweepService>[3],
    );

  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ objects: [], next: undefined });
    findReferenced.mockResolvedValue(new Set());
    remove.mockResolvedValue(undefined);
  });

  it('drops an old object no row points at', async () => {
    list.mockResolvedValue({
      objects: [{ key: key('a'), lastModified: OLD }],
      next: undefined,
    });

    await expect(build().sweep(NOW)).resolves.toEqual({ removed: 1, failed: 0 });
    expect(remove).toHaveBeenCalledWith(key('a'), 'institution-1');
  });

  it('keeps an object a row points at', async () => {
    list.mockResolvedValue({
      objects: [{ key: key('a'), lastModified: OLD }],
      next: undefined,
    });
    findReferenced.mockResolvedValue(new Set([key('a')]));

    await expect(build().sweep(NOW)).resolves.toEqual({ removed: 0, failed: 0 });
    expect(remove).not.toHaveBeenCalled();
  });

  it('keeps a fresh object, whose uploader may still be claiming it', async () => {
    list.mockResolvedValue({
      objects: [{ key: key('a'), lastModified: FRESH }],
      next: undefined,
    });

    await build().sweep(NOW);

    expect(findReferenced).toHaveBeenCalledWith([]);
    expect(remove).not.toHaveBeenCalled();
  });

  it('walks every page of the bucket', async () => {
    list
      .mockResolvedValueOnce({ objects: [{ key: key('a'), lastModified: OLD }], next: 't1' })
      .mockResolvedValueOnce({
        objects: [{ key: key('b'), lastModified: OLD }],
        next: undefined,
      });

    await expect(build().sweep(NOW)).resolves.toEqual({ removed: 2, failed: 0 });
    expect(list).toHaveBeenLastCalledWith('institutions/', 't1');
  });

  it('counts a failed delete and carries on', async () => {
    list.mockResolvedValue({
      objects: [
        { key: key('a'), lastModified: OLD },
        { key: key('b'), lastModified: OLD },
      ],
      next: undefined,
    });
    remove.mockRejectedValueOnce(new Error('unreachable'));

    await expect(build().sweep(NOW)).resolves.toEqual({ removed: 1, failed: 1 });
  });

  it('ignores a key outside any institution', async () => {
    list.mockResolvedValue({
      objects: [{ key: 'institutions/', lastModified: OLD }],
      next: undefined,
    });

    await build().sweep(NOW);

    expect(remove).not.toHaveBeenCalled();
  });

  it('survives the store being unreachable', async () => {
    list.mockRejectedValue(new Error('down'));

    await expect(build().sweep(NOW)).resolves.toEqual({ removed: 0, failed: 0 });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does nothing when object storage is switched off', async () => {
    await build(false).sweep(NOW);

    expect(list).not.toHaveBeenCalled();
  });

  it('does not start a second sweep over the first', async () => {
    let finish: (value: unknown) => void = () => undefined;
    list.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const service = build();

    const first = service.sweep(NOW);
    await expect(service.sweep(NOW)).resolves.toEqual({ removed: 0, failed: 0 });
    finish({ objects: [], next: undefined });
    await first;

    expect(list).toHaveBeenCalledTimes(1);
  });
});

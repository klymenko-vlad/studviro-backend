import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';

import type { AcademicTermsRepository } from './academic-terms.repository';
import { AcademicTermsService } from './academic-terms.service';

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const validTerm = {
  code: '2026W',
  name: 'Winter semester 2026/2027',
  academicYear: '2026/2027',
  startsAt: day('2026-09-21'),
  endsAt: day('2027-02-14'),
  enrollmentOpensAt: day('2026-08-24'),
  enrollmentClosesAt: day('2026-10-05'),
};

describe('AcademicTermsService', () => {
  const repo = {
    listFor: vi.fn(),
    assertCodeFree: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findByIdIn: vi.fn(),
    softDelete: vi.fn(),
    countOfferings: vi.fn(),
  };

  let service: AcademicTermsService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo.create.mockImplementation((value: unknown) => Promise.resolve(value));
    repo.update.mockImplementation((_id: string, value: unknown) => Promise.resolve(value));
    repo.findByIdIn.mockResolvedValue({ id: 'term-1', ...validTerm });
    repo.countOfferings.mockResolvedValue(0);

    service = new AcademicTermsService(repo as unknown as AcademicTermsRepository);
  });

  it('creates the term, defaulting the enrolment window to unset', async () => {
    const { enrollmentOpensAt, enrollmentClosesAt, ...withoutWindow } = validTerm;

    await service.create('institution-1', withoutWindow);

    expect(repo.assertCodeFree).toHaveBeenCalledWith('institution-1', '2026W');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: 'institution-1',
        code: '2026W',
        enrollmentOpensAt: null,
        enrollmentClosesAt: null,
      }),
    );
    expect(enrollmentOpensAt).toBeInstanceOf(Date);
    expect(enrollmentClosesAt).toBeInstanceOf(Date);
  });

  it('keeps the enrolment window it was given', async () => {
    await service.create('institution-1', validTerm);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollmentOpensAt: validTerm.enrollmentOpensAt,
        enrollmentClosesAt: validTerm.enrollmentClosesAt,
      }),
    );
  });

  it('refuses a term that ends before it starts', async () => {
    await expect(
      service.create('institution-1', { ...validTerm, endsAt: day('2026-09-01') }),
    ).rejects.toThrow(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('refuses a term that ends the instant it starts', async () => {
    await expect(
      service.create('institution-1', { ...validTerm, endsAt: validTerm.startsAt }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses an enrolment window that closes before it opens', async () => {
    await expect(
      service.create('institution-1', {
        ...validTerm,
        enrollmentClosesAt: day('2026-08-01'),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses an enrolment window that outlives the term', async () => {
    await expect(
      service.create('institution-1', {
        ...validTerm,
        enrollmentClosesAt: day('2027-06-01'),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('accepts a half-open window — opens with no close is a term open until it ends', async () => {
    await expect(
      service.create('institution-1', { ...validTerm, enrollmentClosesAt: null }),
    ).resolves.toBeDefined();
  });

  it('checks coherence against the merged row, not just the patch', async () => {
    await expect(
      service.update('institution-1', 'term-1', { startsAt: day('2027-03-01') }),
    ).rejects.toThrow(ConflictError);
  });

  it('only checks the code when the patch changes it', async () => {
    await service.update('institution-1', 'term-1', { name: 'Renamed' });

    expect(repo.assertCodeFree).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith('term-1', { name: 'Renamed' });
  });

  it('404s on a term in another institution', async () => {
    repo.findByIdIn.mockResolvedValue(undefined);

    await expect(service.update('institution-1', 'term-1', { name: 'x' })).rejects.toThrow(
      EntityNotFoundError,
    );
    await expect(service.remove('institution-1', 'term-1')).rejects.toThrow(
      EntityNotFoundError,
    );
  });

  it('retires a term nothing hangs off', async () => {
    await service.remove('institution-1', 'term-1');

    expect(repo.softDelete).toHaveBeenCalledWith('term-1');
  });

  it('refuses to retire a term that still has offerings', async () => {
    repo.countOfferings.mockResolvedValue(3);

    await expect(service.remove('institution-1', 'term-1')).rejects.toThrow(ConflictError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityNotFoundError } from '../../common/errors/domain.error';

import type {
  CoursesCatalogueRepository,
  ProgramsCatalogueRepository,
} from './catalogue.repository';
import { CatalogueService } from './catalogue.service';

describe('CatalogueService', () => {
  const programCalls = {
    listFor: vi.fn(),
    assertCodeFree: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findByIdIn: vi.fn(),
    softDelete: vi.fn(),
  };
  const courseCalls = {
    listFor: vi.fn(),
    assertCodeFree: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findByIdIn: vi.fn(),
    softDelete: vi.fn(),
  };

  let service: CatalogueService;

  beforeEach(() => {
    vi.clearAllMocks();
    programCalls.create.mockImplementation((v: unknown) => Promise.resolve(v));
    programCalls.update.mockImplementation((_id: string, v: unknown) => Promise.resolve(v));
    programCalls.findByIdIn.mockResolvedValue({ id: 'program-1', sourceSystem: 'platform' });
    courseCalls.create.mockImplementation((v: unknown) => Promise.resolve(v));
    courseCalls.update.mockImplementation((_id: string, v: unknown) => Promise.resolve(v));
    courseCalls.findByIdIn.mockResolvedValue({ id: 'course-1', sourceSystem: 'platform' });

    service = new CatalogueService(
      programCalls as unknown as ProgramsCatalogueRepository,
      courseCalls as unknown as CoursesCatalogueRepository,
    );
  });

  describe('programmes', () => {
    it('authors a new programme on the platform, so no import ever matches it', async () => {
      await service.createProgram('institution-1', { code: 'INF-BC', name: 'Informatics' });

      expect(programCalls.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceSystem: 'platform', code: 'INF-BC' }),
      );
    });

    it('refuses a code another programme already holds', async () => {
      programCalls.assertCodeFree.mockRejectedValue(new Error('taken'));

      await expect(
        service.createProgram('institution-1', { code: 'INF-BC', name: 'X' }),
      ).rejects.toThrow();
    });

    it('rejects an edit to a programme that is not this institution’s', async () => {
      programCalls.findByIdIn.mockResolvedValue(undefined);

      await expect(
        service.updateProgram('institution-1', 'program-1', { name: 'X' }),
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('marks a row the registrar owns pending when the platform edits it', async () => {
      programCalls.findByIdIn.mockResolvedValue({ id: 'program-1', sourceSystem: 'sis' });

      await service.updateProgram('institution-1', 'program-1', { name: 'Renamed' });

      expect(programCalls.update).toHaveBeenCalledWith(
        'program-1',
        expect.objectContaining({ name: 'Renamed', synchronizationStatus: 'pending' }),
      );
    });

    it('leaves a platform-authored row’s sync state alone', async () => {
      await service.updateProgram('institution-1', 'program-1', { name: 'Renamed' });

      expect(programCalls.update).toHaveBeenCalledWith(
        'program-1',
        expect.not.objectContaining({ synchronizationStatus: expect.anything() }),
      );
    });

    it('sends only the fields the caller actually named', async () => {
      await service.updateProgram('institution-1', 'program-1', {
        name: 'Renamed',
        code: undefined,
      });

      expect(programCalls.update).toHaveBeenCalledWith('program-1', { name: 'Renamed' });
    });
  });

  describe('courses', () => {
    it('stores credits as the numeric column’s string', async () => {
      await service.createCourse('institution-1', {
        code: 'INF/ALG/22',
        title: 'Algorithms',
        credits: 6,
      });

      expect(courseCalls.create).toHaveBeenCalledWith(
        expect.objectContaining({ credits: '6' }),
      );
    });

    it('accepts a course with no credits at all', async () => {
      await service.createCourse('institution-1', { code: 'X', title: 'X' });

      expect(courseCalls.create).toHaveBeenCalledWith(
        expect.objectContaining({ credits: null }),
      );
    });

    it('clears credits when they are set to null', async () => {
      await service.updateCourse('institution-1', 'course-1', { credits: null });

      expect(courseCalls.update).toHaveBeenCalledWith(
        'course-1',
        expect.objectContaining({ credits: null }),
      );
    });

    it('rejects retiring a course that is not this institution’s', async () => {
      courseCalls.findByIdIn.mockResolvedValue(undefined);

      await expect(service.removeCourse('institution-1', 'course-1')).rejects.toBeInstanceOf(
        EntityNotFoundError,
      );
    });

    it('retires a course by soft-deleting it, not erasing it', async () => {
      await service.removeCourse('institution-1', 'course-1');

      expect(courseCalls.softDelete).toHaveBeenCalledWith('course-1');
    });
  });
});

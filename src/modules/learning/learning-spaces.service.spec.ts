import { describe, expect, it, vi } from 'vitest';

import { PermissionDeniedError } from '../../common/errors/domain.error';
import type { AuthorizationService } from '../authorization/authorization.service';

import type { LearningSpacesRepository, LearningSpaceRow } from './learning-spaces.repository';
import { LEARNING_SPACE_PAGE_SIZE, LearningSpacesService } from './learning-spaces.service';

const INSTITUTION = '0e1b1b6a-2f1e-4a4b-9a4c-2f6f1d3a5b7c';
const OFFERING = 'c2a5f3d1-4b6e-4a2f-9c8d-1e3f5a7b9c0d';
const USER = 'b7f2c1d0-3a4e-4b5c-8d9e-0f1a2b3c4d5e';

const row = (overrides: Partial<LearningSpaceRow> = {}): LearningSpaceRow => ({
  id: 'space',
  name: 'Algorithms',
  shortName: 'ALG/WS26',
  summary: 'Weekly problem sets and lecture notes',
  visible: true,
  offeringId: 'offering',
  courseCode: 'ALG',
  courseTitle: 'Algorithms',
  termCode: 'WS26',
  activityCount: 4,
  nextDueAt: null,
  ...overrides,
});

const service = (
  rows: LearningSpaceRow[],
  counts = { spaces: rows.length, offerings: rows.length },
  mayManage = true,
) => {
  const findSpaces = vi.fn().mockResolvedValue(rows);
  const countSpaces = vi.fn().mockResolvedValue(counts);
  const can = vi.fn().mockResolvedValue(mayManage);
  const repository = { findSpaces, countSpaces } as unknown as LearningSpacesRepository;
  const authorization = { can } as unknown as AuthorizationService;

  return {
    service: new LearningSpacesService(repository, authorization),
    findSpaces,
    countSpaces,
    can,
  };
};

describe('LearningSpacesService', () => {
  describe('the institution-wide index', () => {
    it('says how many offerings are still waiting for a course page', async () => {
      const { service: subject } = service([row()], { spaces: 40, offerings: 112 });

      await expect(subject.listForInstitution(INSTITUTION, USER)).resolves.toMatchObject({
        total: 40,
        offeringsWithoutPage: 72,
      });
    });

    it('counts across the institution, not across one page of results', async () => {
      const { service: subject } = service([row()], { spaces: 250, offerings: 300 });

      const summary = await subject.listForInstitution(INSTITUTION, USER);

      expect(summary.offeringsWithoutPage).toBe(50);
      expect(summary.spaces).toHaveLength(1);
    });

    it('never reports a negative backlog when every offering has a page', async () => {
      const { service: subject } = service([row()], { spaces: 12, offerings: 10 });

      await expect(subject.listForInstitution(INSTITUTION, USER)).resolves.toMatchObject({
        offeringsWithoutPage: 0,
      });
    });

    it('answers with nothing at all before an institution has been set up', async () => {
      const { service: subject } = service([], { spaces: 0, offerings: 0 });

      await expect(subject.listForInstitution(INSTITUTION, USER)).resolves.toEqual({
        total: 0,
        offeringsWithoutPage: 0,
        spaces: [],
      });
    });

    it('asks the repository for one page, scoped to the institution', async () => {
      const { service: subject, findSpaces, countSpaces } = service([row()]);

      await subject.listForInstitution(INSTITUTION, USER);

      expect(findSpaces).toHaveBeenCalledWith(INSTITUTION, LEARNING_SPACE_PAGE_SIZE, undefined);
      expect(countSpaces).toHaveBeenCalledWith(INSTITUTION);
    });

    it('is refused to somebody who cannot administer the institution', async () => {
      const { service: subject, findSpaces } = service([row()], undefined, false);

      await expect(subject.listForInstitution(INSTITUTION, USER)).rejects.toBeInstanceOf(
        PermissionDeniedError,
      );
      expect(findSpaces).not.toHaveBeenCalled();
    });

    it('asks about the right permission, at the institution', async () => {
      const { service: subject, can } = service([row()]);

      await subject.listForInstitution(INSTITUTION, USER);

      expect(can).toHaveBeenCalledWith({
        userId: USER,
        permission: 'offering:manage',
        scope: { type: 'institution', id: INSTITUTION },
      });
    });
  });

  describe('the page on one offering', () => {
    it('narrows the page to that offering', async () => {
      const { service: subject, findSpaces } = service([row()]);

      await subject.listForInstitution(INSTITUTION, USER, OFFERING);

      expect(findSpaces).toHaveBeenCalledWith(INSTITUTION, LEARNING_SPACE_PAGE_SIZE, OFFERING);
    });

    it('is open to a reader who cannot administer anything', async () => {
      const { service: subject, findSpaces } = service([row()], undefined, false);

      await expect(
        subject.listForInstitution(INSTITUTION, USER, OFFERING),
      ).resolves.toMatchObject({ spaces: [expect.objectContaining({ id: 'space' })] });
      expect(findSpaces).toHaveBeenCalled();
    });

    it('does not even ask the permission question', async () => {
      const { service: subject, can } = service([row()]);

      await subject.listForInstitution(INSTITUTION, USER, OFFERING);

      expect(can).not.toHaveBeenCalled();
    });
  });
});

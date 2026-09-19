import { describe, expect, it, vi } from 'vitest';

import type { LearningSpacesRepository, LearningSpaceRow } from './learning-spaces.repository';
import { LEARNING_SPACE_PAGE_SIZE, LearningSpacesService } from './learning-spaces.service';

const INSTITUTION = '0e1b1b6a-2f1e-4a4b-9a4c-2f6f1d3a5b7c';
const OFFERING = 'c2a5f3d1-4b6e-4a2f-9c8d-1e3f5a7b9c0d';

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
  counts = {
    total: rows.length,
    linked: rows.filter((entry) => entry.offeringId !== null).length,
  },
) => {
  const findSpaces = vi.fn().mockResolvedValue(rows);
  const countSpaces = vi.fn().mockResolvedValue(counts);
  const repository = { findSpaces, countSpaces } as unknown as LearningSpacesRepository;

  return { service: new LearningSpacesService(repository), findSpaces, countSpaces };
};

describe('LearningSpacesService', () => {
  it('separates the spaces matched to an offering from the orphans', async () => {
    const { service: subject } = service([
      row({ id: 'a' }),
      row({ id: 'b', offeringId: null, courseCode: null, courseTitle: null }),
      row({ id: 'c' }),
    ]);

    await expect(subject.listForInstitution(INSTITUTION)).resolves.toMatchObject({
      total: 3,
      linked: 2,
      unlinked: 1,
    });
  });

  it('reports every space as unlinked when the SIS half has not run', async () => {
    const { service: subject } = service([row({ offeringId: null })], {
      total: 1,
      linked: 0,
    });

    await expect(subject.listForInstitution(INSTITUTION)).resolves.toMatchObject({
      linked: 0,
      unlinked: 1,
    });
  });

  it('counts linked spaces across the institution, not across one page', async () => {
    const { service: subject } = service([row()], { total: 250, linked: 200 });

    const summary = await subject.listForInstitution(INSTITUTION);

    expect(summary.total).toBe(250);
    expect(summary.linked).toBe(200);
    expect(summary.unlinked).toBe(50);
    expect(summary.spaces).toHaveLength(1);
  });

  it('answers with no spaces at all before anything is imported', async () => {
    const { service: subject } = service([], { total: 0, linked: 0 });

    await expect(subject.listForInstitution(INSTITUTION)).resolves.toEqual({
      total: 0,
      linked: 0,
      unlinked: 0,
      spaces: [],
    });
  });

  it('asks the repository for one page, scoped to the institution', async () => {
    const { service: subject, findSpaces, countSpaces } = service([row()]);

    await subject.listForInstitution(INSTITUTION);

    expect(findSpaces).toHaveBeenCalledWith(INSTITUTION, LEARNING_SPACE_PAGE_SIZE, undefined);
    expect(countSpaces).toHaveBeenCalledWith(INSTITUTION);
  });

  it('narrows the page to one offering when asked', async () => {
    const { service: subject, findSpaces } = service([row()]);

    await subject.listForInstitution(INSTITUTION, OFFERING);

    expect(findSpaces).toHaveBeenCalledWith(INSTITUTION, LEARNING_SPACE_PAGE_SIZE, OFFERING);
  });
});

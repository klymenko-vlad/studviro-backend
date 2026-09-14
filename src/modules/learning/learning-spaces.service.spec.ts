import { describe, expect, it, vi } from 'vitest';

import type { LearningSpacesRepository, LearningSpaceRow } from './learning-spaces.repository';
import { LEARNING_SPACE_PAGE_SIZE, LearningSpacesService } from './learning-spaces.service';

const INSTITUTION = '0e1b1b6a-2f1e-4a4b-9a4c-2f6f1d3a5b7c';

const row = (overrides: Partial<LearningSpaceRow> = {}): LearningSpaceRow => ({
  id: 'space',
  name: 'Algorithms',
  shortName: 'ALG/WS26',
  url: 'https://moodle.example/course/view.php?id=1',
  visible: true,
  externalId: 'LMS-1',
  lastSynchronizedAt: new Date('2026-09-14T00:00:00.000Z'),
  offeringId: 'offering',
  courseCode: 'ALG',
  courseTitle: 'Algorithms',
  termCode: 'WS26',
  activityCount: 4,
  nextDueAt: null,
  ...overrides,
});

const service = (rows: LearningSpaceRow[], total = rows.length) => {
  const findSpaces = vi.fn().mockResolvedValue(rows);
  const countSpaces = vi.fn().mockResolvedValue(total);
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
    const { service: subject } = service([row({ offeringId: null })]);

    await expect(subject.listForInstitution(INSTITUTION)).resolves.toMatchObject({
      linked: 0,
      unlinked: 1,
    });
  });

  it('reports the institution-wide total even when the page is shorter', async () => {
    const { service: subject } = service([row()], 250);

    const summary = await subject.listForInstitution(INSTITUTION);

    expect(summary.total).toBe(250);
    expect(summary.spaces).toHaveLength(1);
  });

  it('answers with no spaces at all before anything is imported', async () => {
    const { service: subject } = service([], 0);

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

    expect(findSpaces).toHaveBeenCalledWith(INSTITUTION, LEARNING_SPACE_PAGE_SIZE);
    expect(countSpaces).toHaveBeenCalledWith(INSTITUTION);
  });
});

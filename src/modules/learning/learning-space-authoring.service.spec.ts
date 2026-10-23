import { describe, expect, it, vi } from 'vitest';

import type { TransactionHost } from '../../database/transaction.host';

import type { AssignmentAnnouncementsService } from './assignment-announcements.service';
import type { LearningAccessService, LearningStance } from './learning-access.service';
import { LearningSpaceAuthoringService } from './learning-space-authoring.service';

const INSTITUTION = '0e1b1b6a-2f1e-4a4b-9a4c-2f6f1d3a5b7c';
const OFFERING = 'c2a5f3d1-4b6e-4a2f-9c8d-1e3f5a7b9c0d';
const TEACHER = '7d9c1e2f-3a4b-4c5d-8e9f-0a1b2c3d4e5f';

const denied = Object.assign(new Error('denied'), { code: 'LEARNING_AUTHORING_DENIED' });

const build = (stance: LearningStance) => {
  const created = { id: 'space-1', name: 'Algorithms' };
  const insert = vi.fn().mockReturnValue({
    values: () => ({ returning: () => Promise.resolve([created]) }),
  });
  const update = vi.fn().mockReturnValue({
    set: () => ({ where: () => ({ returning: () => Promise.resolve([created]) }) }),
  });
  const select = vi.fn().mockReturnValue({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
  });

  const txHost = {
    run: (fn: () => Promise<unknown>) => fn(),
    client: () => ({ insert, update, select }),
  } as unknown as TransactionHost;

  const assertOffering = vi.fn().mockResolvedValue(undefined);
  const assertAuthorOfOffering = vi.fn(() =>
    stance === 'author' ? Promise.resolve() : Promise.reject(denied),
  );
  const contextForSpace = vi.fn().mockResolvedValue({ stance });
  const assertAuthor = vi.fn((context: { stance: LearningStance }) => {
    if (context.stance !== 'author') throw denied;
  });

  const access = {
    assertOffering,
    assertAuthorOfOffering,
    contextForSpace,
    assertAuthor,
  } as unknown as LearningAccessService;

  const announceNewlySeen = vi.fn().mockResolvedValue(0);
  const announcements = { announceNewlySeen } as unknown as AssignmentAnnouncementsService;

  return {
    service: new LearningSpaceAuthoringService(txHost, access, announcements),
    announceNewlySeen,
    assertAuthorOfOffering,
    insert,
    update,
  };
};

const newSpace = { courseOfferingId: OFFERING, name: 'Algorithms' };

describe('LearningSpaceAuthoringService', () => {
  describe('opening a space', () => {
    it('lets the teacher of the offering open its space', async () => {
      const { service, assertAuthorOfOffering, insert } = build('author');

      await expect(service.create(INSTITUTION, newSpace, TEACHER)).resolves.toMatchObject({
        id: 'space-1',
      });
      expect(assertAuthorOfOffering).toHaveBeenCalledWith(INSTITUTION, OFFERING, TEACHER);
      expect(insert).toHaveBeenCalled();
    });

    it('refuses somebody who neither teaches the offering nor administers it', async () => {
      const { service, insert } = build('participant');

      await expect(service.create(INSTITUTION, newSpace, TEACHER)).rejects.toMatchObject({
        code: 'LEARNING_AUTHORING_DENIED',
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it('asks who the caller is before writing anything', async () => {
      const { service, insert } = build('observer');

      await expect(service.create(INSTITUTION, newSpace, TEACHER)).rejects.toThrow();
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe('changing a space', () => {
    it('lets an author rename and publish it', async () => {
      const { service, update, announceNewlySeen } = build('author');

      await expect(
        service.update(INSTITUTION, 'space-1', { visible: true }, TEACHER),
      ).resolves.toMatchObject({ id: 'space-1' });
      expect(update).toHaveBeenCalled();
      expect(announceNewlySeen).toHaveBeenCalledWith(expect.any(Date), 'space-1');
    });

    it('refuses a participant, who may read the space but not author it', async () => {
      const { service, update } = build('participant');

      await expect(
        service.update(INSTITUTION, 'space-1', { visible: true }, TEACHER),
      ).rejects.toMatchObject({ code: 'LEARNING_AUTHORING_DENIED' });
      expect(update).not.toHaveBeenCalled();
    });
  });
});

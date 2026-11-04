import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import { learningSpaces, type LearningSpace } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { AssignmentAnnouncementsService } from './assignment-announcements.service';
import { LearningAccessService } from './learning-access.service';

export interface NewLearningSpace {
  readonly courseOfferingId: string;
  readonly name: string;
  readonly shortName?: string | null;
  readonly summary?: string | null;
  readonly visible?: boolean;
}

export type LearningSpaceChanges = Partial<Omit<NewLearningSpace, 'courseOfferingId'>>;

/**
 * The course's own page, authored rather than imported. One per offering —
 * the unique index has always said so, and now something has to enforce it on
 * the way in rather than discovering it on the way out.
 */
@Injectable()
export class LearningSpaceAuthoringService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly announcements: AssignmentAnnouncementsService,
  ) {}

  async findOne(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<LearningSpace> {
    const { space } = await this.access.contextForSpace(institutionId, spaceId, userId);

    return space;
  }

  async create(
    institutionId: string,
    input: NewLearningSpace,
    userId: string,
  ): Promise<LearningSpace> {
    return this.txHost.run(async () => {
      await this.access.assertOffering(institutionId, input.courseOfferingId);
      await this.access.assertAuthorOfOffering(institutionId, input.courseOfferingId, userId);
      await this.assertOfferingFree(institutionId, input.courseOfferingId);

      const [created] = await this.client
        .insert(learningSpaces)
        .values({
          institutionId,
          courseOfferingId: input.courseOfferingId,
          name: input.name,
          shortName: input.shortName ?? null,
          summary: input.summary ?? null,
          visible: input.visible ?? false,
        })
        .returning();

      if (!created) {
        throw new ConflictError('LEARNING_SPACE_NOT_CREATED', 'The space was not created');
      }

      return created;
    });
  }

  async update(
    institutionId: string,
    spaceId: string,
    changes: LearningSpaceChanges,
    userId: string,
    now = new Date(),
  ): Promise<LearningSpace> {
    return this.txHost.run(async () => {
      this.access.assertAuthor(
        await this.access.contextForSpace(institutionId, spaceId, userId),
      );

      const [updated] = await this.client
        .update(learningSpaces)
        .set({
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.shortName === undefined ? {} : { shortName: changes.shortName }),
          ...(changes.summary === undefined ? {} : { summary: changes.summary }),
          ...(changes.visible === undefined ? {} : { visible: changes.visible }),
        })
        .where(
          and(
            eq(learningSpaces.id, spaceId),
            eq(learningSpaces.institutionId, institutionId),
            isNull(learningSpaces.deletedAt),
          ),
        )
        .returning();

      if (!updated) throw new EntityNotFoundError('learning_space', spaceId);

      await this.announcements.announceNewlySeen(now, spaceId);

      return updated;
    });
  }

  private async assertOfferingFree(institutionId: string, offeringId: string): Promise<void> {
    const [taken] = await this.client
      .select({ id: learningSpaces.id })
      .from(learningSpaces)
      .where(
        and(
          eq(learningSpaces.courseOfferingId, offeringId),
          eq(learningSpaces.institutionId, institutionId),
          isNull(learningSpaces.deletedAt),
        ),
      )
      .limit(1);

    if (taken) {
      throw new ConflictError(
        'LEARNING_SPACE_EXISTS',
        'This offering already has a learning space',
        { learningSpaceId: taken.id },
      );
    }
  }

  private get client() {
    return this.txHost.client();
  }
}

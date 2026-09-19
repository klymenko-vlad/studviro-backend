import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, max } from 'drizzle-orm';

import {
  EntityNotFoundError,
  InvalidInputError,
  ConflictError,
} from '../../common/errors/domain.error';
import {
  learningMaterials,
  type LearningMaterial,
  type LearningMaterialKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { StorageService } from '../storage/storage.service';
import type { UploadTicket } from '../storage/storage.types';

import { LearningAccessService } from './learning-access.service';
import { assertPayloadMatchesKind } from './learning-material-payload';

export const MATERIAL_PURPOSE = 'materials';

export interface NewLearningMaterial {
  readonly kind: LearningMaterialKind;
  readonly title: string;
  readonly description?: string | null;
  readonly body?: string | null;
  readonly url?: string | null;
  readonly storageKey?: string | null;
  readonly filename?: string | null;
  readonly visible?: boolean;
}

export type LearningMaterialChanges = Partial<Omit<NewLearningMaterial, 'kind'>> & {
  readonly position?: number;
};

/**
 * Files, links and paragraphs pinned to a course page. A file is not streamed
 * through here: the client takes an upload ticket, PUTs to the store and comes
 * back with the key, and this asks the store what it actually received before
 * the row exists (ADR 0027).
 */
@Injectable()
export class LearningMaterialsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly storage: StorageService,
  ) {}

  async list(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<LearningMaterial[]> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);

    const rows = await this.reader
      .select()
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.learningSpaceId, spaceId),
          isNull(learningMaterials.deletedAt),
        ),
      )
      .orderBy(asc(learningMaterials.position), asc(learningMaterials.createdAt));

    return context.stance === 'author' ? rows : rows.filter((row) => row.visible);
  }

  async createUploadTicket(
    institutionId: string,
    spaceId: string,
    userId: string,
    file: { filename: string; contentType: string },
  ): Promise<UploadTicket> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    return this.storage.createUploadTicket({
      institutionId,
      purpose: MATERIAL_PURPOSE,
      filename: file.filename,
      contentType: file.contentType,
    });
  }

  async create(
    institutionId: string,
    spaceId: string,
    userId: string,
    input: NewLearningMaterial,
  ): Promise<LearningMaterial> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    assertPayloadMatchesKind(input);
    const stored =
      input.kind === 'file' && input.storageKey
        ? await this.storage.confirm(input.storageKey, institutionId)
        : undefined;

    return this.txHost.run(async () => {
      const [created] = await this.client
        .insert(learningMaterials)
        .values({
          institutionId,
          learningSpaceId: spaceId,
          kind: input.kind,
          title: input.title,
          description: input.description ?? null,
          body: input.kind === 'text' ? (input.body ?? null) : null,
          url: input.kind === 'link' ? (input.url ?? null) : null,
          storageKey: stored?.key ?? null,
          filename: stored === undefined ? null : (input.filename ?? null),
          contentType: stored?.contentType ?? null,
          sizeBytes: stored?.sizeBytes ?? null,
          position: await this.nextPosition(spaceId),
          visible: input.visible ?? true,
          createdById: userId,
        })
        .returning();

      if (!created) {
        throw new ConflictError('LEARNING_MATERIAL_NOT_CREATED', 'The material was not added');
      }

      return created;
    });
  }

  async update(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
    changes: LearningMaterialChanges,
  ): Promise<LearningMaterial> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const existing = await this.materialOrFail(spaceId, materialId);
    assertPayloadMatchesKind({ ...existing, ...changes });

    const [updated] = await this.client
      .update(learningMaterials)
      .set({
        ...(changes.title === undefined ? {} : { title: changes.title }),
        ...(changes.description === undefined ? {} : { description: changes.description }),
        ...(changes.body === undefined || existing.kind !== 'text'
          ? {}
          : { body: changes.body }),
        ...(changes.url === undefined || existing.kind !== 'link' ? {} : { url: changes.url }),
        ...(changes.visible === undefined ? {} : { visible: changes.visible }),
        ...(changes.position === undefined ? {} : { position: changes.position }),
      })
      .where(eq(learningMaterials.id, materialId))
      .returning();

    if (!updated) throw new EntityNotFoundError('learning_material', materialId);

    return updated;
  }

  async remove(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<void> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    await this.materialOrFail(spaceId, materialId);

    await this.client
      .update(learningMaterials)
      .set({ deletedAt: new Date() })
      .where(eq(learningMaterials.id, materialId));
  }

  async downloadUrl(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<string> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    const material = await this.materialOrFail(spaceId, materialId);

    if (!material.visible && context.stance !== 'author') {
      throw new EntityNotFoundError('learning_material', materialId);
    }

    if (material.kind !== 'file' || material.storageKey === null) {
      throw new InvalidInputError(
        'LEARNING_MATERIAL_NOT_A_FILE',
        'Only a file material can be downloaded',
      );
    }

    return this.storage.createDownloadUrl(
      material.storageKey,
      institutionId,
      material.filename ?? undefined,
    );
  }

  private async nextPosition(spaceId: string): Promise<number> {
    const [row] = await this.client
      .select({ highest: max(learningMaterials.position) })
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.learningSpaceId, spaceId),
          isNull(learningMaterials.deletedAt),
        ),
      );

    return (row?.highest ?? -1) + 1;
  }

  private async materialOrFail(spaceId: string, materialId: string): Promise<LearningMaterial> {
    const [row] = await this.client
      .select()
      .from(learningMaterials)
      .where(
        and(
          eq(learningMaterials.id, materialId),
          eq(learningMaterials.learningSpaceId, spaceId),
          isNull(learningMaterials.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('learning_material', materialId);

    return row;
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}

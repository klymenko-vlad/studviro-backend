import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  EntityNotFoundError,
  InvalidInputError,
  ConflictError,
} from '../../common/errors/domain.error';
import {
  learningMaterials,
  type CompletionRule,
  type LearningMaterial,
  type LearningMaterialKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { assertNotInfected } from '../storage/assert-not-infected';
import { StorageService } from '../storage/storage.service';
import type { UploadTicket } from '../storage/storage.types';

import { assertCompletionRule } from './completion-rule';
import { CompletionService } from './completion.service';
import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import {
  assertAvailabilityWindow,
  availabilityChanges,
  teaserOf,
} from './learning-availability';
import { assertPayloadMatchesKind } from './learning-material-payload';
import { LearningOutlineService, type Placement } from './learning-outline.service';

export const MATERIAL_PURPOSE = 'materials';

const MATERIAL_CONTENT = [
  'description',
  'body',
  'url',
  'storageKey',
  'filename',
  'contentType',
  'sizeBytes',
] as const;

export interface NewLearningMaterial {
  readonly kind: LearningMaterialKind;
  readonly title: string;
  readonly description?: string | null;
  readonly body?: string | null;
  readonly url?: string | null;
  readonly storageKey?: string | null;
  readonly filename?: string | null;
  readonly visible?: boolean;
  readonly sectionId?: string | null;
  readonly availableFrom?: Date | null;
  readonly availableUntil?: Date | null;
  readonly hiddenUntilAvailable?: boolean;
  readonly completionRule?: CompletionRule;
}

export type LearningMaterialChanges = Partial<Omit<NewLearningMaterial, 'kind'>> & {
  readonly position?: number;
};

@Injectable()
export class LearningMaterialsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly storage: StorageService,
    private readonly outline: LearningOutlineService,
    private readonly completion: CompletionService,
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

    return this.outline.sift(context.stance, spaceId, rows, {
      itemOf: (row) => row,
      teaser: (row) => teaserOf(row, MATERIAL_CONTENT),
    });
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
    assertAvailabilityWindow(input);
    assertCompletionRule({ kind: 'material', rule: input.completionRule ?? 'none' });
    await this.outline.assertSectionOf(spaceId, input.sectionId);
    const sectionId = input.sectionId ?? null;
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
          scanStatus: stored?.scanStatus ?? 'unscanned',
          sectionId,
          position: await this.outline.nextPosition(spaceId, sectionId),
          visible: input.visible ?? true,
          availableFrom: input.availableFrom ?? null,
          availableUntil: input.availableUntil ?? null,
          hiddenUntilAvailable: input.hiddenUntilAvailable ?? false,
          completionRule: input.completionRule ?? 'none',
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
    assertAvailabilityWindow({ ...existing, ...changes });
    if (changes.completionRule !== undefined) {
      assertCompletionRule({ kind: 'material', rule: changes.completionRule });
    }
    const placement = await this.outline.placement(spaceId, existing.sectionId, changes);
    const ruleChanged =
      changes.completionRule !== undefined &&
      changes.completionRule !== existing.completionRule;

    return this.txHost.run(async () => {
      const updated = await this.write(materialId, existing, changes, placement);
      if (ruleChanged) await this.completion.recompute({ kind: 'material', id: materialId });

      return updated;
    });
  }

  async view(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<void> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    const material = await this.materialOrFail(spaceId, materialId);
    await this.assertOpenTo(context, material);
    await this.recordView(institutionId, context, material, userId);
  }

  private async write(
    materialId: string,
    existing: LearningMaterial,
    changes: LearningMaterialChanges,
    placement: Placement,
  ): Promise<LearningMaterial> {
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
        ...(changes.completionRule === undefined
          ? {}
          : { completionRule: changes.completionRule }),
        ...availabilityChanges(changes),
        ...placement,
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
    await this.assertOpenTo(context, material);

    if (material.kind !== 'file' || material.storageKey === null) {
      throw new InvalidInputError(
        'LEARNING_MATERIAL_NOT_A_FILE',
        'Only a file material can be downloaded',
      );
    }

    assertNotInfected(material.scanStatus);
    await this.recordView(institutionId, context, material, userId);

    return this.storage.createDownloadUrl(
      material.storageKey,
      institutionId,
      material.filename ?? undefined,
    );
  }

  private async assertOpenTo(
    context: LearningSpaceContext,
    material: LearningMaterial,
  ): Promise<void> {
    if (!(await this.outline.isOpenTo(context.stance, material.learningSpaceId, material))) {
      throw new EntityNotFoundError('learning_material', material.id);
    }
  }

  private async recordView(
    institutionId: string,
    context: LearningSpaceContext,
    material: LearningMaterial,
    userId: string,
  ): Promise<void> {
    if (context.stance !== 'participant') return;

    await this.completion.recordView(institutionId, userId, {
      kind: 'material',
      id: material.id,
    });
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

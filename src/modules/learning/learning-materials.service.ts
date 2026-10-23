import { Injectable } from '@nestjs/common';

import type {
  CompletionRule,
  LearningMaterial,
  LearningMaterialKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
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
import { AvailabilityService, type Gated } from './learning-availability.service';
import { assertPayloadMatchesKind } from './learning-material-payload';
import { LearningMaterialsRepository } from './learning-materials.repository';
import { LearningOutlineService } from './learning-outline.service';
import type { RestrictionInput } from './restriction';
import type { AudienceInput } from './restriction-audience';
import { RestrictionRulesService } from './restriction-rules.service';

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
  readonly restriction?: RestrictionInput | null;
  readonly audience?: AudienceInput | null;
}

export type LearningMaterialChanges = Partial<Omit<NewLearningMaterial, 'kind'>> & {
  readonly position?: number;
};

@Injectable()
export class LearningMaterialsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly materials: LearningMaterialsRepository,
    private readonly storage: StorageService,
    private readonly outline: LearningOutlineService,
    private readonly completion: CompletionService,
    private readonly availability: AvailabilityService,
    private readonly restrictions: RestrictionRulesService,
  ) {}

  async list(
    institutionId: string,
    spaceId: string,
    userId: string,
  ): Promise<Gated<LearningMaterial>[]> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);

    return this.listFor(context);
  }

  async listFor(context: LearningSpaceContext): Promise<Gated<LearningMaterial>[]> {
    const rows = await this.materials.listLive(context.space.id);

    return this.availability.sift(context, rows, {
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
  ): Promise<Gated<LearningMaterial>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    assertPayloadMatchesKind(input);
    assertAvailabilityWindow(input);
    assertCompletionRule({ kind: 'material', rule: input.completionRule ?? 'none' });
    await this.outline.assertSectionOf(spaceId, input.sectionId);
    const sectionId = input.sectionId ?? null;
    const { restriction = null } = await this.restrictions.settle(
      { spaceId, offeringId: context.offeringId, key: null, sectionId, restriction: null },
      { input: input.restriction, audience: input.audience },
    );
    const stored =
      input.kind === 'file' && input.storageKey
        ? await this.storage.confirm(input.storageKey, institutionId)
        : undefined;

    return this.txHost.run(async () => {
      const created = await this.materials.insert({
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
        restriction,
        createdById: userId,
      });

      return this.availability.gated(context, created);
    });
  }

  async update(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
    changes: LearningMaterialChanges,
  ): Promise<Gated<LearningMaterial>> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    const existing = await this.materials.findLiveOrFail(spaceId, materialId);
    assertPayloadMatchesKind({ ...existing, ...changes });
    assertAvailabilityWindow({ ...existing, ...changes });
    if (changes.completionRule !== undefined) {
      assertCompletionRule({ kind: 'material', rule: changes.completionRule });
    }
    const placement = await this.outline.placement(spaceId, existing.sectionId, changes);
    const restriction = await this.restrictions.settle(
      {
        spaceId,
        offeringId: context.offeringId,
        key: `material:${materialId}`,
        sectionId: placement.sectionId === undefined ? existing.sectionId : placement.sectionId,
        restriction: existing.restriction,
      },
      {
        input: changes.restriction,
        audience: changes.audience,
        moved: placement.sectionId !== undefined,
      },
    );
    const ruleChanged =
      changes.completionRule !== undefined &&
      changes.completionRule !== existing.completionRule;

    return this.txHost.run(async () => {
      const updated = await this.materials.update(materialId, {
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
        ...restriction,
      });
      if (ruleChanged) await this.completion.recompute({ kind: 'material', id: materialId });

      return this.availability.gated(context, updated);
    });
  }

  async remove(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<void> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    this.access.assertAuthor(context);

    await this.materials.findLiveOrFail(spaceId, materialId);
    await this.materials.tombstone(materialId);
  }
}

import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, InvalidInputError } from '../../common/errors/domain.error';
import type { LearningMaterial } from '../../database/schema';
import { assertNotInfected } from '../storage/assert-not-infected';
import { StorageService } from '../storage/storage.service';

import { CompletionService } from './completion.service';
import { LearningAccessService, type LearningSpaceContext } from './learning-access.service';
import { AvailabilityService, type Gated } from './learning-availability.service';
import { LearningMaterialsRepository } from './learning-materials.repository';

export interface OpenedMaterial {
  readonly context: LearningSpaceContext;
  readonly material: LearningMaterial;
}

@Injectable()
export class MaterialOpeningService {
  constructor(
    private readonly access: LearningAccessService,
    private readonly materials: LearningMaterialsRepository,
    private readonly availability: AvailabilityService,
    private readonly completion: CompletionService,
    private readonly storage: StorageService,
  ) {}

  async open(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<OpenedMaterial> {
    const context = await this.access.contextForSpace(institutionId, spaceId, userId);
    const material = await this.materials.findLiveOrFail(spaceId, materialId);
    if (!(await this.availability.isOpenTo(context, material))) {
      throw new EntityNotFoundError('learning_material', material.id);
    }

    return { context, material };
  }

  async read(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<Gated<LearningMaterial>> {
    const opened = await this.open(institutionId, spaceId, materialId, userId);
    await this.recordView(institutionId, opened);

    return this.availability.gated(opened.context, opened.material);
  }

  async view(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<void> {
    const opened = await this.open(institutionId, spaceId, materialId, userId);
    await this.recordView(institutionId, opened);
  }

  async downloadUrl(
    institutionId: string,
    spaceId: string,
    materialId: string,
    userId: string,
  ): Promise<string> {
    const opened = await this.open(institutionId, spaceId, materialId, userId);
    const { material } = opened;

    if (material.kind !== 'file' || material.storageKey === null) {
      throw new InvalidInputError(
        'LEARNING_MATERIAL_NOT_A_FILE',
        'Only a file material can be downloaded',
      );
    }

    assertNotInfected(material.scanStatus);
    await this.recordView(institutionId, opened);

    return this.storage.createDownloadUrl(
      material.storageKey,
      institutionId,
      material.filename ?? undefined,
    );
  }

  async recordView(
    institutionId: string,
    { context, material }: OpenedMaterial,
  ): Promise<void> {
    if (context.stance !== 'participant') return;

    await this.completion.recordView(institutionId, context.userId, {
      kind: 'material',
      id: material.id,
    });
  }
}

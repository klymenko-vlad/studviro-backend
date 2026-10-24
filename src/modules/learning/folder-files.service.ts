import { Injectable } from '@nestjs/common';

import { ConflictError, InvalidInputError } from '../../common/errors/domain.error';
import type { LearningMaterial, LearningMaterialFile } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { assertNotInfected } from '../storage/assert-not-infected';
import { StorageService } from '../storage/storage.service';

import { FolderFilesRepository, type FolderFileQuery } from './folder-files.repository';
import { LearningAccessService } from './learning-access.service';
import { MaterialOpeningService, type OpenedMaterial } from './material-opening.service';

export const MAX_FOLDER_FILES = 100;

export interface FolderFilePage {
  readonly files: LearningMaterialFile[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface FolderFileRef {
  readonly institutionId: string;
  readonly spaceId: string;
  readonly materialId: string;
  readonly userId: string;
}

@Injectable()
export class FolderFilesService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly opening: MaterialOpeningService,
    private readonly files: FolderFilesRepository,
    private readonly storage: StorageService,
  ) {}

  async list(ref: FolderFileRef, query: FolderFileQuery): Promise<FolderFilePage> {
    await this.openFolder(ref);
    const { files, total } = await this.files.page(ref.materialId, query);

    return { files, total, page: query.page, limit: query.limit };
  }

  async add(
    ref: FolderFileRef,
    file: { storageKey: string; filename: string },
  ): Promise<LearningMaterialFile> {
    const { material } = await this.authorFolder(ref);
    if ((await this.files.countLive(material.id)) >= MAX_FOLDER_FILES) {
      throw new ConflictError('LEARNING_FOLDER_FULL', 'A folder holds at most 100 files', {
        limit: MAX_FOLDER_FILES,
      });
    }
    const stored = await this.storage.confirm(file.storageKey, ref.institutionId);

    return this.txHost.run(() =>
      this.files.insert({
        institutionId: ref.institutionId,
        learningMaterialId: material.id,
        storageKey: stored.key,
        filename: file.filename,
        contentType: stored.contentType ?? 'application/octet-stream',
        sizeBytes: stored.sizeBytes,
        scanStatus: stored.scanStatus,
      }),
    );
  }

  async remove(ref: FolderFileRef, fileId: string): Promise<void> {
    const { material } = await this.authorFolder(ref);
    await this.files.findLiveOrFail(material.id, fileId);
    await this.files.tombstone(fileId);
  }

  async downloadUrl(ref: FolderFileRef, fileId: string): Promise<string> {
    const opened = await this.openFolder(ref);
    const file = await this.files.findLiveOrFail(opened.material.id, fileId);
    if (file.storageKey === null) {
      throw new InvalidInputError('LEARNING_MATERIAL_NOT_A_FILE', 'That file is gone');
    }

    assertNotInfected(file.scanStatus);
    await this.opening.recordView(ref.institutionId, opened);

    return this.storage.createDownloadUrl(file.storageKey, ref.institutionId, file.filename);
  }

  private async openFolder(ref: FolderFileRef): Promise<OpenedMaterial> {
    const opened = await this.opening.open(
      ref.institutionId,
      ref.spaceId,
      ref.materialId,
      ref.userId,
    );
    assertFolder(opened.material);

    return opened;
  }

  private async authorFolder(ref: FolderFileRef): Promise<OpenedMaterial> {
    const opened = await this.openFolder(ref);
    this.access.assertAuthor(opened.context);

    return opened;
  }
}

function assertFolder(material: LearningMaterial): void {
  if (material.kind !== 'folder') {
    throw new InvalidInputError(
      'LEARNING_MATERIAL_NOT_A_FOLDER',
      'Only a folder holds files of its own',
    );
  }
}

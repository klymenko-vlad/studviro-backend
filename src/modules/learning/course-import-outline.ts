import type {
  LearningMaterial,
  LearningMaterialFile,
  LearningSection,
} from '../../database/schema';

import { byPlace, type ImportPlanContext } from './course-import-context';
import { copiesFolderFile } from './course-import-files';
import type { ImportRows } from './course-import.types';

export function planSections(
  context: ImportPlanContext,
  sections: readonly LearningSection[],
): ImportRows['sections'] {
  const { institutionId, spaceId, visibility } = context.input;

  return [...sections].sort(byPlace).map((section, index) => {
    const { restriction, lostGroups } = context.restrictionOf(
      section.restriction,
      section.title,
    );

    return {
      id: context.sectionIdOf(section.id),
      institutionId,
      learningSpaceId: spaceId,
      title: section.title,
      summary: section.summary,
      position: index,
      visible: section.visible && !lostGroups && visibility === 'source',
      availableFrom: context.shifted(section.availableFrom),
      availableUntil: context.shifted(section.availableUntil),
      hiddenUntilAvailable: section.hiddenUntilAvailable,
      restriction,
    };
  });
}

export function planMaterials(
  context: ImportPlanContext,
  materials: readonly LearningMaterial[],
): ImportRows['materials'] {
  const { institutionId, spaceId, userId } = context.input;

  return materials.flatMap((material) => {
    const id = context.materialIdOf(material.id);
    if (id === undefined) return [];

    const place = context.placeOf(material);
    const { restriction, lostGroups } = context.restrictionOf(
      material.restriction,
      material.title,
    );
    const storageKey =
      material.kind === 'file' && material.storageKey !== null
        ? context.copyOf(material.storageKey, material.filename ?? material.title)
        : null;

    return [
      {
        id,
        institutionId,
        learningSpaceId: spaceId,
        ...place,
        kind: material.kind,
        title: material.title,
        description: material.description,
        body: material.body,
        url: material.url,
        storageKey,
        filename: material.filename,
        contentType: material.contentType,
        sizeBytes: material.sizeBytes,
        scanStatus: material.scanStatus,
        visible: context.visibleOf(place.sectionId, material.visible, lostGroups),
        availableFrom: context.shifted(material.availableFrom),
        availableUntil: context.shifted(material.availableUntil),
        hiddenUntilAvailable: material.hiddenUntilAvailable,
        restriction,
        completionRule: material.completionRule,
        createdById: userId,
      },
    ];
  });
}

export function planFolderFiles(
  context: ImportPlanContext,
  files: readonly LearningMaterialFile[],
): ImportRows['folderFiles'] {
  return files.flatMap((file) => {
    const folderId = context.materialIdOf(file.learningMaterialId);
    if (folderId === undefined || !copiesFolderFile(file, context.flags)) return [];
    if (file.storageKey === null) return [];

    return [
      {
        institutionId: context.input.institutionId,
        learningMaterialId: folderId,
        storageKey: context.copyOf(file.storageKey, file.filename),
        filename: file.filename,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        scanStatus: file.scanStatus,
      },
    ];
  });
}

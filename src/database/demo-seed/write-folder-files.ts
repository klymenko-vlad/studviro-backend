import { randomUUID } from 'node:crypto';

import type { Database } from '../database.tokens';
import { learningMaterialFiles } from '../schema';

import type { PlannedFolderFile } from './derive-learning';

export type SeedObjectStore = (key: string, body: string, contentType: string) => Promise<void>;

const CONTENT_TYPE = 'text/plain';
const PARALLEL_PUTS = 16;

export async function writeFolderFiles(
  db: Database,
  institutionId: string,
  files: readonly PlannedFolderFile[],
  materialIds: ReadonlyMap<string, string>,
  store: SeedObjectStore | undefined,
): Promise<number> {
  if (store === undefined) return 0;

  const rows = files.flatMap((file) => {
    const learningMaterialId = materialIds.get(file.materialKey);
    if (learningMaterialId === undefined) return [];

    return [
      {
        file,
        row: {
          institutionId,
          learningMaterialId,
          storageKey: `institutions/${institutionId}/materials/${randomUUID()}/${file.filename}`,
          filename: file.filename,
          contentType: CONTENT_TYPE,
          sizeBytes: Buffer.byteLength(file.body),
          scanStatus: 'unscanned' as const,
        },
      },
    ];
  });

  for (let offset = 0; offset < rows.length; offset += PARALLEL_PUTS) {
    await Promise.all(
      rows
        .slice(offset, offset + PARALLEL_PUTS)
        .map(({ file, row }) => store(row.storageKey, file.body, CONTENT_TYPE)),
    );
  }
  if (rows.length > 0)
    await db.insert(learningMaterialFiles).values(rows.map(({ row }) => row));

  return rows.length;
}

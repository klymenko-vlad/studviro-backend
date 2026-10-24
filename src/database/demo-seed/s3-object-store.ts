import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { SeedObjectStore } from './write-folder-files';

export function s3ObjectStoreFromEnv(env: NodeJS.ProcessEnv): SeedObjectStore | undefined {
  if (env.STORAGE_ENABLED !== 'true' || !env.STORAGE_BUCKET) return undefined;

  const bucket = env.STORAGE_BUCKET;
  const client = new S3Client({
    region: env.STORAGE_REGION ?? 'us-east-1',
    ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? '',
      secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? '',
    },
  });

  return async (key, body, contentType) => {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
  };
}

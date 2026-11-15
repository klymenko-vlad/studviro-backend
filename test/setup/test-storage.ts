import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait } from 'testcontainers';

import { storageSettings } from './storage-settings';

export async function startTestStorage() {
  const container = await new GenericContainer(
    'rustfs/rustfs@sha256:9ca9559533b537d10482fe923288b676ad08f92a7069d9a17327fbae3cab688b',
  )
    .withEnvironment({
      RUSTFS_ACCESS_KEY: storageSettings.accessKeyId,
      RUSTFS_SECRET_KEY: storageSettings.secretAccessKey,
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  const client = new S3Client({
    endpoint,
    region: storageSettings.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: storageSettings.accessKeyId,
      secretAccessKey: storageSettings.secretAccessKey,
    },
  });

  try {
    await client.send(new CreateBucketCommand({ Bucket: storageSettings.bucket }));
  } catch (error) {
    await container.stop({ remove: true });
    throw error;
  } finally {
    client.destroy();
  }

  return { container, endpoint };
}

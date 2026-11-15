import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { GenericContainer, Wait } from 'testcontainers';

export async function startTestStorage() {
  const container = await new GenericContainer(
    'rustfs/rustfs@sha256:9ca9559533b537d10482fe923288b676ad08f92a7069d9a17327fbae3cab688b',
  )
    .withEnvironment({
      RUSTFS_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY_ID ?? 'studviro',
      RUSTFS_SECRET_KEY: process.env.STORAGE_SECRET_ACCESS_KEY ?? 'studviro',
    })
    .withExposedPorts(9000)
    .withWaitStrategy(Wait.forHttp('/health', 9000).forStatusCode(200))
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;
  const client = new S3Client({
    endpoint,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? 'studviro',
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? 'studviro',
    },
  });

  try {
    await client.send(
      new CreateBucketCommand({ Bucket: process.env.STORAGE_BUCKET ?? 'studviro' }),
    );
  } catch (error) {
    await container.stop({ remove: true });
    throw error;
  } finally {
    client.destroy();
  }

  return { container, endpoint };
}

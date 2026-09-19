import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.REDIS_HOST = inject('redisHost');
process.env.REDIS_PORT = inject('redisPort');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.SWAGGER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '1000000';
process.env.AUTH_THROTTLE_LIMIT = '1000000';
process.env.QUEUE_PREFIX = `test-${process.pid}`;

/**
 * Object storage points at the MinIO in `docker compose`. The storage e2e
 * exercises a real presigned round trip, because a mocked signature proves
 * nothing about whether S3 would accept it.
 */
process.env.STORAGE_ENDPOINT ??= 'http://localhost:9000';
process.env.STORAGE_BUCKET ??= 'studviro';
process.env.STORAGE_ACCESS_KEY_ID ??= 'studviro';
process.env.STORAGE_SECRET_ACCESS_KEY ??= 'studviro';
process.env.STORAGE_REGION ??= 'us-east-1';

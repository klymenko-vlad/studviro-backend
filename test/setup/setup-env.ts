import { inject } from 'vitest';

import { storageSettings } from './storage-settings';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.REDIS_HOST = inject('redisHost');
process.env.REDIS_PORT = inject('redisPort');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.SWAGGER_ENABLED = 'false';
process.env.THROTTLE_LIMIT = '1000000';
process.env.AUTH_THROTTLE_LIMIT = '1000000';
process.env.QUEUE_PREFIX = `test-${process.pid}`;

process.env.STORAGE_ENDPOINT = inject('storageEndpoint');
process.env.STORAGE_BUCKET = storageSettings.bucket;
process.env.STORAGE_ACCESS_KEY_ID = storageSettings.accessKeyId;
process.env.STORAGE_SECRET_ACCESS_KEY = storageSettings.secretAccessKey;
process.env.STORAGE_REGION = storageSettings.region;

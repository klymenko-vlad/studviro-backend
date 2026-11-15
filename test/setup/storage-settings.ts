export const storageSettings = {
  bucket: process.env.STORAGE_BUCKET ?? 'studviro',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? 'studviro',
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? 'studviro',
  region: process.env.STORAGE_REGION ?? 'us-east-1',
};

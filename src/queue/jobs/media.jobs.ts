import { z } from 'zod';

export const mediaJobSchemas = {
  scanObject: z.object({
    storageKey: z.string().min(1),
    institutionId: z.uuid(),
  }),
} as const;

export type MediaJobSchemas = typeof mediaJobSchemas;
export type MediaJobPayload<T extends keyof MediaJobSchemas> = z.infer<MediaJobSchemas[T]>;

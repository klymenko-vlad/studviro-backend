import { z } from 'zod';

export const synchronizationJobSchemas = {
  academic: z.object({
    runId: z.uuid(),
    institutionId: z.uuid(),
  }),
  learning: z.object({
    runId: z.uuid(),
    institutionId: z.uuid(),
  }),
} as const;

export type SynchronizationJobSchemas = typeof synchronizationJobSchemas;
export type SynchronizationJobName = keyof SynchronizationJobSchemas;
export type SynchronizationJobPayload<TName extends SynchronizationJobName> = z.infer<
  SynchronizationJobSchemas[TName]
>;

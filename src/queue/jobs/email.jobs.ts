import { z } from 'zod';

export const emailJobSchemas = {
  welcome: z.object({
    userId: z.uuid(),
    email: z.email(),
    displayName: z.string().min(1),
  }),
  passwordReset: z.object({
    userId: z.uuid(),
    email: z.email(),
    resetToken: z.string().min(16),
    expiresAt: z.coerce.date(),
  }),
} as const;

export type EmailJobSchemas = typeof emailJobSchemas;
export type EmailJobName = keyof EmailJobSchemas;
export type EmailJobPayload<T extends EmailJobName> = z.infer<EmailJobSchemas[T]>;

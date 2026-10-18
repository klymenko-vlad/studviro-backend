import { z } from 'zod';

import { CANONICAL_ROLES } from '../../database/schema';

const locale = z.string().min(2).default('en');

export const emailJobSchemas = {
  welcome: z.object({
    userId: z.uuid(),
    email: z.email(),
    displayName: z.string().min(1),
    locale,
  }),
  passwordReset: z.object({
    userId: z.uuid(),
    email: z.email(),
    resetToken: z.string().min(16),
    expiresAt: z.coerce.date(),
    locale,
  }),
  invitation: z.object({
    email: z.email(),
    token: z.string().min(16),
    institutionName: z.string().min(1),
    role: z.enum(CANONICAL_ROLES),
    expiresAt: z.coerce.date(),
    locale,
  }),
} as const;

export type EmailJobSchemas = typeof emailJobSchemas;
export type EmailJobName = keyof EmailJobSchemas;
export type EmailJobPayload<T extends EmailJobName> = z.infer<EmailJobSchemas[T]>;
export type EmailJobInput<T extends EmailJobName> = z.input<EmailJobSchemas[T]>;

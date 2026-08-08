import { relations } from 'drizzle-orm';

import { refreshTokens } from './refresh-tokens';
import { users } from './users';

/**
 * Relations live apart from the table definitions because they are inherently
 * bidirectional: declaring them beside the tables makes every pair of related
 * tables import each other, and the resulting cycle is fragile at module-init
 * time and flagged by `import-x/no-cycle`.
 */
export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

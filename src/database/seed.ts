import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { PasswordService } from '../common/crypto/password.service';

import * as schema from './schema';
import { users } from './schema';

/**
 * Idempotent development data. Safe to run repeatedly: every row is upserted on
 * its natural key, so re-seeding never duplicates and never wipes.
 *
 * Refuses to run against production — a seed that overwrites a real admin
 * password is a very short path to an incident.
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to seed a production database');
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to seed');

  const client = postgres(url, { max: 1, onnotice: () => undefined });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  const passwords = new PasswordService();

  try {
    const passwordHash = await passwords.hash('correct horse battery staple');

    const seeded = await db
      .insert(users)
      .values([
        {
          email: 'admin@studviro.local',
          displayName: 'Studviro Admin',
          role: 'admin' as const,
          passwordHash,
        },
        {
          email: 'ada@studviro.local',
          displayName: 'Ada Lovelace',
          role: 'user' as const,
          passwordHash,
        },
      ])
      .onConflictDoNothing()
      .returning({ email: users.email });

    console.log(
      seeded.length > 0
        ? `seeded ${seeded.length} user(s): ${seeded.map((u) => u.email).join(', ')}`
        : 'nothing to seed — the users already exist',
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('seed failed', error);
  process.exit(1);
});

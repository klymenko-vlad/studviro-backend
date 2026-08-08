import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to run migrations');

  const client = postgres(url, { max: 1, onnotice: () => undefined });

  try {
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    console.log('migrations applied');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('migration failed', error);
  process.exit(1);
});

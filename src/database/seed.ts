import 'dotenv/config';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { PasswordService } from '../common/crypto/password.service';

import {
  buildPlan,
  DEFAULT_DEMO_SEED_OPTIONS,
  DEFAULT_NAMED_ACCOUNTS,
  writePlan,
} from './demo-seed';
import * as schema from './schema';

const DEMO_PASSWORD = 'correct horse battery staple';

/**
 * Writes a whole demo university: a named institution with faculties,
 * departments, rooms, terms, programmes, courses, offerings, teachers,
 * students, enrolments, study groups, a timetable, exam terms and a past
 * year's results.
 *
 * **Destructive for the demo institution only.** Re-running replaces it: the
 * institution is deleted by code and the cascade takes everything scoped to it
 * with it, so two runs leave the same university rather than two of it. The
 * named accounts below are updated in place and never deleted, and an existing
 * account's password is left alone — a seed that silently resets a password
 * somebody changed is a support ticket waiting to happen.
 *
 * Refuses to run against production.
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
    const passwordHash = await passwords.hash(DEMO_PASSWORD);
    const options = DEFAULT_DEMO_SEED_OPTIONS;
    const plan = buildPlan(options);

    const started = Date.now();
    const summary = await writePlan(db, plan, options, passwordHash);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`seeded ${options.universityName} (${summary.institutionId}) in ${seconds}s`);
    for (const [table, count] of Object.entries(summary.counts)) {
      console.log(`  ${table.padEnd(24)} ${count}`);
    }
    console.log('\nsign in with any of these — password:', JSON.stringify(DEMO_PASSWORD));
    console.log(`  administrator  ${DEFAULT_NAMED_ACCOUNTS.adminEmail}`);
    console.log(`  registrar      ${DEFAULT_NAMED_ACCOUNTS.registrarEmail}`);
    console.log(`  teacher        ${DEFAULT_NAMED_ACCOUNTS.teacherEmail}`);
    console.log(`  student        ${DEFAULT_NAMED_ACCOUNTS.studentEmail}`);
    console.log(`  assistant      ${DEFAULT_NAMED_ACCOUNTS.assistantEmail}`);
    console.log(`  programme      ${DEFAULT_NAMED_ACCOUNTS.programCoordinatorEmail}`);
    console.log(`  course         ${DEFAULT_NAMED_ACCOUNTS.courseCoordinatorEmail}`);
    console.log(`  faculty        ${DEFAULT_NAMED_ACCOUNTS.orgUnitManagerEmail}`);
    console.log(`  no institution ${DEFAULT_NAMED_ACCOUNTS.newcomerEmail}`);
    console.log('(an account that already existed keeps the password it had)');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('seed failed', error);
  process.exit(1);
});

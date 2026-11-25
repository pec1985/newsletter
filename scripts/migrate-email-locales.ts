import { migrateEmailLocales } from '../src/lib/server/email-locale-migration';
import { sql } from '../src/lib/server/db';
await migrateEmailLocales();
console.log('Email locale migration complete.');
await sql.end();

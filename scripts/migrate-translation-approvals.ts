import { migrateTranslationApprovals } from '../src/lib/server/translation-approval-schema';
import { sql } from '../src/lib/server/db';
await migrateTranslationApprovals();
console.log('Translation approval migration complete.');
await sql.end();

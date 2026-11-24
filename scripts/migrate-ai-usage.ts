import { migrateAiUsage } from '../src/lib/server/ai-usage-schema';
import { sql } from '../src/lib/server/db';
await migrateAiUsage();
console.log('AI spending ledger is ready.');
await sql.end();

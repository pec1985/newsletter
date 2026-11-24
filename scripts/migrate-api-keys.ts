import { migrateApiKeys } from '../src/lib/server/api-key-schema';
import { sql } from '../src/lib/server/db';
await migrateApiKeys();
console.log('Named API keys ready. Existing API key preserved, if configured.');
await sql.end();

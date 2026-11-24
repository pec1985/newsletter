import { migrateKnowledge } from '../src/lib/server/knowledge-schema';
import { sql } from '../src/lib/server/db';
await migrateKnowledge();
console.log('Knowledge base schema ready. Existing data preserved.');
await sql.end();

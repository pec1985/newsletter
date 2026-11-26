import { migrateAudiences } from '../src/lib/server/audience-schema';
import { sql } from '../src/lib/server/db';

await migrateAudiences();
await sql.end();

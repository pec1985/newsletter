import { migrateUnsubscribeReasons } from '../src/lib/server/unsubscribe-schema';
import { sql } from '../src/lib/server/db';
await migrateUnsubscribeReasons();
await sql.end();

import { migrateCampaignSchedule } from '../src/lib/server/campaign-schedule-schema';
import { sql } from '../src/lib/server/db';
await migrateCampaignSchedule();
console.log('Campaign schedule migration complete.');
await sql.end();

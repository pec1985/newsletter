import 'dotenv/config';
import postgres from 'postgres';
export const sql = postgres(
	process.env.DATABASE_URL || 'postgres://newsletter:newsletter_local@localhost:55450/newsletter',
	{ max: 10 }
);

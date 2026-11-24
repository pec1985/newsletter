import { sql } from '../src/lib/server/db';
import { workerLifecycle } from '../src/lib/server/worker-lifecycle';
import { indexNextDocument } from '../src/lib/server/knowledge-index';
console.log('Knowledge indexing worker running. This worker never sends email.');
const lifecycle = workerLifecycle();
while (!lifecycle.stopping) {
	try {
		if (!(await indexNextDocument())) await lifecycle.sleep(1500);
	} catch {
		console.error('Knowledge worker could not reach the database. Retrying.');
		await lifecycle.sleep(5000);
	}
}

await sql.end({ timeout: 5 });
lifecycle.close();

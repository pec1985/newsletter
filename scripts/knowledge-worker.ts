import { indexNextDocument } from '../src/lib/server/knowledge-index';
console.log('Knowledge indexing worker running. This worker never sends email.');
while (true) {
	try {
		if (!(await indexNextDocument())) await Bun.sleep(1500);
	} catch {
		console.error('Knowledge worker could not reach the database. Retrying.');
		await Bun.sleep(5000);
	}
}

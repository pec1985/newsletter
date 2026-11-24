import { expect, test } from 'bun:test';
import { workerLifecycle } from '../src/lib/server/worker-lifecycle';

test('SIGTERM wakes an idle worker and prevents further polling', async () => {
	const before = process.listenerCount('SIGTERM');
	const lifecycle = workerLifecycle();
	try {
		const sleeping = lifecycle.sleep(60000);
		process.emit('SIGTERM');
		await sleeping;
		expect(lifecycle.stopping).toBe(true);
		await lifecycle.sleep(60000);
	} finally {
		lifecycle.close();
	}
	expect(process.listenerCount('SIGTERM')).toBe(before);
}, 1000);

test('normal polling wakes without stopping the worker', async () => {
	const lifecycle = workerLifecycle();
	try {
		await lifecycle.sleep(1);
		expect(lifecycle.stopping).toBe(false);
	} finally {
		lifecycle.close();
	}
});

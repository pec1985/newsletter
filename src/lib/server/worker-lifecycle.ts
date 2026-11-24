/** Finish the current job on SIGTERM; never claim another job during shutdown. */
export function workerLifecycle() {
	let stopping = false;
	let wake: (() => void) | undefined;
	const stop = () => {
		stopping = true;
		wake?.();
	};
	process.on('SIGTERM', stop);
	process.on('SIGINT', stop);
	return {
		get stopping() {
			return stopping;
		},
		sleep(ms: number) {
			if (stopping) return Promise.resolve();
			return new Promise<void>((resolve) => {
				const timer = setTimeout(done, ms);
				function done() {
					clearTimeout(timer);
					wake = undefined;
					resolve();
				}
				wake = done;
			});
		},
		close() {
			process.off('SIGTERM', stop);
			process.off('SIGINT', stop);
		}
	};
}

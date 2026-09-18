<script lang="ts">
	import { formatClock } from '$lib/format';

	type Props = {
		/** Today's recorded total as of `serverNow`, including the running session. */
		baseMs: number;
		/** Server clock at the moment the page data was produced. */
		serverNow: number;
		/** Whether a session is running right now. */
		running: boolean;
	};

	let { baseMs, serverNow, running }: Props = $props();

	let now = $state(Date.now());
	let syncedAt = $state(Date.now());
	let lastServerNow = $state<number | null>(null);

	// Re-anchor on every authoritative server snapshot. The displayed total is
	// the server-measured total plus a monotonic delta since that snapshot, so
	// device clock skew cannot change it.
	$effect(() => {
		if (serverNow !== lastServerNow) {
			lastServerNow = serverNow;
			syncedAt = Date.now();
			now = syncedAt;
		}
	});

	// Only tick while running: a paused total must keep its value.
	$effect(() => {
		if (!running) return;
		const interval = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(interval);
	});

	const elapsedMs = $derived(Math.max(0, baseMs + (running ? now - syncedAt : 0)));
</script>

<time
	class="timer-display"
	class:is-idle={!running && baseMs <= 0}
	class:is-paused={!running && baseMs > 0}
	data-testid="timer-display">{formatClock(elapsedMs)}</time
>

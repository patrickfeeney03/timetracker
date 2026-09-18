<script lang="ts">
	import { enhance } from '$app/forms';
	import { createSubmitHandler } from '$lib/forms';
	import { formatLocalTime } from '$lib/format';
	import type { ActiveSessionView, ActionFormResult } from '$lib/types';
	import { onMount } from 'svelte';
	import LiveTimer from './LiveTimer.svelte';

	type Props = {
		active: ActiveSessionView | null;
		/** Today's recorded total in ms, including the running session up to `serverNow`. */
		todayTotalMs: number;
		serverNow: number;
		deviceTimeZone: string;
		form: ActionFormResult | null;
	};

	let { active, todayTotalMs, serverNow, deviceTimeZone, form }: Props = $props();

	// The hidden input always carries the device's current IANA zone so a
	// travelling user gets the new zone captured on the next start.
	// svelte-ignore state_referenced_locally
	let timeZone = $state(deviceTimeZone);
	let localError = $state<string | null>(null);
	let startSubmitting = $state(false);
	let pauseSubmitting = $state(false);

	onMount(() => {
		const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (current) timeZone = current;
	});

	const startHandler = createSubmitHandler({
		setSubmitting: (value) => (startSubmitting = value),
		setError: (message) => (localError = message)
	});
	const pauseHandler = createSubmitHandler({
		setSubmitting: (value) => (pauseSubmitting = value),
		setError: (message) => (localError = message)
	});

	const serverError = $derived(
		form?.action === 'start' || form?.action === 'pause' ? form?.error : null
	);
	const errorText = $derived(localError ?? serverError ?? null);
</script>

<section class="card timer-card" aria-label="Timer">
	<div class="row-between">
		<div class="timer-meta">
			{#if active}
				<span class="pill pill-running"><span class="dot"></span> Running</span>
			{:else if todayTotalMs > 0}
				<span class="pill">Paused</span>
			{:else}
				<span class="pill pill-idle">Idle</span>
			{/if}
		</div>
	</div>

	<LiveTimer baseMs={todayTotalMs} {serverNow} running={active !== null} />

	<div class="timer-meta">
		{#if active}
			<span
				>Started {formatLocalTime(active.startedLocal)} · <strong>{active.timeZone}</strong></span
			>
			{#if active.timeZone !== deviceTimeZone}
				<span>This session keeps its original timezone until you pause it.</span>
			{/if}
		{:else if todayTotalMs > 0}
			<span>Today's total · <strong>{deviceTimeZone}</strong></span>
		{:else}
			<span>Starting captures <strong>{timeZone}</strong> as this session's timezone.</span>
		{/if}
	</div>

	{#if active}
		<form method="POST" action="?/pause" use:enhance={pauseHandler}>
			<button
				class="btn btn-primary btn-large btn-block"
				disabled={pauseSubmitting}
				data-testid="pause-button"
			>
				{pauseSubmitting ? 'Pausing…' : 'Pause'}
			</button>
		</form>
	{:else}
		<form method="POST" action="?/start" use:enhance={startHandler}>
			<input type="hidden" name="timeZone" value={timeZone} />
			<button
				class="btn btn-primary btn-large btn-block"
				disabled={startSubmitting}
				data-testid="start-button"
			>
				{startSubmitting ? 'Starting…' : todayTotalMs > 0 ? 'Resume' : 'Start'}
			</button>
		</form>
	{/if}

	{#if errorText}
		<p class="message message-error" role="alert" data-testid="timer-error">
			{errorText}
			<button class="link-button" type="button" onclick={() => (localError = null)}>Dismiss</button>
		</p>
	{/if}
</section>

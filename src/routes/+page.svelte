<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Calendar from '$lib/components/Calendar.svelte';
	import TimerControls from '$lib/components/TimerControls.svelte';
	import { formatDateLong, formatMonthLabel } from '$lib/format';
	import type { ActionFormResult } from '$lib/types';
	import { onMount } from 'svelte';

	const data = $derived(page.data);
	// Action results live on `page.form`, not inside load data.
	const form = $derived((page.form ?? null) as ActionFormResult | null);

	onMount(() => {
		let inFlight = false;

		// Poll and focus-refresh keep multiple devices in sync without
		// WebSockets: every refresh replaces the authoritative server snapshot.
		const refresh = async () => {
			if (document.visibilityState === 'hidden' || inFlight) return;
			inFlight = true;
			try {
				await invalidateAll();
			} finally {
				inFlight = false;
			}
		};
		const onVisible = () => {
			if (document.visibilityState === 'visible') void refresh();
		};

		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('focus', onVisible);
		const interval = setInterval(refresh, 30_000);

		return () => {
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('focus', onVisible);
			clearInterval(interval);
		};
	});
</script>

<svelte:head>
	<title>Today — Work Time Tracker</title>
</svelte:head>

<div class="page">
	<section class="row-between">
		<div>
			<h1>Today</h1>
			<p class="muted" style="margin: 0.2rem 0 0;">{formatDateLong(data.todayKey)}</p>
		</div>
		<p class="muted small" style="margin: 0;">{data.deviceTimeZone}</p>
	</section>

	<TimerControls
		active={data.activeSession}
		todayTotalMs={data.todayTotalMs}
		serverNow={data.serverNow}
		deviceTimeZone={data.deviceTimeZone}
		{form}
	/>

	<section class="card" aria-label="Calendar">
		<div class="card-header">
			<h2>{formatMonthLabel(data.month)}</h2>
			<div class="row">
				<a
					class="btn btn-ghost"
					href={resolve(`/?month=${data.previousMonth}`)}
					aria-label="Previous month">←</a
				>
				{#if data.month !== data.currentMonth}
					<a class="btn btn-ghost" href={resolve(`/?month=${data.currentMonth}`)}>Today</a>
				{/if}
				<a class="btn btn-ghost" href={resolve(`/?month=${data.nextMonth}`)} aria-label="Next month"
					>→</a
				>
			</div>
		</div>

		<Calendar month={data.month} days={data.days} todayKey={data.todayKey} />

		<p class="muted small" style="margin: 0.9rem 0 0;">
			Daily totals are derived from exact session timestamps and floored to whole minutes only for
			display.
		</p>
	</section>
</div>

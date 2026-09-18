<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateLong, formatDuration } from '$lib/format';
	import type { CalendarDay } from '$lib/types';

	type Props = {
		/** `YYYY-MM` currently displayed. */
		month: string;
		/** Complete Monday-first grid including neighbouring-month days. */
		days: CalendarDay[];
		/** Today in the device timezone. */
		todayKey: string;
	};

	let { month, days, todayKey }: Props = $props();

	const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
</script>

<div class="calendar" role="grid" aria-label={`Calendar for ${month}`}>
	{#each weekdays as weekday (weekday)}
		<div class="calendar-weekday" role="columnheader" aria-hidden="true">{weekday}</div>
	{/each}

	{#each days as day (day.date)}
		<a
			class="calendar-day"
			class:is-outside={!day.date.startsWith(month)}
			class:is-today={day.date === todayKey}
			class:has-time={day.durationMs > 0}
			href={resolve(`/history/${day.date}`)}
			role="gridcell"
			aria-label={`${formatDateLong(day.date)}: ${day.durationMs > 0 ? formatDuration(day.durationMs) : 'no recorded time'}`}
			data-testid="calendar-day"
			data-date={day.date}
		>
			<span class="calendar-number">{Number(day.date.slice(8, 10))}</span>
			{#if day.durationMs > 0}
				<span class="calendar-duration" data-testid="calendar-duration">
					{formatDuration(day.durationMs)}
				</span>
			{/if}
			{#if day.isRunning}
				<span class="calendar-running" title="Timer running" data-testid="calendar-running"></span>
			{/if}
		</a>
	{/each}
</div>

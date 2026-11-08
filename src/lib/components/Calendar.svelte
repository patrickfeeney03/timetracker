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
	/**
	 * Tags shown per cell on wide and on phone-sized screens; the rest collapse
	 * into a "+N" that names them on hover.
	 */
	const WIDE_TAGS = 2;
	const NARROW_TAGS = 1;

	const tagNames = (tags: CalendarDay['tags']) => tags.map((tag) => tag.name).join(', ');

	function describeDay(day: CalendarDay): string {
		const time = day.durationMs > 0 ? formatDuration(day.durationMs) : 'no recorded time';
		const tags = day.tags.length > 0 ? `, tagged ${tagNames(day.tags)}` : '';
		return `${formatDateLong(day.date)}: ${time}${tags}`;
	}
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
			aria-label={describeDay(day)}
			data-testid="calendar-day"
			data-date={day.date}
		>
			<span class="calendar-number">{Number(day.date.slice(8, 10))}</span>
			{#if day.durationMs > 0}
				<span class="calendar-duration" data-testid="calendar-duration">
					{formatDuration(day.durationMs)}
				</span>
			{/if}
			{#if day.tags.length > 0}
				<!-- The link's label already names every tag. -->
				<span class="calendar-tags" aria-hidden="true">
					{#each day.tags.slice(0, WIDE_TAGS) as tag, index (tag.id)}
						<span
							class="calendar-tag"
							class:is-wide-only={index >= NARROW_TAGS}
							title={tag.name}
							data-testid="calendar-tag">{tag.name}</span
						>
					{/each}
					{#if day.tags.length > NARROW_TAGS}
						<span
							class="calendar-tag is-more is-narrow-only"
							title={tagNames(day.tags.slice(NARROW_TAGS))}
							data-testid="calendar-tag-more-narrow">+{day.tags.length - NARROW_TAGS}</span
						>
					{/if}
					{#if day.tags.length > WIDE_TAGS}
						<span
							class="calendar-tag is-more is-wide-only"
							title={tagNames(day.tags.slice(WIDE_TAGS))}
							data-testid="calendar-tag-more">+{day.tags.length - WIDE_TAGS}</span
						>
					{/if}
				</span>
			{/if}
			{#if day.isRunning}
				<span class="calendar-running" title="Timer running" data-testid="calendar-running"></span>
			{/if}
		</a>
	{/each}
</div>

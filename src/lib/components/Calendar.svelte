<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDateLong, formatDuration } from '$lib/format';
	import { tagColorVar } from '$lib/labels';
	import type { CalendarDay, TagTime } from '$lib/types';

	type Props = {
		/** `YYYY-MM` currently displayed. */
		month: string;
		/** Complete Monday-first grid including neighbouring-month days. */
		days: CalendarDay[];
		/** Time per tag over the displayed month, most first. */
		tagTotals: TagTime[];
		/** Today in the device timezone. */
		todayKey: string;
	};

	let { month, days, tagTotals, todayKey }: Props = $props();

	const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
	/** Named chips per cell on wider screens; the rest collapse into "+N". */
	const MAX_CHIPS = 2;
	/** Phone cells only fit dots; the legend below names their colors. */
	const MAX_DOTS = 3;

	const tagSummary = (tags: TagTime[]) =>
		tags.map((tag) => `${tag.name} ${formatDuration(tag.durationMs)}`).join(', ');

	function describeDay(day: CalendarDay): string {
		const time = day.durationMs > 0 ? formatDuration(day.durationMs) : 'no recorded time';
		const tags = day.tags.length > 0 ? `; ${tagSummary(day.tags)}` : '';
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
				<!-- The link's label already names every tag; chips and dots are visual. -->
				<span class="calendar-tags" aria-hidden="true">
					{#each day.tags.slice(0, MAX_CHIPS) as tag (tag.id)}
						<span
							class="calendar-tag"
							title={`${tag.name} · ${formatDuration(tag.durationMs)}`}
							data-testid="calendar-tag"
							><span class="tag-dot" style:--tag-color={tagColorVar(tag.color)}
							></span>{tag.name}</span
						>
					{/each}
					{#if day.tags.length > MAX_CHIPS}
						<span
							class="calendar-tag is-more"
							title={tagSummary(day.tags.slice(MAX_CHIPS))}
							data-testid="calendar-tag-more">+{day.tags.length - MAX_CHIPS}</span
						>
					{/if}
				</span>
				<span class="calendar-dots" aria-hidden="true">
					{#each day.tags.slice(0, MAX_DOTS) as tag (tag.id)}
						<span
							class="tag-dot"
							style:--tag-color={tagColorVar(tag.color)}
							title={tag.name}
							data-testid="calendar-dot"
						></span>
					{/each}
				</span>
			{/if}
			{#if day.isRunning}
				<span class="calendar-running" title="Timer running" data-testid="calendar-running"></span>
			{/if}
		</a>
	{/each}
</div>

{#if tagTotals.length > 0}
	<ul class="calendar-legend" aria-label="Time per tag this month" data-testid="calendar-legend">
		{#each tagTotals as tag (tag.id)}
			<li class="calendar-legend-item" data-testid="legend-item">
				<span class="tag-dot" style:--tag-color={tagColorVar(tag.color)}></span>
				<span class="calendar-legend-name">{tag.name}</span>
				<span class="calendar-legend-time">{formatDuration(tag.durationMs)}</span>
			</li>
		{/each}
	</ul>
{/if}

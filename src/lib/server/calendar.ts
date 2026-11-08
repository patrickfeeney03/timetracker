import { contributionsByDay, type Interval } from '$lib/time';
import type { CalendarDay, TagView } from '$lib/types';

/**
 * One calendar cell per date: the total recorded time, whether the timer runs
 * into it, and the tags of the sessions that contributed. Tags are ranked by
 * the time they cover on that date, so a day's main activity comes first.
 */
export function buildCalendarDays(
	dates: string[],
	intervals: (Interval & { id: string })[],
	tagsBySession: Map<string, TagView[]>,
	nowMs: number
): CalendarDay[] {
	const byDay = contributionsByDay(intervals, nowMs);

	return dates.map((date) => {
		let durationMs = 0;
		let isRunning = false;
		const tagTotals = new Map<string, { tag: TagView; durationMs: number }>();

		for (const contribution of byDay.get(date) ?? []) {
			durationMs += contribution.durationMs;
			isRunning ||= contribution.interval.endedAt === null;
			for (const tag of tagsBySession.get(contribution.interval.id) ?? []) {
				const total = tagTotals.get(tag.id);
				if (total) total.durationMs += contribution.durationMs;
				else tagTotals.set(tag.id, { tag, durationMs: contribution.durationMs });
			}
		}

		const tags = [...tagTotals.values()]
			.sort((a, b) => b.durationMs - a.durationMs || a.tag.name.localeCompare(b.tag.name))
			.map(({ tag }) => tag);
		return { date, durationMs, isRunning, tags };
	});
}

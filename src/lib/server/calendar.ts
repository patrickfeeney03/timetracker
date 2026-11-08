import { contributionsByDay, type Interval } from '$lib/time';
import type { CalendarDay, TagTime, TagView } from '$lib/types';

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
		const tagTotals = new Map<string, TagTime>();

		for (const contribution of byDay.get(date) ?? []) {
			durationMs += contribution.durationMs;
			isRunning ||= contribution.interval.endedAt === null;
			for (const tag of tagsBySession.get(contribution.interval.id) ?? []) {
				addTagTime(tagTotals, tag, contribution.durationMs);
			}
		}

		return { date, durationMs, isRunning, tags: [...tagTotals.values()].sort(byTimeThenName) };
	});
}

/**
 * Time per tag over the month's own dates (not the neighbouring days the grid
 * also shows), most first. A session with two tags counts toward both.
 */
export function monthTagTotals(days: CalendarDay[], month: string): TagTime[] {
	const totals = new Map<string, TagTime>();
	for (const day of days) {
		if (!day.date.startsWith(`${month}-`)) continue;
		for (const tag of day.tags) addTagTime(totals, tag, tag.durationMs);
	}
	return [...totals.values()].sort(byTimeThenName);
}

function addTagTime(totals: Map<string, TagTime>, tag: TagView, durationMs: number) {
	const total = totals.get(tag.id);
	if (total) total.durationMs += durationMs;
	else totals.set(tag.id, { id: tag.id, name: tag.name, color: tag.color, durationMs });
}

function byTimeThenName(a: TagTime, b: TagTime): number {
	return b.durationMs - a.durationMs || a.name.localeCompare(b.name);
}

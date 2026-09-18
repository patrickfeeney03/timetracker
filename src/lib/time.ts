import { Temporal } from 'temporal-polyfill';

/**
 * Shared, tested time utilities. Everything is based on the Temporal polyfill so
 * that local-midnight splitting and daylight-saving transitions use real elapsed
 * time instead of arithmetic on wall clocks.
 *
 * Timestamps are UTC epoch milliseconds. A session always keeps the IANA time
 * zone that was captured when it started, so travelling never moves recorded
 * work to another date.
 */

export type Interval = {
	startedAt: number;
	endedAt: number | null;
	timeZone: string;
};

export type DaySummary = {
	/** `YYYY-MM-DD` in the interval's recorded zone. */
	date: string;
	durationMs: number;
	isRunning: boolean;
};

export type DayContribution<T extends Interval = Interval> = {
	interval: T;
	durationMs: number;
};

const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export function isTimeZone(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 100) return false;
	try {
		Temporal.Now.zonedDateTimeISO(value);
		return true;
	} catch {
		return false;
	}
}

export function currentTimeZone(): string {
	try {
		return Temporal.Now.timeZoneId();
	} catch {
		return 'UTC';
	}
}

export function isValidDate(value: unknown): value is string {
	if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
	try {
		Temporal.PlainDate.from(value);
		return true;
	} catch {
		return false;
	}
}

export function isValidMonth(value: unknown): value is string {
	if (typeof value !== 'string' || !MONTH_PATTERN.test(value)) return false;
	try {
		Temporal.PlainDate.from(`${value}-01`);
		return true;
	} catch {
		return false;
	}
}

/** Parses a minute-precision local datetime (`YYYY-MM-DDTHH:mm`) in a zone. */
export function localDateTimeToEpochMs(local: unknown, timeZone: string): number | null {
	if (typeof local !== 'string' || !LOCAL_DATE_TIME_PATTERN.test(local)) return null;
	try {
		return Temporal.PlainDateTime.from(local).toZonedDateTime(timeZone).epochMilliseconds;
	} catch {
		return null;
	}
}

/** Formats an instant as a minute-precision local datetime in a zone. */
export function epochMsToLocalDateTime(epochMs: number, timeZone: string): string {
	return Temporal.Instant.fromEpochMilliseconds(epochMs)
		.toZonedDateTimeISO(timeZone)
		.toPlainDateTime()
		.toString({ smallestUnit: 'minute' });
}

/** The calendar date (`YYYY-MM-DD`) of an instant in a zone. */
export function formatDateInTimeZone(epochMs: number, timeZone: string): string {
	return Temporal.Instant.fromEpochMilliseconds(epochMs)
		.toZonedDateTimeISO(timeZone)
		.toPlainDate()
		.toString();
}

export function shiftDate(date: string, days: number): string {
	return Temporal.PlainDate.from(date).add({ days }).toString();
}

export function shiftMonth(month: string, delta: number): string {
	return Temporal.PlainDate.from(`${month}-01`).add({ months: delta }).toString().slice(0, 7);
}

/**
 * Splits `[startMs, endMs)` at local-midnight boundaries in `timeZone`. Each
 * returned slice carries the date it belongs to and the exact elapsed time in
 * that slice, so midnight crossings (including skipped or repeated midnights)
 * are attributed to the correct local dates.
 */
export function splitIntervalByLocalDays(
	startMs: number,
	endMs: number,
	timeZone: string
): { date: string; durationMs: number }[] {
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

	const end = Temporal.Instant.fromEpochMilliseconds(endMs);
	let cursor = Temporal.Instant.fromEpochMilliseconds(startMs).toZonedDateTimeISO(timeZone);
	const slices: { date: string; durationMs: number }[] = [];

	while (Temporal.Instant.compare(cursor.toInstant(), end) < 0) {
		// Start of the next local day. `toZonedDateTime` on a PlainDate resolves
		// to the first instant of that day, which handles zones where midnight
		// is skipped or repeated by a DST transition.
		const nextStart = cursor.toPlainDate().add({ days: 1 }).toZonedDateTime(timeZone);
		const sliceEnd =
			Temporal.Instant.compare(nextStart.toInstant(), end) < 0 ? nextStart.toInstant() : end;
		const durationMs = sliceEnd.epochMilliseconds - cursor.epochMilliseconds;
		if (durationMs > 0) {
			slices.push({ date: cursor.toPlainDate().toString(), durationMs });
		}
		cursor = nextStart;
	}

	return slices;
}

/** Derives per-date totals from intervals. Open intervals end at `nowMs`. */
export function summarizeByDay<T extends Interval>(
	intervals: T[],
	nowMs: number
): Map<string, DaySummary> {
	const summaries = new Map<string, DaySummary>();

	for (const interval of intervals) {
		const endMs = interval.endedAt ?? nowMs;
		const isRunning = interval.endedAt === null;
		for (const slice of splitSafely(interval.startedAt, endMs, interval.timeZone)) {
			const existing = summaries.get(slice.date);
			if (existing) {
				existing.durationMs += slice.durationMs;
				existing.isRunning ||= isRunning;
			} else {
				summaries.set(slice.date, {
					date: slice.date,
					durationMs: slice.durationMs,
					isRunning
				});
			}
		}
	}

	return summaries;
}

/** The intervals (and their exact contribution) that land on `date`. */
export function contributionsForDate<T extends Interval>(
	intervals: T[],
	date: string,
	nowMs: number
): DayContribution<T>[] {
	const contributions: DayContribution<T>[] = [];
	for (const interval of intervals) {
		const endMs = interval.endedAt ?? nowMs;
		for (const slice of splitSafely(interval.startedAt, endMs, interval.timeZone)) {
			if (slice.date === date) {
				contributions.push({ interval, durationMs: slice.durationMs });
			}
		}
	}
	return contributions.sort((a, b) => a.interval.startedAt - b.interval.startedAt);
}

/**
 * Every date shown in a month calendar grid, Monday first. Includes the leading
 * and trailing days of the neighbouring months so weekly rows are complete.
 */
export function monthGridDates(month: string): string[] {
	const first = Temporal.PlainDate.from(`${month}-01`);
	const gridStart = first.subtract({ days: (first.dayOfWeek + 6) % 7 });
	const last = first.add({ months: 1 }).subtract({ days: 1 });
	const gridEnd = last.add({ days: (7 - last.dayOfWeek) % 7 });

	const dates: string[] = [];
	for (
		let day = gridStart;
		Temporal.PlainDate.compare(day, gridEnd) <= 0;
		day = day.add({ days: 1 })
	) {
		dates.push(day.toString());
	}
	return dates;
}

// Duration formatting lives in `$lib/format` (client-safe, no Temporal) and is
// re-exported here for server code that already depends on this module.
export { formatClock, formatDuration } from './format';

function splitSafely(startMs: number, endMs: number, timeZone: string) {
	try {
		return splitIntervalByLocalDays(startMs, endMs, timeZone);
	} catch (error) {
		// A stored zone can be unknown after a tzdata update. Falling back to UTC
		// keeps the page usable instead of failing the whole aggregation.
		console.warn(`Unknown time zone "${timeZone}", falling back to UTC`, error);
		return splitIntervalByLocalDays(startMs, endMs, 'UTC');
	}
}

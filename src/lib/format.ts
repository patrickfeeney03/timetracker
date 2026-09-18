/**
 * Client-safe duration formatting. These live outside `$lib/time` so pages do
 * not pull the Temporal polyfill into the browser bundle.
 */

/** Streams as `HH:MM:SS`; hours are not capped, so long timers keep counting. */
export function formatClock(durationMs: number): string {
	const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Historical totals as `Hh Mm`. The exact millisecond total is summed before
 * calling this, so only the final displayed value is floored to whole minutes.
 */
export function formatDuration(durationMs: number): string {
	const minutes = Math.floor(Math.max(0, durationMs) / 60_000);
	const hours = Math.floor(minutes / 60);
	return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function pad(value: number): string {
	return value.toString().padStart(2, '0');
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: 'long',
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	timeZone: 'UTC'
});

const monthFormatter = new Intl.DateTimeFormat(undefined, {
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

/** Human label for a `YYYY-MM-DD` date, formatted in a fixed zone. */
export function formatDateLong(date: string): string {
	return dateFormatter.format(new Date(`${date}T12:00:00Z`));
}

/** Human label for a `YYYY-MM` month. */
export function formatMonthLabel(month: string): string {
	return monthFormatter.format(new Date(`${month}-01T12:00:00Z`));
}

/** `HH:mm` from a minute-precision local datetime (`YYYY-MM-DDTHH:mm`). */
export function formatLocalTime(localDateTime: string): string {
	return localDateTime.slice(11, 16);
}

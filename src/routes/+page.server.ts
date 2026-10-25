import { fail } from '@sveltejs/kit';
import { getActiveSession, listSessionsOverlapping } from '$lib/server/db/sessions';
import { requireUser } from '$lib/server/guards';
import { pauseTimer, startTimer } from '$lib/server/sessions/service';
import { readDeviceTimeZone } from '$lib/server/timezone';
import {
	epochMsToLocalDateTime,
	formatDateInTimeZone,
	isTimeZone,
	isValidMonth,
	monthGridDates,
	shiftMonth,
	summarizeByDay
} from '$lib/time';
import type { Actions, PageServerLoad } from './$types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ locals, platform, cookies, url }) => {
	const user = requireUser(locals);
	const db = locals.db;
	const nowMs = Date.now();
	const deviceTimeZone = readDeviceTimeZone(cookies, platform?.cf?.timezone);
	const todayKey = formatDateInTimeZone(nowMs, deviceTimeZone);

	const requestedMonth = url.searchParams.get('month');
	const month = isValidMonth(requestedMonth) ? requestedMonth : todayKey.slice(0, 7);
	const gridDates = monthGridDates(month);

	// Sessions keep the timezone they were recorded in, so a grid date can
	// collect time from instants up to 14 hours away from UTC midnight. Widen
	// the queried range by two days on either side and derive totals in code.
	const queryFromMs = Date.parse(`${gridDates[0]}T00:00:00Z`) - 2 * DAY_MS;
	const queryToMs = Date.parse(`${gridDates[gridDates.length - 1]}T00:00:00Z`) + 3 * DAY_MS;

	const [monthSessions, activeSession] = await Promise.all([
		listSessionsOverlapping(db, user.id, queryFromMs, queryToMs),
		getActiveSession(db, user.id)
	]);

	const intervals =
		activeSession && !monthSessions.some((session) => session.id === activeSession.id)
			? [activeSession, ...monthSessions]
			: monthSessions;

	const summaries = summarizeByDay(intervals, nowMs);

	return {
		serverNow: nowMs,
		deviceTimeZone,
		todayKey,
		todayTotalMs: summaries.get(todayKey)?.durationMs ?? 0,
		activeSession: activeSession
			? {
					id: activeSession.id,
					startedLocal: epochMsToLocalDateTime(activeSession.startedAt, activeSession.timeZone),
					timeZone: activeSession.timeZone
				}
			: null,
		month,
		previousMonth: shiftMonth(month, -1),
		nextMonth: shiftMonth(month, 1),
		currentMonth: todayKey.slice(0, 7),
		days: gridDates.map((date) => summaries.get(date) ?? { date, durationMs: 0, isRunning: false })
	};
};

export const actions: Actions = {
	/** Starts the timer with a server timestamp. Idempotent while running. */
	start: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = locals.db;
		const data = await request.formData();
		const timeZone = String(data.get('timeZone') ?? '');

		if (!isTimeZone(timeZone)) {
			return fail(400, {
				action: 'start',
				error: 'Your device timezone could not be read. Refresh the page and try again.'
			});
		}

		const result = await startTimer({ db, userId: user.id, nowMs: Date.now() }, timeZone);
		if (!result.ok) {
			return fail(500, { action: 'start', error: result.message, retryable: true });
		}
		return { action: 'start', success: true };
	},

	/** Pauses the running timer with a server timestamp. */
	pause: async ({ locals }) => {
		const user = requireUser(locals);
		const db = locals.db;
		const result = await pauseTimer({ db, userId: user.id, nowMs: Date.now() });
		if (!result.ok) {
			return fail(500, { action: 'pause', error: result.message, retryable: true });
		}
		return { action: 'pause', success: true };
	}
};

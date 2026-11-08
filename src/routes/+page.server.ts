import { fail } from '@sveltejs/kit';
import { buildCalendarDays, monthTagTotals } from '$lib/server/calendar';
import {
	getActiveSession,
	getLatestFinishedLabels,
	listSessionsOverlapping
} from '$lib/server/db/sessions';
import { groupTagsBySession, listTagLinksOverlapping, listTags } from '$lib/server/db/tags';
import { requireUser } from '$lib/server/guards';
import { readLabels } from '$lib/server/sessions/form';
import { pauseTimer, startTimer, updateSessionLabels } from '$lib/server/sessions/service';
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

	const [monthSessions, activeSession, tags, tagLinks, previousLabels] = await Promise.all([
		listSessionsOverlapping(db, user.id, queryFromMs, queryToMs),
		getActiveSession(db, user.id),
		listTags(db, user.id),
		listTagLinksOverlapping(db, user.id, queryFromMs, queryToMs),
		getLatestFinishedLabels(db, user.id)
	]);
	const tagsBySession = groupTagsBySession(tagLinks, tags);

	const intervals =
		activeSession && !monthSessions.some((session) => session.id === activeSession.id)
			? [activeSession, ...monthSessions]
			: monthSessions;
	const days = buildCalendarDays(gridDates, intervals, tagsBySession, nowMs);

	return {
		serverNow: nowMs,
		deviceTimeZone,
		todayKey,
		todayTotalMs: summarizeByDay(intervals, nowMs).get(todayKey)?.durationMs ?? 0,
		timerRunning: activeSession !== undefined,
		activeSession: activeSession
			? {
					id: activeSession.id,
					startedLocal: epochMsToLocalDateTime(activeSession.startedAt, activeSession.timeZone),
					timeZone: activeSession.timeZone,
					name: activeSession.name,
					tagIds: (tagsBySession.get(activeSession.id) ?? []).map((tag) => tag.id)
				}
			: null,
		// Offered on the start form so a resume keeps the same name and tags.
		previousLabels: previousLabels ?? null,
		tags,
		month,
		previousMonth: shiftMonth(month, -1),
		nextMonth: shiftMonth(month, 1),
		currentMonth: todayKey.slice(0, 7),
		days,
		tagTotals: monthTagTotals(days, month)
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

		const result = await startTimer(
			{ db, userId: user.id, nowMs: Date.now() },
			timeZone,
			readLabels(data)
		);
		if (!result.ok) return labelFailure('start', result);
		return { action: 'start', success: true };
	},

	/**
	 * Pauses the running timer with a server timestamp. The name and tags share
	 * a form with Pause, so unsaved edits are kept rather than lost.
	 */
	pause: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = locals.db;
		const result = await pauseTimer(
			{ db, userId: user.id, nowMs: Date.now() },
			readLabels(await request.formData())
		);
		if (!result.ok) return labelFailure('pause', result);
		return { action: 'pause', success: true };
	},

	/** Saves the running session's name and tags without pausing it. */
	rename: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = locals.db;
		const data = await request.formData();
		const sessionId = String(data.get('sessionId') ?? '');
		if (!sessionId) {
			return fail(400, { action: 'rename', error: 'Missing session id.', field: 'form' });
		}

		const result = await updateSessionLabels(
			{ db, userId: user.id, nowMs: Date.now() },
			sessionId,
			readLabels(data)
		);
		if (!result.ok) return labelFailure('rename', result);
		return { action: 'rename', success: true };
	}
};

/**
 * Invalid names or tags are the user's to fix; anything else on start or pause
 * is a server problem worth retrying.
 */
function labelFailure(action: string, result: { message: string; field?: string }) {
	const invalidInput = result.field === 'name' || result.field === 'tags';
	const status = invalidInput ? 400 : action === 'rename' ? 409 : 500;
	return fail(status, {
		action,
		error: result.message,
		field: result.field,
		retryable: !invalidInput && action !== 'rename'
	});
}

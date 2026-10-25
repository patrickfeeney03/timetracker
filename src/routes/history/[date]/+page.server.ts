import { error, fail } from '@sveltejs/kit';
import { getActiveSession, listSessionsOverlapping } from '$lib/server/db/sessions';
import { requireUser } from '$lib/server/guards';
import { addManualSession, editSession, removeSession } from '$lib/server/sessions/service';
import { readDeviceTimeZone } from '$lib/server/timezone';
import {
	contributionsForDate,
	epochMsToLocalDateTime,
	formatDateInTimeZone,
	isValidDate,
	shiftDate
} from '$lib/time';
import type { SessionEntry } from '$lib/types';
import type { Actions, PageServerLoad } from './$types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ params, locals, platform, cookies }) => {
	const user = requireUser(locals);
	if (!isValidDate(params.date)) error(404, 'That date is not valid.');

	const db = locals.db;
	const nowMs = Date.now();
	const deviceTimeZone = readDeviceTimeZone(cookies, platform?.cf?.timezone);
	const date = params.date;

	// Query instants that could contribute to this date in any recorded zone.
	const dayStartMs = Date.parse(`${date}T00:00:00Z`);
	const queryFromMs = dayStartMs - 2 * DAY_MS;
	const queryToMs = dayStartMs + 3 * DAY_MS;

	const [overlapping, activeSession] = await Promise.all([
		listSessionsOverlapping(db, user.id, queryFromMs, queryToMs),
		getActiveSession(db, user.id)
	]);

	const intervals =
		activeSession && !overlapping.some((session) => session.id === activeSession.id)
			? [activeSession, ...overlapping]
			: overlapping;

	const entries: SessionEntry[] = contributionsForDate(intervals, date, nowMs).map(
		({ interval, durationMs }) => {
			const startLocal = epochMsToLocalDateTime(interval.startedAt, interval.timeZone);
			const endMs = interval.endedAt ?? nowMs;
			const endLocal = epochMsToLocalDateTime(endMs, interval.timeZone);
			return {
				id: interval.id,
				startedAt: interval.startedAt,
				endedAt: interval.endedAt,
				timeZone: interval.timeZone,
				startLocal,
				endLocal: interval.endedAt === null ? null : endLocal,
				durationMs,
				isRunning: interval.endedAt === null,
				crossesMidnight: startLocal.slice(0, 10) !== date || endLocal.slice(0, 10) !== date
			};
		}
	);

	const totalMs = entries.reduce((sum, entry) => sum + entry.durationMs, 0);
	const isToday = formatDateInTimeZone(nowMs, deviceTimeZone) === date;
	const endDefault = isToday ? epochMsToLocalDateTime(nowMs, deviceTimeZone) : `${date}T17:00`;

	return {
		date,
		deviceTimeZone,
		isToday,
		totalMs,
		entries,
		previousDate: shiftDate(date, -1),
		nextDate: shiftDate(date, 1),
		addDefaults: {
			start: isToday
				? epochMsToLocalDateTime(nowMs - 60 * 60 * 1000, deviceTimeZone)
				: `${date}T09:00`,
			end: endDefault,
			timeZone: deviceTimeZone
		}
	};
};

function readManualInput(data: FormData) {
	return {
		startLocal: String(data.get('start') ?? ''),
		endLocal: String(data.get('end') ?? ''),
		timeZone: String(data.get('timeZone') ?? '')
	};
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = locals.db;
		const result = await addManualSession(
			{ db, userId: user.id, nowMs: Date.now() },
			readManualInput(await request.formData())
		);

		if (!result.ok) {
			return fail(result.field === 'form' ? 409 : 400, {
				action: 'add',
				error: result.message,
				field: result.field
			});
		}
		return { action: 'add', success: true };
	},

	edit: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = locals.db;
		const data = await request.formData();
		const sessionId = String(data.get('sessionId') ?? '');

		if (!sessionId) {
			return fail(400, { action: 'edit', error: 'Missing session id.', field: 'form' });
		}

		const result = await editSession(
			{ db, userId: user.id, nowMs: Date.now() },
			sessionId,
			readManualInput(data)
		);

		if (!result.ok) {
			return fail(result.field === 'form' ? 409 : 400, {
				action: 'edit',
				sessionId,
				error: result.message,
				field: result.field
			});
		}
		return { action: 'edit', success: true, sessionId };
	},

	delete: async ({ request, locals }) => {
		const user = requireUser(locals);
		const db = locals.db;
		const data = await request.formData();
		const sessionId = String(data.get('sessionId') ?? '');

		if (!sessionId) {
			return fail(400, { action: 'delete', error: 'Missing session id.', field: 'form' });
		}

		const result = await removeSession({ db, userId: user.id, nowMs: Date.now() }, sessionId);
		if (!result.ok) {
			return fail(409, { action: 'delete', sessionId, error: result.message, field: 'form' });
		}
		return { action: 'delete', success: true, sessionId: result.deletedId };
	}
};

import {
	epochMsToLocalDateTime,
	formatDateInTimeZone,
	isTimeZone,
	localDateTimeToEpochMs
} from '$lib/time';
import type { Db } from '../db';
import {
	insertSession,
	insertOrGetActiveSession,
	endActiveSession,
	getSession,
	findOverlappingSession,
	updateSession,
	deleteSession,
	type WorkSession
} from '../db/sessions';

export type ServiceErrorField = 'start' | 'end' | 'timeZone' | 'form';

export type ServiceResult<T> =
	({ ok: true } & T) | { ok: false; message: string; field?: ServiceErrorField };

export type ManualSessionInput = {
	startLocal: string;
	endLocal: string;
	timeZone: string;
};

type Context = {
	db: Db;
	/**
	 * Always comes from the authenticated session and is never accepted from the
	 * browser.
	 */
	userId: string;
	nowMs: number;
};

/** Starts the timer, or returns the already-running one (idempotent). */
export async function startTimer(
	context: Context,
	timeZone: string
): Promise<ServiceResult<{ session: WorkSession }>> {
	if (!isTimeZone(timeZone)) {
		return {
			ok: false,
			field: 'timeZone',
			message: 'Your device timezone is not recognised. Refresh the page and try again.'
		};
	}

	// One statement, so starting costs a single round trip to the primary and
	// never acts on a read a lagging replica could have served.
	const { db, userId, nowMs } = context;
	const session = await insertOrGetActiveSession(db, {
		id: crypto.randomUUID(),
		userId,
		startedAt: nowMs,
		endedAt: null,
		timeZone,
		createdAt: nowMs,
		updatedAt: nowMs
	});
	return { ok: true, session };
}

/** Pauses the running timer using a server timestamp. */
export async function pauseTimer(
	context: Context
): Promise<ServiceResult<{ session: WorkSession | null }>> {
	// One statement for the same reasons as `startTimer`.
	const session = await endActiveSession(context.db, context.userId, context.nowMs);
	return { ok: true, session: session ?? null };
}

/** Adds a finished session from minute-level local input. */
export async function addManualSession(
	context: Context,
	input: ManualSessionInput
): Promise<ServiceResult<{ session: WorkSession }>> {
	const validated = validateManualInput(input);
	if (!validated.ok) return validated;

	const overlap = await findOverlappingSession(
		context.db,
		context.userId,
		validated.startMs,
		validated.endMs
	);
	if (overlap) return overlapError(overlap, input.timeZone);

	const { db, userId, nowMs } = context;
	const session = await insertSession(db, {
		id: crypto.randomUUID(),
		userId,
		startedAt: validated.startMs,
		endedAt: validated.endMs,
		timeZone: input.timeZone,
		createdAt: nowMs,
		updatedAt: nowMs
	});
	return { ok: true, session };
}

/** Edits a finished session. Running sessions must be paused first. */
export async function editSession(
	context: Context,
	sessionId: string,
	input: ManualSessionInput
): Promise<ServiceResult<{ session: WorkSession }>> {
	const existing = await getSession(context.db, context.userId, sessionId);
	if (!existing) {
		return {
			ok: false,
			field: 'form',
			message: 'That session no longer exists. Refresh the page.'
		};
	}
	if (existing.endedAt === null) {
		return {
			ok: false,
			field: 'form',
			message: 'Pause the running timer before editing it.'
		};
	}

	const validated = validateManualInput(input);
	if (!validated.ok) return validated;

	const overlap = await findOverlappingSession(
		context.db,
		context.userId,
		validated.startMs,
		validated.endMs,
		sessionId
	);
	if (overlap) return overlapError(overlap, input.timeZone);

	const session = await updateSession(context.db, context.userId, sessionId, {
		startedAt: validated.startMs,
		endedAt: validated.endMs,
		timeZone: input.timeZone,
		updatedAt: context.nowMs
	});
	if (!session) {
		return {
			ok: false,
			field: 'form',
			message: 'That session no longer exists. Refresh the page.'
		};
	}
	return { ok: true, session };
}

/** Deletes a session. Matches on both id and owner. */
export async function removeSession(
	context: Context,
	sessionId: string
): Promise<ServiceResult<{ deletedId: string }>> {
	const deleted = await deleteSession(context.db, context.userId, sessionId);
	if (deleted === 0) {
		return {
			ok: false,
			field: 'form',
			message: 'That session no longer exists. Refresh the page.'
		};
	}
	return { ok: true, deletedId: sessionId };
}

function validateManualInput(
	input: ManualSessionInput
):
	| { ok: true; startMs: number; endMs: number }
	| { ok: false; message: string; field?: ServiceErrorField } {
	if (!isTimeZone(input.timeZone)) {
		return {
			ok: false,
			field: 'timeZone',
			message: 'Choose a valid IANA timezone, such as Europe/Berlin.'
		};
	}

	const startMs = localDateTimeToEpochMs(input.startLocal, input.timeZone);
	if (startMs === null) {
		return { ok: false, field: 'start', message: 'Enter a valid start date and time.' };
	}

	const endMs = localDateTimeToEpochMs(input.endLocal, input.timeZone);
	if (endMs === null) {
		return { ok: false, field: 'end', message: 'Enter a valid end date and time.' };
	}

	if (endMs <= startMs) {
		return { ok: false, field: 'end', message: 'The end time must be after the start time.' };
	}

	return { ok: true, startMs, endMs };
}

function overlapError(
	other: WorkSession,
	timeZone: string
): { ok: false; field: 'start'; message: string } {
	if (other.endedAt === null) {
		const started = epochMsToLocalDateTime(other.startedAt, timeZone);
		return {
			ok: false,
			field: 'start',
			message: `This overlaps the running timer that started at ${started}. Pause it before adding time.`
		};
	}

	const start = epochMsToLocalDateTime(other.startedAt, timeZone);
	const end = epochMsToLocalDateTime(other.endedAt, timeZone);
	const sameDay =
		formatDateInTimeZone(other.startedAt, timeZone) ===
		formatDateInTimeZone(other.endedAt, timeZone);
	const range = sameDay ? `${start.slice(11)} – ${end.slice(11)}` : `${start} – ${end}`;
	return {
		ok: false,
		field: 'start',
		message: `This overlaps an existing session (${range}). Edit that session first.`
	};
}

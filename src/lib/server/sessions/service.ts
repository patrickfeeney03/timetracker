import {
	normalizeSessionName,
	normalizeTagSelection,
	type LabelError,
	type TagSelection
} from '$lib/labels';
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

export type ServiceErrorField = 'start' | 'end' | 'timeZone' | 'name' | 'tags' | 'form';

export type ServiceResult<T> =
	({ ok: true } & T) | { ok: false; message: string; field?: ServiceErrorField };

/**
 * Raw name and tag fields from a form. A field left `undefined` keeps the
 * session's current value (or none, for a new session).
 */
export type LabelInput = {
	/** Blank means unnamed. */
	name?: string;
	tags?: {
		/** Picked existing tags. */
		tagIds: string[];
		/** Comma-separated names to reuse or create. */
		newTags: string;
	};
};

export type ManualSessionInput = LabelInput & {
	startLocal: string;
	endLocal: string;
	timeZone: string;
};

type Labels = { name?: string | null; tags?: TagSelection };

type Context = {
	db: Db;
	/**
	 * Always comes from the authenticated session and is never accepted from the
	 * browser.
	 */
	userId: string;
	nowMs: number;
};

/**
 * Starts the timer, or returns the already-running one (idempotent). When a
 * timer is already running, its name and tags are left alone.
 */
export async function startTimer(
	context: Context,
	timeZone: string,
	input: LabelInput = {}
): Promise<ServiceResult<{ session: WorkSession }>> {
	if (!isTimeZone(timeZone)) {
		return {
			ok: false,
			field: 'timeZone',
			message: 'Your device timezone is not recognised. Refresh the page and try again.'
		};
	}
	const labels = validateLabels(input);
	if (!labels.ok) return labels;

	// One round trip to the primary that never acts on a read a lagging replica
	// could have served: a single statement, batched with any tag writes.
	const { db, userId, nowMs } = context;
	const session = await insertOrGetActiveSession(
		db,
		{
			id: crypto.randomUUID(),
			userId,
			startedAt: nowMs,
			endedAt: null,
			timeZone,
			name: labels.name ?? null,
			createdAt: nowMs,
			updatedAt: nowMs
		},
		labels.tags
	);
	return { ok: true, session };
}

/**
 * Pauses the running timer using a server timestamp. Submitted labels are
 * saved on the session being ended; omitted ones are kept.
 */
export async function pauseTimer(
	context: Context,
	input: LabelInput = {}
): Promise<ServiceResult<{ session: WorkSession | null }>> {
	const labels = validateLabels(input);
	if (!labels.ok) return labels;

	// One round trip for the same reasons as `startTimer`.
	const session = await endActiveSession(context.db, context.userId, context.nowMs, labels);
	return { ok: true, session: session ?? null };
}

/** Renames or retags any owned session, including the running one. */
export async function updateSessionLabels(
	context: Context,
	sessionId: string,
	input: LabelInput
): Promise<ServiceResult<{ session: WorkSession }>> {
	const labels = validateLabels(input);
	if (!labels.ok) return labels;

	// Owner-checked writes with no read first, so no replica can be stale.
	const session = await updateSession(
		context.db,
		context.userId,
		sessionId,
		{ ...(labels.name !== undefined && { name: labels.name }), updatedAt: context.nowMs },
		labels.tags
	);
	if (!session) {
		return {
			ok: false,
			field: 'form',
			message: 'That session no longer exists. Refresh the page.'
		};
	}
	return { ok: true, session };
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
	const session = await insertSession(
		db,
		{
			id: crypto.randomUUID(),
			userId,
			startedAt: validated.startMs,
			endedAt: validated.endMs,
			timeZone: input.timeZone,
			name: validated.labels.name ?? null,
			createdAt: nowMs,
			updatedAt: nowMs
		},
		validated.labels.tags
	);
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

	const { name, tags } = validated.labels;
	const session = await updateSession(
		context.db,
		context.userId,
		sessionId,
		{
			startedAt: validated.startMs,
			endedAt: validated.endMs,
			timeZone: input.timeZone,
			...(name !== undefined && { name }),
			updatedAt: context.nowMs
		},
		tags
	);
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
	| { ok: true; startMs: number; endMs: number; labels: Labels }
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

	const labels = validateLabels(input);
	if (!labels.ok) return labels;

	return { ok: true, startMs, endMs, labels };
}

function validateLabels(input: LabelInput): ({ ok: true } & Labels) | LabelError {
	const labels: { ok: true } & Labels = { ok: true };
	if (input.name !== undefined) {
		const named = normalizeSessionName(input.name);
		if (!named.ok) return named;
		labels.name = named.name;
	}
	if (input.tags !== undefined) {
		const tagged = normalizeTagSelection(input.tags.tagIds, input.tags.newTags);
		if (!tagged.ok) return tagged;
		labels.tags = tagged.selection;
	}
	return labels;
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

/** Shared view types passed between server loads and components. */

export type CalendarDay = {
	date: string;
	durationMs: number;
	isRunning: boolean;
	/** Tags on the sessions that contributed time, most time first. */
	tags: TagView[];
};

/** The latest finished session's labels, offered again when resuming. */
export type PreviousLabelsView = {
	id: string;
	name: string | null;
	tagIds: string[];
};

export type ActiveSessionView = {
	id: string;
	/** Minute-precision start in the session's recorded zone (`YYYY-MM-DDTHH:mm`). */
	startedLocal: string;
	timeZone: string;
	name: string | null;
	tagIds: string[];
};

export type TagView = {
	id: string;
	name: string;
};

export type SessionEntry = {
	id: string;
	startedAt: number;
	endedAt: number | null;
	timeZone: string;
	name: string | null;
	tags: TagView[];
	startLocal: string;
	endLocal: string | null;
	durationMs: number;
	isRunning: boolean;
	crossesMidnight: boolean;
};

/** Shape of `fail(...)` payloads returned by form actions. */
export type ActionFormResult = {
	action?: string;
	error?: string;
	success?: boolean;
	field?: string;
	sessionId?: string;
	retryable?: boolean;
};

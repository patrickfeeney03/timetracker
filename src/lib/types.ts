/** Shared view types passed between server loads and components. */

export type CalendarDay = {
	date: string;
	durationMs: number;
	isRunning: boolean;
};

export type ActiveSessionView = {
	id: string;
	/** Minute-precision start in the session's recorded zone (`YYYY-MM-DDTHH:mm`). */
	startedLocal: string;
	timeZone: string;
};

export type SessionEntry = {
	id: string;
	startedAt: number;
	endedAt: number | null;
	timeZone: string;
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

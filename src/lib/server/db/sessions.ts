import { and, asc, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Db } from './index';
import { workSession } from './schema';

export type WorkSession = typeof workSession.$inferSelect;
export type WorkSessionInsert = typeof workSession.$inferInsert;

/** The single running session for a user, if any. */
export function getActiveSession(db: Db, userId: string): Promise<WorkSession | undefined> {
	return db
		.select()
		.from(workSession)
		.where(and(eq(workSession.userId, userId), isNull(workSession.endedAt)))
		.limit(1)
		.then((rows) => rows[0]);
}

/** Sessions owned by `userId` whose interval overlaps `[fromMs, toMs)`. */
export function listSessionsOverlapping(
	db: Db,
	userId: string,
	fromMs: number,
	toMs: number
): Promise<WorkSession[]> {
	return db
		.select()
		.from(workSession)
		.where(
			and(
				eq(workSession.userId, userId),
				lt(workSession.startedAt, toMs),
				or(gt(workSession.endedAt, fromMs), isNull(workSession.endedAt))
			)
		)
		.orderBy(asc(workSession.startedAt));
}

export function getSession(
	db: Db,
	userId: string,
	sessionId: string
): Promise<WorkSession | undefined> {
	return db
		.select()
		.from(workSession)
		.where(and(eq(workSession.userId, userId), eq(workSession.id, sessionId)))
		.limit(1)
		.then((rows) => rows[0]);
}

export async function insertSession(db: Db, values: WorkSessionInsert): Promise<WorkSession> {
	const rows = await db.insert(workSession).values(values).returning();
	return rows[0]!;
}

/**
 * Inserts `values` as the user's running session, or returns the one already
 * running, in a single statement. The partial unique index allows one running
 * session per user; on conflict the no-op update makes RETURNING yield the
 * existing row, even when two devices race.
 */
export async function insertOrGetActiveSession(
	db: Db,
	values: WorkSessionInsert
): Promise<WorkSession> {
	const rows = await db
		.insert(workSession)
		.values(values)
		.onConflictDoUpdate({
			target: workSession.userId,
			targetWhere: isNull(workSession.endedAt),
			set: { updatedAt: sql`${workSession.updatedAt}` }
		})
		.returning();
	return rows[0]!;
}

/**
 * Ends the user's running session, if any, in a single statement. The end is
 * clamped so a clock that jumped backwards can never produce negative time.
 */
export async function endActiveSession(
	db: Db,
	userId: string,
	nowMs: number
): Promise<WorkSession | undefined> {
	const rows = await db
		.update(workSession)
		.set({ endedAt: sql`max(${nowMs}, ${workSession.startedAt})`, updatedAt: nowMs })
		.where(and(eq(workSession.userId, userId), isNull(workSession.endedAt)))
		.returning();
	return rows[0];
}

export async function updateSession(
	db: Db,
	userId: string,
	sessionId: string,
	values: Partial<WorkSessionInsert>
): Promise<WorkSession | undefined> {
	const rows = await db
		.update(workSession)
		.set(values)
		.where(and(eq(workSession.userId, userId), eq(workSession.id, sessionId)))
		.returning();
	return rows[0];
}

export async function deleteSession(db: Db, userId: string, sessionId: string): Promise<number> {
	const rows = await db
		.delete(workSession)
		.where(and(eq(workSession.userId, userId), eq(workSession.id, sessionId)))
		.returning({ id: workSession.id });
	return rows.length;
}

/**
 * Finds a session that would overlap `[startMs, endMs)` for the user. A running
 * session counts as open-ended, so manual time can never be added on top of a
 * running timer.
 */
export async function findOverlappingSession(
	db: Db,
	userId: string,
	startMs: number,
	endMs: number,
	excludeSessionId?: string
): Promise<WorkSession | undefined> {
	const conditions = [
		eq(workSession.userId, userId),
		lt(workSession.startedAt, endMs),
		or(gt(workSession.endedAt, startMs), isNull(workSession.endedAt))
	];
	if (excludeSessionId) conditions.push(ne(workSession.id, excludeSessionId));

	return db
		.select()
		.from(workSession)
		.where(and(...conditions))
		.orderBy(asc(workSession.startedAt))
		.limit(1)
		.then((rows) => rows[0]);
}

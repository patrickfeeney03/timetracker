import { and, asc, eq, gt, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { TagSelection } from '$lib/labels';
import { overlapsRange } from './conditions';
import type { Db } from './index';
import { workSession } from './schema';
import { replaceTagsStatements } from './tags';

export type WorkSession = typeof workSession.$inferSelect;
export type WorkSessionInsert = typeof workSession.$inferInsert;

type ReturningSessions = BatchItem<'sqlite'> & PromiseLike<WorkSession[]>;

/**
 * Runs `query` on its own, or in one D1 batch with `tagWrites`: a single
 * round trip that commits or rolls back as a whole. `tagsFirst` is for writes
 * that change the row the tag statements select on.
 */
async function withTagWrites(
	db: Db,
	query: ReturningSessions,
	tagWrites: BatchItem<'sqlite'>[],
	tagsFirst = false
): Promise<WorkSession[]> {
	if (tagWrites.length === 0) return query;
	const items = tagsFirst ? [...tagWrites, query] : [query, ...tagWrites];
	const results = await db.batch(items as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
	return results[tagsFirst ? items.length - 1 : 0] as WorkSession[];
}

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
		.where(and(eq(workSession.userId, userId), overlapsRange(fromMs, toMs)))
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

export async function insertSession(
	db: Db,
	values: WorkSessionInsert & { id: string },
	tags?: TagSelection
): Promise<WorkSession> {
	const tagWrites = tags
		? replaceTagsStatements(
				db,
				values.userId,
				eq(workSession.id, values.id),
				tags,
				values.createdAt
			)
		: [];
	const rows = await withTagWrites(
		db,
		db.insert(workSession).values(values).returning(),
		tagWrites
	);
	return rows[0]!;
}

/**
 * Inserts `values` as the user's running session, or returns the one already
 * running, in a single statement. The partial unique index allows one running
 * session per user; on conflict the no-op update makes RETURNING yield the
 * existing row, even when two devices race. `tags` only attach to a newly
 * inserted row: they select on the new id, which loses the race.
 */
export async function insertOrGetActiveSession(
	db: Db,
	values: WorkSessionInsert & { id: string },
	tags?: TagSelection
): Promise<WorkSession> {
	const tagWrites = tags
		? replaceTagsStatements(
				db,
				values.userId,
				eq(workSession.id, values.id),
				tags,
				values.createdAt
			)
		: [];
	const query = db
		.insert(workSession)
		.values(values)
		.onConflictDoUpdate({
			target: workSession.userId,
			targetWhere: isNull(workSession.endedAt),
			set: { updatedAt: sql`${workSession.updatedAt}` }
		})
		.returning();
	const rows = await withTagWrites(db, query, tagWrites);
	return rows[0]!;
}

/**
 * Ends the user's running session, if any, in a single statement. The end is
 * clamped so a clock that jumped backwards can never produce negative time.
 * `name` and `tags`, when given, are saved in the same round trip; `undefined`
 * keeps them.
 */
export async function endActiveSession(
	db: Db,
	userId: string,
	nowMs: number,
	labels: { name?: string | null; tags?: TagSelection } = {}
): Promise<WorkSession | undefined> {
	const { name, tags } = labels;
	// Tags select the running row, so they must be written before it ends.
	const tagWrites = tags
		? replaceTagsStatements(db, userId, isNull(workSession.endedAt), tags, nowMs)
		: [];
	const query = db
		.update(workSession)
		.set({
			endedAt: sql`max(${nowMs}, ${workSession.startedAt})`,
			updatedAt: nowMs,
			...(name !== undefined && { name })
		})
		.where(and(eq(workSession.userId, userId), isNull(workSession.endedAt)))
		.returning();
	const rows = await withTagWrites(db, query, tagWrites, true);
	return rows[0];
}

export async function updateSession(
	db: Db,
	userId: string,
	sessionId: string,
	values: Partial<WorkSessionInsert> & { updatedAt: number },
	tags?: TagSelection
): Promise<WorkSession | undefined> {
	const tagWrites = tags
		? replaceTagsStatements(db, userId, eq(workSession.id, sessionId), tags, values.updatedAt)
		: [];
	const query = db
		.update(workSession)
		.set(values)
		.where(and(eq(workSession.userId, userId), eq(workSession.id, sessionId)))
		.returning();
	const rows = await withTagWrites(db, query, tagWrites);
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

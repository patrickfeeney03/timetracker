import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { TAG_COLOR_COUNT, type TagSelection } from '$lib/labels';
import type { TagView } from '$lib/types';
import type { Db } from './index';
import { tag, workSession, workSessionTag } from './schema';
import { overlapsRange } from './conditions';

export type TagRow = TagView;
export type TagLink = { sessionId: string; tagId: string };

/**
 * Every tag the user has made, alphabetically, each with its palette slot.
 * Slots follow creation order (tags made together tie-break on id), so they
 * stay put as tags are added.
 */
export async function listTags(db: Db, userId: string): Promise<TagRow[]> {
	const rows = await db
		.select({ id: tag.id, name: tag.name, createdAt: tag.createdAt })
		.from(tag)
		.where(eq(tag.userId, userId))
		.orderBy(asc(sql`lower(${tag.name})`));

	const byAge = [...rows].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
	const slots = new Map(
		byAge.map((row, index) => [row.id, index < TAG_COLOR_COUNT ? index : null])
	);
	return rows.map(({ id, name }) => ({ id, name, color: slots.get(id) ?? null }));
}

/** Tag links for the user's sessions that match `sessionWhere`. */
export function listTagLinks(db: Db, userId: string, sessionWhere: SQL): Promise<TagLink[]> {
	return db
		.select({ sessionId: workSessionTag.sessionId, tagId: workSessionTag.tagId })
		.from(workSessionTag)
		.innerJoin(workSession, eq(workSession.id, workSessionTag.sessionId))
		.where(and(eq(workSession.userId, userId), sessionWhere));
}

/**
 * Tag links for sessions overlapping `[fromMs, toMs)` plus the running one, so
 * they can be fetched in parallel with those sessions rather than after them.
 */
export function listTagLinksOverlapping(
	db: Db,
	userId: string,
	fromMs: number,
	toMs: number
): Promise<TagLink[]> {
	return listTagLinks(db, userId, or(overlapsRange(fromMs, toMs), isNull(workSession.endedAt))!);
}

/** Each session's tags, alphabetically. Links to unknown tags are skipped. */
export function groupTagsBySession(links: TagLink[], tags: TagRow[]): Map<string, TagRow[]> {
	const tagsById = new Map(tags.map((row) => [row.id, row]));
	const bySession = new Map<string, TagRow[]>();
	for (const link of links) {
		const row = tagsById.get(link.tagId);
		if (!row) continue;
		const existing = bySession.get(link.sessionId);
		if (existing) existing.push(row);
		else bySession.set(link.sessionId, [row]);
	}
	for (const rows of bySession.values()) rows.sort((a, b) => a.name.localeCompare(b.name));
	return bySession;
}

/**
 * Statements that make `selection` the complete tag set of the user's sessions
 * matching `sessionWhere`, for running inside a D1 batch so the whole write is
 * one atomic round trip:
 *
 * 1. create the new names the user does not have yet (the case-insensitive
 *    unique index turns existing ones into no-ops),
 * 2. drop the sessions' current links,
 * 3. link the picked ids and the new names. Joining on the session's owner
 *    means ids belonging to another user never match.
 */
export function replaceTagsStatements(
	db: Db,
	userId: string,
	sessionWhere: SQL,
	selection: TagSelection,
	nowMs: number
): BatchItem<'sqlite'>[] {
	const statements: BatchItem<'sqlite'>[] = [];
	const { tagIds, newTagNames } = selection;

	if (newTagNames.length > 0) {
		statements.push(
			db
				.insert(tag)
				.values(
					newTagNames.map((name) => ({ id: crypto.randomUUID(), userId, name, createdAt: nowMs }))
				)
				.onConflictDoNothing()
		);
	}

	const ownedSessions = and(eq(workSession.userId, userId), sessionWhere);
	statements.push(
		db
			.delete(workSessionTag)
			.where(
				inArray(
					workSessionTag.sessionId,
					db.select({ id: workSession.id }).from(workSession).where(ownedSessions)
				)
			)
	);

	const wanted: SQL[] = [];
	if (tagIds.length > 0) wanted.push(inArray(tag.id, tagIds));
	if (newTagNames.length > 0) {
		wanted.push(
			inArray(
				sql`lower(${tag.name})`,
				newTagNames.map((name) => name.toLowerCase())
			)
		);
	}
	if (wanted.length > 0) {
		statements.push(
			db
				.insert(workSessionTag)
				.select(
					db
						.select({ sessionId: workSession.id, tagId: tag.id })
						.from(workSession)
						.innerJoin(tag, eq(tag.userId, workSession.userId))
						.where(and(ownedSessions, or(...wanted)))
				)
				.onConflictDoNothing()
		);
	}

	return statements;
}

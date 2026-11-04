import { and, eq, isNull } from 'drizzle-orm';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { getDb, type Db } from '$lib/server/db';
import { listSessionsOverlapping } from '$lib/server/db/sessions';
import { tag, user as userTable, workSession, workSessionTag } from '$lib/server/db/schema';
import { listTags } from '$lib/server/db/tags';
import {
	addManualSession,
	editSession,
	pauseTimer,
	removeSession,
	startTimer,
	updateSessionLabels
} from './service';

/**
 * Integration tests against a real D1 database running in Miniflare through
 * Wrangler's platform proxy. The versioned SQL migrations in `drizzle/` are
 * applied before the suite, so partial indexes and constraints are exercised.
 */

const USER_A = 'user-a';
const USER_B = 'user-b';
const BASE = Date.parse('2026-09-18T12:00:00Z');

let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
let db: Db;
let persistPath: string;

const context = (userId: string, nowMs = BASE) => ({ db, userId, nowMs });

beforeAll(async () => {
	persistPath = mkdtempSync(join(tmpdir(), 'timetracker-d1-'));
	proxy = await getPlatformProxy<Env>({
		configPath: 'wrangler.jsonc',
		persist: { path: persistPath }
	});
	db = getDb(proxy.env.DB);
	await applyMigrations(proxy.env.DB);
	await db.insert(userTable).values([
		{
			id: USER_A,
			name: 'User A',
			email: 'a@example.com',
			emailVerified: true,
			createdAt: new Date(BASE),
			updatedAt: new Date(BASE)
		},
		{
			id: USER_B,
			name: 'User B',
			email: 'b@example.com',
			emailVerified: true,
			createdAt: new Date(BASE),
			updatedAt: new Date(BASE)
		}
	]);
}, 90_000);

afterAll(async () => {
	await proxy?.dispose();
	rmSync(persistPath, { recursive: true, force: true });
});

beforeEach(async () => {
	await db.delete(workSession);
	await db.delete(tag);
});

/** Names of the tags on a session, alphabetically. */
async function tagNamesOf(sessionId: string): Promise<string[]> {
	const rows = await db
		.select({ name: tag.name })
		.from(workSessionTag)
		.innerJoin(tag, eq(tag.id, workSessionTag.tagId))
		.where(eq(workSessionTag.sessionId, sessionId));
	return rows.map((row) => row.name).sort();
}

const newTags = (names: string, tagIds: string[] = []) => ({ tags: { tagIds, newTags: names } });

describe('startTimer', () => {
	it('creates a running session with the captured timezone', async () => {
		const result = await startTimer(context(USER_A), 'America/New_York');
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.session.endedAt).toBeNull();
		expect(result.session.startedAt).toBe(BASE);
		expect(result.session.timeZone).toBe('America/New_York');
	});

	it('is idempotent while a timer is running', async () => {
		const first = await startTimer(context(USER_A), 'America/New_York');
		const second = await startTimer(context(USER_A, BASE + 60_000), 'Asia/Tokyo');
		if (!first.ok || !second.ok) throw new Error('expected successful starts');

		expect(second.session.id).toBe(first.session.id);
		expect(second.session.startedAt).toBe(BASE);
		expect(second.session.timeZone).toBe('America/New_York');
	});

	it('stores a trimmed name, and blank as unnamed', async () => {
		const named = await startTimer(context(USER_A), 'UTC', { name: '  Writing docs  ' });
		if (!named.ok) throw new Error(named.message);
		expect(named.session.name).toBe('Writing docs');

		await pauseTimer(context(USER_A, BASE + 1_000));
		const blank = await startTimer(context(USER_A, BASE + 2_000), 'UTC', { name: '   ' });
		if (!blank.ok) throw new Error(blank.message);
		expect(blank.session.name).toBeNull();
	});

	it('rejects an overlong name without starting', async () => {
		const result = await startTimer(context(USER_A), 'UTC', { name: 'x'.repeat(201) });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.field).toBe('name');
		expect(await db.select().from(workSession)).toHaveLength(0);
	});

	it('keeps the running session’s name on a repeated start', async () => {
		await startTimer(context(USER_A), 'UTC', { name: 'First' });
		const again = await startTimer(context(USER_A, BASE + 1_000), 'UTC', { name: 'Second' });
		if (!again.ok) throw new Error(again.message);
		expect(again.session.name).toBe('First');
	});

	it('rejects an unknown timezone', async () => {
		const result = await startTimer(context(USER_A), 'Mars/Olympus');
		expect(result.ok).toBe(false);
		expect(await db.select().from(workSession)).toHaveLength(0);
	});

	it('enforces at most one active timer per user under concurrent starts', async () => {
		const results = await Promise.all(
			Array.from({ length: 4 }, () => startTimer(context(USER_A), 'UTC'))
		);
		for (const result of results) expect(result.ok).toBe(true);

		const ids = new Set(results.map((result) => (result.ok ? result.session.id : 'failed')));
		expect(ids.size).toBe(1);

		const active = await db
			.select()
			.from(workSession)
			.where(and(eq(workSession.userId, USER_A), isNull(workSession.endedAt)));
		expect(active).toHaveLength(1);
	});

	it('gives each user their own active timer', async () => {
		const a = await startTimer(context(USER_A), 'UTC');
		const b = await startTimer(context(USER_B), 'UTC');
		if (!a.ok || !b.ok) throw new Error('expected successful starts');
		expect(a.session.id).not.toBe(b.session.id);
	});
});

describe('pauseTimer', () => {
	it('pauses with a server timestamp and is a no-op when idle', async () => {
		await startTimer(context(USER_A, BASE), 'UTC');
		const paused = await pauseTimer(context(USER_A, BASE + 90_000));
		if (!paused.ok) throw new Error('expected ok');
		expect(paused.session?.endedAt).toBe(BASE + 90_000);

		const again = await pauseTimer(context(USER_A, BASE + 120_000));
		expect(again.ok).toBe(true);
		if (again.ok) expect(again.session).toBeNull();
	});

	it('saves a submitted name on pause and keeps the name when none is sent', async () => {
		await startTimer(context(USER_A, BASE), 'UTC', { name: 'Before' });
		const renamed = await pauseTimer(context(USER_A, BASE + 1_000), { name: 'After' });
		if (!renamed.ok) throw new Error(renamed.message);
		expect(renamed.session?.name).toBe('After');

		await startTimer(context(USER_A, BASE + 2_000), 'UTC', { name: 'Kept' });
		const kept = await pauseTimer(context(USER_A, BASE + 3_000));
		if (!kept.ok) throw new Error(kept.message);
		expect(kept.session?.name).toBe('Kept');
	});

	it('does not pause when the submitted name is invalid', async () => {
		await startTimer(context(USER_A, BASE), 'UTC');
		const result = await pauseTimer(context(USER_A, BASE + 1_000), { name: 'x'.repeat(201) });
		expect(result.ok).toBe(false);

		const active = await db
			.select()
			.from(workSession)
			.where(and(eq(workSession.userId, USER_A), isNull(workSession.endedAt)));
		expect(active).toHaveLength(1);
	});

	it('never ends a session before it started when the clock jumps backwards', async () => {
		await startTimer(context(USER_A, BASE), 'UTC');
		const paused = await pauseTimer(context(USER_A, BASE - 5_000));
		if (!paused.ok) throw new Error('expected ok');
		expect(paused.session?.endedAt).toBe(BASE);
	});

	it('never pauses another user\u2019s timer', async () => {
		await startTimer(context(USER_A), 'UTC');
		const paused = await pauseTimer(context(USER_B, BASE + 1_000));
		if (!paused.ok) throw new Error('expected ok');
		expect(paused.session).toBeNull();

		const activeA = await db
			.select()
			.from(workSession)
			.where(and(eq(workSession.userId, USER_A), isNull(workSession.endedAt)));
		expect(activeA).toHaveLength(1);
	});
});

describe('addManualSession', () => {
	const input = (startLocal: string, endLocal: string, timeZone = 'UTC') => ({
		startLocal,
		endLocal,
		timeZone
	});

	it('adds a valid session', async () => {
		const result = await addManualSession(
			context(USER_A),
			input('2026-09-18T09:00', '2026-09-18T10:30')
		);
		if (!result.ok) throw new Error(result.message);
		expect(result.session.endedAt! - result.session.startedAt).toBe(90 * 60_000);
		expect(result.session.name).toBeNull();
	});

	it('stores an optional name', async () => {
		const result = await addManualSession(context(USER_A), {
			...input('2026-09-18T09:00', '2026-09-18T10:00'),
			name: ' Planning '
		});
		if (!result.ok) throw new Error(result.message);
		expect(result.session.name).toBe('Planning');
	});

	it('rejects invalid input without writing anything', async () => {
		const invalid = [
			input('2026-09-18T10:00', '2026-09-18T10:00'),
			input('2026-09-18T11:00', '2026-09-18T10:00'),
			input('2026-09-18T09:00', '2026-09-18T10:00', 'Mars/Olympus'),
			input('not-a-time', '2026-09-18T10:00')
		];

		for (const value of invalid) {
			const result = await addManualSession(context(USER_A), value);
			expect(result.ok).toBe(false);
		}
		expect(await db.select().from(workSession)).toHaveLength(0);
	});

	it('rejects overlapping sessions but allows touching boundaries', async () => {
		await addManualSession(context(USER_A), input('2026-09-18T09:00', '2026-09-18T10:00'));

		expect(
			(await addManualSession(context(USER_A), input('2026-09-18T09:30', '2026-09-18T10:30'))).ok
		).toBe(false);
		expect(
			(await addManualSession(context(USER_A), input('2026-09-18T08:00', '2026-09-18T09:00'))).ok
		).toBe(true);
		expect(
			(await addManualSession(context(USER_A), input('2026-09-18T10:00', '2026-09-18T11:00'))).ok
		).toBe(true);
	});

	it('rejects manual time that overlaps the running timer', async () => {
		await startTimer(context(USER_A, BASE), 'UTC');
		const result = await addManualSession(
			context(USER_A),
			input('2026-09-18T11:30', '2026-09-18T12:30')
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain('running timer');
	});

	it('does not let another user\u2019s session block the timeslot', async () => {
		await addManualSession(context(USER_A), input('2026-09-18T09:00', '2026-09-18T10:00'));
		const result = await addManualSession(
			context(USER_B),
			input('2026-09-18T09:30', '2026-09-18T10:30')
		);
		expect(result.ok).toBe(true);
	});
});

describe('editSession', () => {
	const input = (startLocal: string, endLocal: string, timeZone = 'UTC') => ({
		startLocal,
		endLocal,
		timeZone
	});

	it('updates an owned session', async () => {
		const added = await addManualSession(
			context(USER_A),
			input('2026-09-18T09:00', '2026-09-18T10:00')
		);
		if (!added.ok) throw new Error(added.message);

		const edited = await editSession(
			context(USER_A),
			added.session.id,
			input('2026-09-18T08:00', '2026-09-18T10:30')
		);
		if (!edited.ok) throw new Error(edited.message);
		expect(edited.session.startedAt).toBe(Date.parse('2026-09-18T08:00:00Z'));
		expect(edited.session.endedAt).toBe(Date.parse('2026-09-18T10:30:00Z'));
	});

	it('sets and clears the name', async () => {
		const added = await addManualSession(context(USER_A), {
			...input('2026-09-18T09:00', '2026-09-18T10:00'),
			name: 'Original'
		});
		if (!added.ok) throw new Error(added.message);

		const renamed = await editSession(context(USER_A), added.session.id, {
			...input('2026-09-18T09:00', '2026-09-18T10:00'),
			name: 'Renamed'
		});
		if (!renamed.ok) throw new Error(renamed.message);
		expect(renamed.session.name).toBe('Renamed');

		const cleared = await editSession(context(USER_A), added.session.id, {
			...input('2026-09-18T09:00', '2026-09-18T10:00'),
			name: ''
		});
		if (!cleared.ok) throw new Error(cleared.message);
		expect(cleared.session.name).toBeNull();
	});

	it('refuses sessions owned by another user', async () => {
		const added = await addManualSession(
			context(USER_A),
			input('2026-09-18T09:00', '2026-09-18T10:00')
		);
		if (!added.ok) throw new Error(added.message);

		const edited = await editSession(
			context(USER_B),
			added.session.id,
			input('2026-09-18T08:00', '2026-09-18T10:00')
		);
		expect(edited.ok).toBe(false);

		const rows = await db.select().from(workSession);
		expect(rows[0]!.startedAt).toBe(Date.parse('2026-09-18T09:00:00Z'));
	});

	it('refuses to edit a running session', async () => {
		const started = await startTimer(context(USER_A), 'UTC');
		if (!started.ok) throw new Error(started.message);

		const edited = await editSession(
			context(USER_A),
			started.session.id,
			input('2026-09-18T11:00', '2026-09-18T12:00')
		);
		expect(edited.ok).toBe(false);
		if (!edited.ok) expect(edited.message).toContain('Pause');
	});

	it('rejects overlap with other sessions but not with itself', async () => {
		const first = await addManualSession(
			context(USER_A),
			input('2026-09-18T09:00', '2026-09-18T10:00')
		);
		const second = await addManualSession(
			context(USER_A),
			input('2026-09-18T11:00', '2026-09-18T12:00')
		);
		if (!first.ok || !second.ok) throw new Error('setup failed');

		const overlapping = await editSession(
			context(USER_A),
			first.session.id,
			input('2026-09-18T09:30', '2026-09-18T11:30')
		);
		expect(overlapping.ok).toBe(false);

		const touching = await editSession(
			context(USER_A),
			second.session.id,
			input('2026-09-18T10:00', '2026-09-18T12:00')
		);
		expect(touching.ok).toBe(true);
	});

	it('keeps the instant when the timezone changes', async () => {
		const added = await addManualSession(
			context(USER_A),
			input('2026-01-01T00:30', '2026-01-01T01:30', 'UTC')
		);
		if (!added.ok) throw new Error(added.message);

		// Same two instants expressed in New York local time (EST, UTC-5).
		const edited = await editSession(
			context(USER_A),
			added.session.id,
			input('2025-12-31T19:30', '2025-12-31T20:30', 'America/New_York')
		);
		if (!edited.ok) throw new Error(edited.message);

		expect(edited.session.startedAt).toBe(Date.parse('2026-01-01T00:30:00Z'));
		expect(edited.session.endedAt).toBe(Date.parse('2026-01-01T01:30:00Z'));
		expect(edited.session.timeZone).toBe('America/New_York');
	});
});

describe('updateSessionLabels', () => {
	it('renames the running session without pausing it', async () => {
		const started = await startTimer(context(USER_A, BASE), 'UTC');
		if (!started.ok) throw new Error(started.message);

		const renamed = await updateSessionLabels(context(USER_A, BASE + 1_000), started.session.id, {
			name: 'Deep work'
		});
		if (!renamed.ok) throw new Error(renamed.message);
		expect(renamed.session.name).toBe('Deep work');
		expect(renamed.session.endedAt).toBeNull();
		expect(renamed.session.startedAt).toBe(BASE);
	});

	it('clears a name when given blank input', async () => {
		const started = await startTimer(context(USER_A), 'UTC', { name: 'Temporary' });
		if (!started.ok) throw new Error(started.message);

		const cleared = await updateSessionLabels(context(USER_A), started.session.id, { name: '  ' });
		if (!cleared.ok) throw new Error(cleared.message);
		expect(cleared.session.name).toBeNull();
	});

	it('refuses sessions owned by another user', async () => {
		const started = await startTimer(context(USER_A), 'UTC', { name: 'Mine' });
		if (!started.ok) throw new Error(started.message);

		const result = await updateSessionLabels(context(USER_B), started.session.id, {
			name: 'Theirs'
		});
		expect(result.ok).toBe(false);
		const rows = await db.select().from(workSession);
		expect(rows[0]!.name).toBe('Mine');
	});
});

describe('tags', () => {
	it('creates new tags on start and links them to the new session', async () => {
		const started = await startTimer(context(USER_A), 'UTC', newTags('reading, coding'));
		if (!started.ok) throw new Error(started.message);

		expect(await tagNamesOf(started.session.id)).toEqual(['coding', 'reading']);
		expect((await listTags(db, USER_A)).map((row) => row.name)).toEqual(['coding', 'reading']);
	});

	it('reuses an existing tag by name regardless of case', async () => {
		const first = await addManualSession(context(USER_A), {
			startLocal: '2026-09-18T08:00',
			endLocal: '2026-09-18T09:00',
			timeZone: 'UTC',
			...newTags('Coding')
		});
		const second = await addManualSession(context(USER_A), {
			startLocal: '2026-09-18T09:00',
			endLocal: '2026-09-18T10:00',
			timeZone: 'UTC',
			...newTags('coding')
		});
		if (!first.ok || !second.ok) throw new Error('setup failed');

		const tags = await listTags(db, USER_A);
		expect(tags.map((row) => row.name)).toEqual(['Coding']);
		expect(await tagNamesOf(second.session.id)).toEqual(['Coding']);
	});

	it('links picked tags by id and ignores ids owned by another user', async () => {
		await startTimer(context(USER_B), 'UTC', newTags('secret'));
		await pauseTimer(context(USER_B, BASE + 1_000));
		await startTimer(context(USER_A), 'UTC', newTags('reading'));
		await pauseTimer(context(USER_A, BASE + 1_000));
		const [mine] = await listTags(db, USER_A);
		const [theirs] = await listTags(db, USER_B);

		const started = await startTimer(context(USER_A, BASE + 2_000), 'UTC', {
			tags: { tagIds: [mine!.id, theirs!.id], newTags: '' }
		});
		if (!started.ok) throw new Error(started.message);
		expect(await tagNamesOf(started.session.id)).toEqual(['reading']);
	});

	it('does not retag the running session on a repeated start', async () => {
		const first = await startTimer(context(USER_A), 'UTC', newTags('reading'));
		await startTimer(context(USER_A, BASE + 1_000), 'UTC', newTags('coding'));
		if (!first.ok) throw new Error(first.message);
		expect(await tagNamesOf(first.session.id)).toEqual(['reading']);
	});

	it('replaces, keeps and clears tags on the running session', async () => {
		const started = await startTimer(context(USER_A), 'UTC', newTags('reading'));
		if (!started.ok) throw new Error(started.message);
		const id = started.session.id;

		await updateSessionLabels(context(USER_A), id, newTags('coding'));
		expect(await tagNamesOf(id)).toEqual(['coding']);

		// No tag field means the tags are left alone.
		await updateSessionLabels(context(USER_A), id, { name: 'Renamed' });
		expect(await tagNamesOf(id)).toEqual(['coding']);

		await updateSessionLabels(context(USER_A), id, newTags(''));
		expect(await tagNamesOf(id)).toEqual([]);
	});

	it('saves submitted tags when pausing, and keeps them when none are sent', async () => {
		const first = await startTimer(context(USER_A, BASE), 'UTC', newTags('reading'));
		const paused = await pauseTimer(context(USER_A, BASE + 1_000), newTags('coding'));
		if (!first.ok || !paused.ok) throw new Error('setup failed');
		expect(paused.session?.endedAt).toBe(BASE + 1_000);
		expect(await tagNamesOf(first.session.id)).toEqual(['coding']);

		const second = await startTimer(context(USER_A, BASE + 2_000), 'UTC', newTags('reading'));
		await pauseTimer(context(USER_A, BASE + 3_000));
		if (!second.ok) throw new Error(second.message);
		expect(await tagNamesOf(second.session.id)).toEqual(['reading']);
	});

	it('edits tags with the rest of a finished session', async () => {
		const added = await addManualSession(context(USER_A), {
			startLocal: '2026-09-18T09:00',
			endLocal: '2026-09-18T10:00',
			timeZone: 'UTC',
			...newTags('reading')
		});
		if (!added.ok) throw new Error(added.message);

		const edited = await editSession(context(USER_A), added.session.id, {
			startLocal: '2026-09-18T09:00',
			endLocal: '2026-09-18T11:00',
			timeZone: 'UTC',
			...newTags('coding, notes')
		});
		if (!edited.ok) throw new Error(edited.message);
		expect(await tagNamesOf(added.session.id)).toEqual(['coding', 'notes']);
	});

	it('rejects invalid tags without writing anything', async () => {
		const result = await startTimer(context(USER_A), 'UTC', newTags('x'.repeat(41)));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.field).toBe('tags');
		expect(await db.select().from(workSession)).toHaveLength(0);
		expect(await listTags(db, USER_A)).toHaveLength(0);
	});

	it('drops links but keeps the tag when a session is deleted', async () => {
		const added = await addManualSession(context(USER_A), {
			startLocal: '2026-09-18T09:00',
			endLocal: '2026-09-18T10:00',
			timeZone: 'UTC',
			...newTags('reading')
		});
		if (!added.ok) throw new Error(added.message);

		await removeSession(context(USER_A), added.session.id);
		expect(await db.select().from(workSessionTag)).toHaveLength(0);
		expect(await listTags(db, USER_A)).toHaveLength(1);
	});

	it('lets each user have a tag with the same name', async () => {
		await startTimer(context(USER_A), 'UTC', newTags('reading'));
		await startTimer(context(USER_B), 'UTC', newTags('reading'));
		expect(await listTags(db, USER_A)).toHaveLength(1);
		expect(await listTags(db, USER_B)).toHaveLength(1);
	});
});

describe('removeSession', () => {
	it('deletes only sessions owned by the user', async () => {
		const added = await addManualSession(context(USER_A), {
			startLocal: '2026-09-18T09:00',
			endLocal: '2026-09-18T10:00',
			timeZone: 'UTC'
		});
		if (!added.ok) throw new Error(added.message);

		const foreign = await removeSession(context(USER_B), added.session.id);
		expect(foreign.ok).toBe(false);
		expect(await db.select().from(workSession)).toHaveLength(1);

		const own = await removeSession(context(USER_A), added.session.id);
		expect(own.ok).toBe(true);
		expect(await db.select().from(workSession)).toHaveLength(0);
	});
});

describe('user isolation', () => {
	it('only ever returns a user\u2019s own sessions', async () => {
		await addManualSession(context(USER_A), {
			startLocal: '2026-09-18T09:00',
			endLocal: '2026-09-18T10:00',
			timeZone: 'UTC'
		});
		await addManualSession(context(USER_B), {
			startLocal: '2026-09-18T09:15',
			endLocal: '2026-09-18T09:45',
			timeZone: 'UTC'
		});

		const from = Date.parse('2026-09-18T00:00:00Z');
		const to = Date.parse('2026-09-19T00:00:00Z');
		const rows = await listSessionsOverlapping(db, USER_A, from, to);

		expect(rows).toHaveLength(1);
		expect(rows.every((row) => row.userId === USER_A)).toBe(true);
	});
});

async function applyMigrations(d1: D1Database) {
	const directory = join(process.cwd(), 'drizzle');
	const files = readdirSync(directory)
		.filter((file) => file.endsWith('.sql'))
		.sort();

	for (const file of files) {
		const sql = readFileSync(join(directory, file), 'utf8');
		for (const statement of sql.split('--> statement-breakpoint')) {
			const trimmed = statement.trim();
			if (trimmed) await d1.prepare(trimmed).run();
		}
	}
}

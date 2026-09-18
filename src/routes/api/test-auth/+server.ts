import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { user as userTable, workSession } from '$lib/server/db/schema';
import { isTestAuthEnabled } from '$lib/server/test-auth';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';

/**
 * Playwright-only authentication fixture. The route answers only when
 * `ENABLE_TEST_AUTH` is "true", which never happens in production: the default
 * in `wrangler.jsonc` is "false" and the value is only overridden by the e2e
 * dev server command.
 */
export const POST: RequestHandler = async ({ request, platform, cookies }) => {
	const env = platform?.env;
	if (!env || !isTestAuthEnabled(env)) error(404, 'Not found');

	const body = (await request.json().catch(() => null)) as {
		email?: unknown;
		reset?: unknown;
	} | null;
	const email =
		typeof body?.email === 'string' && body.email.includes('@')
			? body.email
			: `test-${crypto.randomUUID()}@example.com`;

	const db = getDb(env.DB);
	let user = (await db.select().from(userTable).where(eq(userTable.email, email)).limit(1))[0];

	if (!user) {
		user = (
			await db
				.insert(userTable)
				.values({
					id: crypto.randomUUID(),
					name: email.split('@')[0] || 'Test User',
					email,
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date()
				})
				.returning()
		)[0]!;
	}

	if (body?.reset === true) {
		await db.delete(workSession).where(eq(workSession.userId, user.id));
	}

	cookies.set('test_auth_user_id', user.id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 8
	});

	return json({ id: user.id, email: user.email });
};

/** Signs the fixture out by clearing its cookie. */
export const DELETE: RequestHandler = async ({ platform, cookies }) => {
	const env = platform?.env;
	if (!env || !isTestAuthEnabled(env)) error(404, 'Not found');
	cookies.delete('test_auth_user_id', { path: '/' });
	return json({ ok: true });
};

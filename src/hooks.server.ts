import { building } from '$app/environment';
import { getAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';
import { decideNavigation } from '$lib/server/navigation';
import { isTestAuthEnabled } from '$lib/server/test-auth';
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { eq } from 'drizzle-orm';

const D1_BOOKMARK_COOKIE = 'd1_bookmark';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const env = event.platform?.env;
	if (!env?.DB) {
		throw new Error('Missing D1 binding "DB". Run `npm run gen` and check wrangler.jsonc.');
	}

	const origin = event.url.origin;
	const auth = getAuth(env, origin);
	event.locals.auth = auth;
	event.locals.user = null;
	event.locals.session = null;

	// Reads go to the nearest D1 read replica. Form actions start on the primary
	// so their checks see the latest data, and they hand the browser a bookmark
	// so the reload that follows a write reads from a replica at least that
	// fresh. Writes always go to the primary.
	const isWrite = event.request.method !== 'GET' && event.request.method !== 'HEAD';
	const d1 = env.DB.withSession(
		isWrite ? 'first-primary' : (event.cookies.get(D1_BOOKMARK_COOKIE) ?? 'first-unconstrained')
	);
	event.locals.db = getDb(d1);

	// Playwright fixture: ENABLE_TEST_AUTH is "false" in wrangler.jsonc and is
	// only overridden by the e2e dev server. It lets tests authenticate without
	// a real Google round trip. Never enable this in production.
	const testUserId = isTestAuthEnabled(env) ? event.cookies.get('test_auth_user_id') : undefined;

	if (testUserId) {
		const testUser = await getDb(env.DB)
			.select()
			.from(userTable)
			.where(eq(userTable.id, testUserId))
			.limit(1)
			.then((rows) => rows[0]);

		if (testUser) {
			const now = new Date();
			event.locals.user = testUser;
			event.locals.session = {
				id: `test-session-${testUser.id}`,
				token: 'test-session',
				userId: testUser.id,
				expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
				createdAt: now,
				updatedAt: now,
				ipAddress: null,
				userAgent: 'playwright'
			};
		}
	}

	if (!event.locals.user) {
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session) {
			event.locals.user = session.user;
			event.locals.session = session.session;
		}
	}

	const decision = decideNavigation(event.url.pathname, Boolean(event.locals.user));
	if (decision === 'login') {
		const redirectTo = `${event.url.pathname}${event.url.search}`;
		redirect(303, `/login?redirectTo=${encodeURIComponent(redirectTo)}`);
	}
	if (decision === 'home') {
		redirect(303, '/');
	}

	const response = await svelteKitHandler({ auth, event, resolve, building });

	const bookmark = isWrite ? d1.getBookmark() : null;
	if (bookmark) {
		// `event.cookies` is already applied once `resolve` returns, so append
		// the header directly. Replicas catch up within seconds; a short life
		// keeps a stale bookmark from pinning reads for long.
		const secure = event.url.protocol === 'https:' ? '; Secure' : '';
		response.headers.append(
			'set-cookie',
			`${D1_BOOKMARK_COOKIE}=${encodeURIComponent(bookmark)}; Path=/; Max-Age=300; HttpOnly; SameSite=Lax${secure}`
		);
	}
	return response;
};

/**
 * Logs safe server-side error context for Worker observability. Request headers,
 * cookies and the platform env are deliberately never logged: they can carry
 * OAuth tokens, session tokens and secrets.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const context = {
		status,
		message,
		method: event.request.method,
		path: event.url.pathname,
		error:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: { value: String(error) }
	};
	console.error(JSON.stringify(context));
	return {
		message:
			status === 404 ? 'This page does not exist.' : 'Something went wrong. Please try again.'
	};
};

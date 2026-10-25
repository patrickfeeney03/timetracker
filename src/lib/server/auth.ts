import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import * as schema from './db/schema';
import { getDb } from './db';

/** The Better Auth instance stored in `event.locals.auth`. */
export type Auth = ReturnType<typeof createAuth>;

/**
 * The subset of the Cloudflare environment that authentication needs. `DB` is
 * the typed D1 binding from `wrangler.jsonc`; the rest come from wrangler
 * secrets and `[vars]` (see `.dev.vars.example`).
 */
export type AuthEnv = {
	DB: D1Database;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	ENABLE_TEST_AUTH?: string;
};

const TEST_AUTH_SECRET = 'test-only-secret-enabled-by-ENABLE_TEST_AUTH';

const instances = new Map<string, Auth>();

/**
 * Returns the Better Auth instance for `origin`, building it on first use.
 * Bindings and secrets are fixed for the lifetime of a Worker isolate, so the
 * instance (and its setup cost) is shared by every request the isolate serves.
 * Better Auth copies its context per call, so no request state leaks between
 * requests. Keyed by origin because the base URL and trusted origins derive
 * from it: localhost, preview URLs and the custom domain each get their own.
 */
export function getAuth(env: AuthEnv, origin: string): Auth {
	let auth = instances.get(origin);
	if (!auth) {
		auth = createAuth(env, origin);
		instances.set(origin, auth);
	}
	return auth;
}

/**
 * Builds a Better Auth instance wired to the Drizzle schema. D1 bindings are
 * only available through `platform.env`, so it cannot be built at module load.
 * When `BETTER_AUTH_URL` is not set, the base URL is the origin of the incoming
 * request, which keeps local, preview and production OAuth callbacks working
 * without hardcoding hosts.
 */
function createAuth(env: AuthEnv, origin?: string) {
	const baseURL = env.BETTER_AUTH_URL || origin;
	const secret =
		env.BETTER_AUTH_SECRET || (env.ENABLE_TEST_AUTH === 'true' ? TEST_AUTH_SECRET : undefined);

	return betterAuth({
		appName: 'Work Time Tracker',
		baseURL,
		secret,
		database: drizzleAdapter(getDb(env.DB), {
			provider: 'sqlite',
			schema
		}),
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID ?? '',
				clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
				// Basic identity only: OpenID, profile and email.
				scope: ['openid', 'profile', 'email']
			}
		},
		trustedOrigins: origin ? [origin] : [],
		session: {
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24,
			// A signed cookie carries the session and user for 15 minutes, so most
			// requests skip the two sequential D1 lookups. Revoking a session takes
			// up to that long to apply on devices that already hold the cookie.
			cookieCache: {
				enabled: true,
				maxAge: 15 * 60
			}
		},
		// `auth.api.getSession` in hooks refreshes the cache cookie once it
		// expires; this forwards those Set-Cookie headers to the response.
		plugins: [sveltekitCookies(getRequestEvent)]
	});
}

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from './db/schema';
import { getDb } from './db';

/** The request-scoped Better Auth instance stored in `event.locals.auth`. */
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

/**
 * Builds a request-scoped Better Auth instance. D1 bindings are only available
 * through `platform.env`, so the instance is created per request and wired to
 * the Drizzle schema. When `BETTER_AUTH_URL` is not set, the base URL is the
 * origin of the incoming request, which keeps local, preview and production
 * OAuth callbacks working without hardcoding hosts.
 */
export function createAuth(env: AuthEnv, origin?: string) {
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
			updateAge: 60 * 60 * 24
		}
	});
}

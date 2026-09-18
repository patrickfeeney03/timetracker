import type { SessionRecord, SessionUser } from '$lib/server/auth-types';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			auth: import('$lib/server/auth').Auth;
			user: SessionUser | null;
			session: SessionRecord | null;
		}
	}
}

export {};

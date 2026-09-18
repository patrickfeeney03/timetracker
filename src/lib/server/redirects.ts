import { isValidDate } from '$lib/time';

/**
 * Only known, same-origin routes are accepted as post-login targets. Unknown
 * paths (typos, stale bookmarks, another app that shared the origin) fall back
 * to the dashboard, and protocol-relative URLs like `//evil.example` can never
 * be used as an open redirect.
 */
export function safeRedirectTarget(requested: string | null | undefined): string {
	if (!requested || !requested.startsWith('/') || requested.startsWith('//')) return '/';

	try {
		const url = new URL(requested, 'https://local.invalid');
		if (url.pathname === '/') return `/${url.search}`;

		const historyMatch = url.pathname.match(/^\/history\/([^/]+)$/);
		if (historyMatch && isValidDate(historyMatch[1])) return url.pathname;
	} catch {
		// Malformed input falls through to the default.
	}

	return '/';
}

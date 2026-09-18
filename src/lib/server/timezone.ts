import { isTimeZone } from '$lib/time';

/** Cookie the browser writes with its current IANA zone (see `+layout.svelte`). */
export const TIME_ZONE_COOKIE = 'tz';

type CookieReader = { get(name: string): string | undefined };

/**
 * The device timezone is used for "today" and for prefilling new sessions. The
 * recorded zone of an existing session always takes precedence over it.
 *
 * Order of preference:
 * 1. the `tz` cookie written by the browser,
 * 2. Cloudflare's `request.cf.timezone` (always present on deployed Workers),
 * 3. UTC for exotic environments.
 */
export function readDeviceTimeZone(cookies: CookieReader, cfTimeZone?: string): string {
	const value = cookies.get(TIME_ZONE_COOKIE);
	if (value && isTimeZone(value)) return value;
	if (cfTimeZone && isTimeZone(cfTimeZone)) return cfTimeZone;
	return 'UTC';
}

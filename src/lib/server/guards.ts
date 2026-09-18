import { redirect } from '@sveltejs/kit';
import type { SessionUser } from './auth-types';

/** Returns the authenticated user or redirects to the login page. */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) redirect(303, '/login');
	return locals.user;
}

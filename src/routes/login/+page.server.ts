import { redirect } from '@sveltejs/kit';
import { safeRedirectTarget } from '$lib/server/redirects';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/');

	return { redirectTo: safeRedirectTarget(url.searchParams.get('redirectTo')) };
};

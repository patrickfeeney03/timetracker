import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const handler: RequestHandler = ({ request, locals }) => {
	if (!locals.auth) error(500, 'Authentication is not configured.');
	return locals.auth.handler(request);
};

export const GET = handler;
export const POST = handler;

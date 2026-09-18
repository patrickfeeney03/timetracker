import type { LayoutServerLoad } from './$types';
import { readDeviceTimeZone } from '$lib/server/timezone';

export const load: LayoutServerLoad = ({ locals, cookies, platform }) => {
	return {
		user: locals.user,
		deviceTimeZone: readDeviceTimeZone(cookies, platform?.cf?.timezone)
	};
};

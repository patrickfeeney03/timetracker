import { applyAction } from '$app/forms';
import type { SubmitFunction } from '@sveltejs/kit';

export type SubmitHandlerOptions = {
	setSubmitting: (value: boolean) => void;
	setError: (message: string | null) => void;
	onSuccess?: () => void;
	/** Return false to abort the submission (used for delete confirmation). */
	confirm?: () => boolean;
};

/**
 * Progressive-enhancement submit handler. Local timer and form state only
 * reflects what the server confirms: a failed or unreachable write leaves the
 * authoritative page data untouched and shows a retry message.
 */
export function createSubmitHandler(options: SubmitHandlerOptions): SubmitFunction {
	return ({ cancel }) => {
		if (options.confirm && !options.confirm()) return cancel();

		options.setSubmitting(true);
		options.setError(null);

		return async ({ result, update }) => {
			options.setSubmitting(false);

			if (result.type === 'error') {
				options.setError(
					'Could not reach the server, so nothing was changed. Check your connection and try again.'
				);
				return;
			}

			await applyAction(result);
			if (result.type === 'success') {
				options.setError(null);
				options.onSuccess?.();
			}
			// Always re-read authoritative server state after a completed round trip.
			if (result.type !== 'redirect') await update({ reset: false });
		};
	};
}

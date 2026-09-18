import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SessionForm from './SessionForm.svelte';

const baseProps = {
	mode: 'add' as const,
	start: '2026-09-18T09:00',
	end: '2026-09-18T10:30',
	timeZone: 'Europe/Berlin',
	deviceTimeZone: 'Europe/Berlin'
};

describe('SessionForm.svelte', () => {
	it('prefills minute-level values and a timezone picker', async () => {
		await render(SessionForm, baseProps);

		await expect.element(page.getByTestId('add-start')).toHaveValue('2026-09-18T09:00');
		await expect.element(page.getByTestId('add-end')).toHaveValue('2026-09-18T10:30');
		await expect.element(page.getByTestId('add-timezone')).toHaveValue('Europe/Berlin');
	});

	it('renders server validation errors and keeps the form usable for retry', async () => {
		await render(SessionForm, {
			...baseProps,
			error: 'The end time must be after the start time.'
		});

		await expect.element(page.getByTestId('session-form-error')).toHaveTextContent('end time');
		await expect.element(page.getByTestId('add-submit')).toBeEnabled();
	});

	it('offers cancel for the inline edit form', async () => {
		const onCancel = vi.fn();
		await render(SessionForm, {
			...baseProps,
			mode: 'edit',
			sessionId: 'session-1',
			onCancel
		});

		await page.getByText('Cancel').click();
		expect(onCancel).toHaveBeenCalledOnce();
	});
});

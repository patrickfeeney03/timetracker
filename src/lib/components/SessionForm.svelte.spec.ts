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
		await expect.element(page.getByTestId('add-name')).toHaveValue('');
	});

	it('prefills an existing name when editing', async () => {
		await render(SessionForm, {
			...baseProps,
			mode: 'edit',
			sessionId: 'session-1',
			name: 'Code review',
			tags: [
				{ id: 'tag-coding', name: 'coding', color: 0 },
				{ id: 'tag-reading', name: 'reading', color: 1 }
			],
			tagIds: ['tag-coding']
		});

		await expect.element(page.getByTestId('edit-name')).toHaveValue('Code review');
		await expect.element(page.getByRole('checkbox', { name: 'coding' })).toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'reading' })).not.toBeChecked();
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

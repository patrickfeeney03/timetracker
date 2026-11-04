import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TimerControls from './TimerControls.svelte';

const base = {
	serverNow: Date.now(),
	deviceTimeZone: 'Europe/Berlin',
	tags: [
		{ id: 'tag-coding', name: 'coding' },
		{ id: 'tag-reading', name: 'reading' }
	],
	form: null
};

describe('TimerControls.svelte', () => {
	it('starts from zero with a Start control when there is no time today', async () => {
		await render(TimerControls, { ...base, active: null, todayTotalMs: 0 });

		await expect.element(page.getByTestId('timer-display')).toHaveTextContent('00:00:00');
		await expect.element(page.getByTestId('start-button')).toHaveTextContent('Start');
		await expect.element(page.getByText('Idle')).toBeInTheDocument();
	});

	it('keeps today\u2019s total visible after a pause and offers Resume', async () => {
		await render(TimerControls, { ...base, active: null, todayTotalMs: 90 * 60_000 });

		await expect.element(page.getByTestId('timer-display')).toHaveTextContent('01:30:00');
		await expect.element(page.getByTestId('start-button')).toHaveTextContent('Resume');
		await expect.element(page.getByText('Paused')).toBeInTheDocument();
		await expect.element(page.getByText("Today's total")).toBeInTheDocument();
	});

	it('shows a running clock and a pause control for an active session', async () => {
		const serverNow = Date.now();
		await render(TimerControls, {
			...base,
			serverNow,
			active: {
				id: 'session-1',
				startedLocal: '2026-09-18T09:41',
				timeZone: 'Asia/Tokyo',
				name: null,
				tagIds: []
			},
			todayTotalMs: 3_600_000
		});

		await expect.element(page.getByTestId('timer-display')).toHaveTextContent(/^01:00:0[0-1]$/);
		await expect.element(page.getByTestId('pause-button')).toHaveTextContent('Pause');
		await expect.element(page.getByText(/Started 09:41/)).toBeInTheDocument();
		await expect
			.element(page.getByText('This session keeps its original timezone'))
			.toBeInTheDocument();
	});

	it('offers an optional name before starting', async () => {
		await render(TimerControls, { ...base, active: null, todayTotalMs: 0 });

		const name = page.getByTestId('session-name');
		await expect.element(name).toHaveValue('');
		await expect.element(name).toHaveAttribute('name', 'name');
		await expect.element(page.getByTestId('rename-button')).not.toBeInTheDocument();
	});

	it('shows the running session’s name and only enables Save after an edit', async () => {
		await render(TimerControls, {
			...base,
			active: {
				id: 'session-1',
				startedLocal: '2026-09-18T09:41',
				timeZone: 'Europe/Berlin',
				name: 'Quarterly report',
				tagIds: ['tag-reading']
			},
			todayTotalMs: 60_000
		});

		const name = page.getByTestId('session-name');
		const save = page.getByTestId('rename-button');
		await expect.element(name).toHaveValue('Quarterly report');
		await expect.element(save).toBeDisabled();

		await name.fill('Quarterly report draft');
		await expect.element(save).toBeEnabled();

		// Whitespace-only changes are not a rename.
		await name.fill('  Quarterly report ');
		await expect.element(save).toBeDisabled();
	});

	it('ticks the running session’s tags and enables Save when they change', async () => {
		await render(TimerControls, {
			...base,
			active: {
				id: 'session-1',
				startedLocal: '2026-09-18T09:41',
				timeZone: 'Europe/Berlin',
				name: null,
				tagIds: ['tag-reading']
			},
			todayTotalMs: 60_000
		});

		const reading = page.getByRole('checkbox', { name: 'reading' });
		const coding = page.getByRole('checkbox', { name: 'coding' });
		const save = page.getByTestId('rename-button');
		await expect.element(reading).toBeChecked();
		await expect.element(coding).not.toBeChecked();
		await expect.element(save).toBeDisabled();

		await coding.click();
		await expect.element(save).toBeEnabled();
		await coding.click();
		await expect.element(save).toBeDisabled();

		await page.getByTestId('timer-new-tag').fill('notes');
		await expect.element(save).toBeEnabled();
	});

	it('offers existing tags and a new-tag field before starting', async () => {
		await render(TimerControls, { ...base, active: null, todayTotalMs: 0 });

		await expect.element(page.getByRole('checkbox', { name: 'coding' })).not.toBeChecked();
		await expect.element(page.getByRole('checkbox', { name: 'reading' })).not.toBeChecked();
		await expect.element(page.getByTestId('timer-new-tag')).toHaveValue('');
	});

	it('surfaces a retryable server error without changing the timer', async () => {
		await render(TimerControls, {
			...base,
			active: null,
			todayTotalMs: 0,
			form: { action: 'start', error: 'Could not start the timer. Try again.', retryable: true }
		});

		await expect
			.element(page.getByTestId('timer-error'))
			.toHaveTextContent('Could not start the timer');
		await expect.element(page.getByTestId('start-button')).toBeEnabled();
	});
});

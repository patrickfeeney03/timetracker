import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TimerControls from './TimerControls.svelte';

const base = {
	serverNow: Date.now(),
	deviceTimeZone: 'Europe/Berlin',
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
				timeZone: 'Asia/Tokyo'
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

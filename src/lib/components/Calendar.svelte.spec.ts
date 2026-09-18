import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Calendar from './Calendar.svelte';

const days = [
	{ date: '2026-08-31', durationMs: 0, isRunning: false },
	{ date: '2026-09-01', durationMs: 90 * 60_000, isRunning: false },
	{ date: '2026-09-18', durationMs: 45 * 60_000, isRunning: true }
];

describe('Calendar.svelte', () => {
	it('renders one cell per grid day and links them to history', async () => {
		const view = await render(Calendar, { month: '2026-09', days, todayKey: '2026-09-18' });

		await expect.element(page.getByTestId('calendar-day')).toHaveLength(3);
		expect(view.container.querySelector('a[href="/history/2026-09-01"]')).not.toBeNull();
	});

	it('shows daily totals and marks running days', async () => {
		await render(Calendar, { month: '2026-09', days, todayKey: '2026-09-18' });

		await expect.element(page.getByText('1h 30m')).toBeInTheDocument();
		await expect.element(page.getByTestId('calendar-running')).toBeInTheDocument();
	});

	it('marks today and dims neighbouring-month days', async () => {
		const view = await render(Calendar, { month: '2026-09', days, todayKey: '2026-09-18' });
		const cells = view.container.querySelectorAll('[data-testid="calendar-day"]');

		expect(cells[0]!.classList.contains('is-outside')).toBe(true);
		expect(cells[2]!.classList.contains('is-today')).toBe(true);
	});
});

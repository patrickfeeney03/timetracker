import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Calendar from './Calendar.svelte';

const coding = { id: 'tag-coding', name: 'coding' };
const reading = { id: 'tag-reading', name: 'reading' };
const writing = { id: 'tag-writing', name: 'writing' };

const days = [
	{ date: '2026-08-31', durationMs: 0, isRunning: false, tags: [] },
	{ date: '2026-09-01', durationMs: 90 * 60_000, isRunning: false, tags: [coding] },
	{ date: '2026-09-18', durationMs: 45 * 60_000, isRunning: true, tags: [] }
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

	it('shows each day\u2019s tags and names them in the cell label', async () => {
		const view = await render(Calendar, { month: '2026-09', days, todayKey: '2026-09-18' });

		await expect.element(page.getByTestId('calendar-tag')).toHaveTextContent('coding');
		const cell = view.container.querySelector('[data-date="2026-09-01"]');
		expect(cell?.getAttribute('aria-label')).toMatch(/1h 30m, tagged coding$/);
	});

	it('collapses tags beyond the first two into a count', async () => {
		await render(Calendar, {
			month: '2026-09',
			days: [
				{
					date: '2026-09-02',
					durationMs: 60 * 60_000,
					isRunning: false,
					tags: [writing, coding, reading]
				}
			],
			todayKey: '2026-09-18'
		});

		await expect.element(page.getByTestId('calendar-tag').nth(0)).toHaveTextContent('writing');
		await expect.element(page.getByTestId('calendar-tag').nth(1)).toHaveTextContent('coding');
		await expect.element(page.getByTestId('calendar-tag')).toHaveLength(2);
		const more = page.getByTestId('calendar-tag-more');
		await expect.element(more).toHaveTextContent('+1');
		await expect.element(more).toHaveAttribute('title', 'reading');
		// Phone-sized cells fit one tag, so they count from the second.
		const narrowMore = page.getByTestId('calendar-tag-more-narrow');
		await expect.element(narrowMore).toHaveTextContent('+2');
		await expect.element(narrowMore).toHaveAttribute('title', 'coding, reading');
	});

	it('marks today and dims neighbouring-month days', async () => {
		const view = await render(Calendar, { month: '2026-09', days, todayKey: '2026-09-18' });
		const cells = view.container.querySelectorAll('[data-testid="calendar-day"]');

		expect(cells[0]!.classList.contains('is-outside')).toBe(true);
		expect(cells[2]!.classList.contains('is-today')).toBe(true);
	});
});

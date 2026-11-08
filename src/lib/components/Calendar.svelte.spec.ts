import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Calendar from './Calendar.svelte';

const coding = { id: 'tag-coding', name: 'coding', color: 0 };
const reading = { id: 'tag-reading', name: 'reading', color: 1 };
const writing = { id: 'tag-writing', name: 'writing', color: null };
const minutes = (count: number) => count * 60_000;

const days = [
	{ date: '2026-08-31', durationMs: 0, isRunning: false, tags: [] },
	{
		date: '2026-09-01',
		durationMs: minutes(90),
		isRunning: false,
		tags: [{ ...coding, durationMs: minutes(90) }]
	},
	{ date: '2026-09-18', durationMs: minutes(45), isRunning: true, tags: [] }
];
const props = { month: '2026-09', days, tagTotals: [], todayKey: '2026-09-18' };

describe('Calendar.svelte', () => {
	it('renders one cell per grid day and links them to history', async () => {
		const view = await render(Calendar, props);

		await expect.element(page.getByTestId('calendar-day')).toHaveLength(3);
		expect(view.container.querySelector('a[href="/history/2026-09-01"]')).not.toBeNull();
	});

	it('shows daily totals and marks running days', async () => {
		await render(Calendar, props);

		await expect.element(page.getByText('1h 30m')).toBeInTheDocument();
		await expect.element(page.getByTestId('calendar-running')).toBeInTheDocument();
	});

	it('shows each day\u2019s tags as chips and dots, and names them in the cell label', async () => {
		const view = await render(Calendar, props);

		await expect.element(page.getByTestId('calendar-tag')).toHaveTextContent('coding');
		await expect.element(page.getByTestId('calendar-dot')).toBeInTheDocument();
		const cell = view.container.querySelector('[data-date="2026-09-01"]');
		expect(cell?.getAttribute('aria-label')).toMatch(/: 1h 30m; coding 1h 30m$/);
	});

	it('gives each tag its palette colour, and tags past the palette the shared one', async () => {
		const view = await render(Calendar, {
			...props,
			days: [
				{
					date: '2026-09-02',
					durationMs: minutes(60),
					isRunning: false,
					tags: [
						{ ...coding, durationMs: minutes(40) },
						{ ...writing, durationMs: minutes(20) }
					]
				}
			]
		});

		const dots = [...view.container.querySelectorAll<HTMLElement>('[data-testid="calendar-dot"]')];
		expect(dots.map((dot) => dot.style.getPropertyValue('--tag-color'))).toEqual([
			'var(--tag-1)',
			'var(--tag-other)'
		]);
	});

	it('collapses chips beyond the first two into a count, and shows at most three dots', async () => {
		const extra = { id: 'tag-extra', name: 'extra', color: 3 };
		await render(Calendar, {
			...props,
			days: [
				{
					date: '2026-09-02',
					durationMs: minutes(60),
					isRunning: false,
					tags: [writing, coding, reading, extra].map((tag) => ({
						...tag,
						durationMs: minutes(15)
					}))
				}
			]
		});

		await expect.element(page.getByTestId('calendar-tag').nth(0)).toHaveTextContent('writing');
		await expect.element(page.getByTestId('calendar-tag').nth(1)).toHaveTextContent('coding');
		await expect.element(page.getByTestId('calendar-tag')).toHaveLength(2);
		const more = page.getByTestId('calendar-tag-more');
		await expect.element(more).toHaveTextContent('+2');
		await expect.element(more).toHaveAttribute('title', 'reading 15m, extra 15m');
		await expect.element(page.getByTestId('calendar-dot')).toHaveLength(3);
	});

	it('lists the month\u2019s tags with their time under the calendar', async () => {
		await render(Calendar, {
			...props,
			tagTotals: [
				{ ...coding, durationMs: minutes(150) },
				{ ...reading, durationMs: minutes(30) }
			]
		});

		const items = page.getByTestId('legend-item');
		await expect.element(items).toHaveLength(2);
		await expect.element(items.nth(0)).toHaveTextContent(/coding\s*2h 30m/);
		await expect.element(items.nth(1)).toHaveTextContent(/reading\s*30m/);
	});

	it('shows no legend for a month without tags', async () => {
		await render(Calendar, props);

		await expect.element(page.getByTestId('calendar-legend')).not.toBeInTheDocument();
	});

	it('marks today and dims neighbouring-month days', async () => {
		const view = await render(Calendar, props);
		const cells = view.container.querySelectorAll('[data-testid="calendar-day"]');

		expect(cells[0]!.classList.contains('is-outside')).toBe(true);
		expect(cells[2]!.classList.contains('is-today')).toBe(true);
	});
});

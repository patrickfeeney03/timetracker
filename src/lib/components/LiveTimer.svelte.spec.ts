import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LiveTimer from './LiveTimer.svelte';

const read = (container: HTMLElement) =>
	container.querySelector('[data-testid="timer-display"]')?.textContent?.trim();

describe('LiveTimer.svelte', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('renders the frozen total while paused', async () => {
		await render(LiveTimer, { baseMs: 3_661_000, serverNow: Date.now(), running: false });

		await expect.element(page.getByTestId('timer-display')).toHaveTextContent('01:01:01');
	});

	it('does not advance while paused', async () => {
		vi.useFakeTimers();
		const view = await render(LiveTimer, { baseMs: 90_000, serverNow: Date.now(), running: false });

		await vi.advanceTimersByTimeAsync(5_000);
		expect(read(view.container)).toBe('00:01:30');
	});

	it('adds elapsed time while running', async () => {
		vi.useFakeTimers();
		const view = await render(LiveTimer, {
			baseMs: 60_000,
			serverNow: Date.now(),
			running: true
		});

		await vi.advanceTimersByTimeAsync(4_000);
		expect(read(view.container)).toBe('00:01:04');
	});

	it('re-anchors to a fresh server snapshot', async () => {
		vi.useFakeTimers();
		const serverNow = Date.now();
		const view = await render(LiveTimer, { baseMs: 0, serverNow, running: true });

		await view.rerender({ baseMs: 90_000, serverNow: serverNow + 90_000, running: true });
		expect(read(view.container)).toBe('00:01:30');
	});

	it('never renders negative time', async () => {
		await render(LiveTimer, { baseMs: -60_000, serverNow: Date.now(), running: false });

		await expect.element(page.getByTestId('timer-display')).toHaveTextContent('00:00:00');
	});
});

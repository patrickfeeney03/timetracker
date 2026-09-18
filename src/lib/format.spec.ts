import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, formatLocalTime } from './format';

describe('formatClock', () => {
	it('renders HH:MM:SS with tabular zero padding', () => {
		expect(formatClock(0)).toBe('00:00:00');
		expect(formatClock(1000)).toBe('00:00:01');
		expect(formatClock(3_661_000)).toBe('01:01:01');
		expect(formatClock(59_999)).toBe('00:00:59');
	});

	it('keeps counting past 24 hours', () => {
		expect(formatClock(100 * 3_600_000)).toBe('100:00:00');
	});

	it('never renders negative time', () => {
		expect(formatClock(-5000)).toBe('00:00:00');
	});
});

describe('formatDuration', () => {
	it('floors to whole minutes', () => {
		expect(formatDuration(59_999)).toBe('0m');
		expect(formatDuration(60_000)).toBe('1m');
		expect(formatDuration(3 * 3_600_000 + 12 * 60_000 + 59_999)).toBe('3h 12m');
	});

	it('omits the hour part below one hour', () => {
		expect(formatDuration(45 * 60_000)).toBe('45m');
	});

	it('floors only the final total', () => {
		// Two sessions of 30 min 45 s each: 61.5 minutes exact -> "1h 1m".
		const total = (30 * 60_000 + 45_000) * 2;
		expect(formatDuration(total)).toBe('1h 1m');
	});
});

describe('formatLocalTime', () => {
	it('extracts the HH:mm part of a local datetime', () => {
		expect(formatLocalTime('2026-09-18T09:30')).toBe('09:30');
	});
});

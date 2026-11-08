import { describe, expect, it } from 'vitest';
import { buildCalendarDays, monthTagTotals } from './calendar';

const coding = { id: 'tag-coding', name: 'coding', color: 0 };
const reading = { id: 'tag-reading', name: 'reading', color: 1 };
const writing = { id: 'tag-writing', name: 'writing', color: 2 };
const HOUR = 60 * 60_000;

const at = (iso: string) => Date.parse(iso);
const session = (id: string, start: string, end: string | null) => ({
	id,
	startedAt: at(start),
	endedAt: end === null ? null : at(end),
	timeZone: 'UTC'
});

describe('buildCalendarDays', () => {
	it('returns one cell per date, empty where nothing was recorded', () => {
		const days = buildCalendarDays(['2026-09-01', '2026-09-02'], [], new Map(), Date.now());

		expect(days).toEqual([
			{ date: '2026-09-01', durationMs: 0, isRunning: false, tags: [] },
			{ date: '2026-09-02', durationMs: 0, isRunning: false, tags: [] }
		]);
	});

	it('ranks a day’s tags by the time they cover, then by name', () => {
		const intervals = [
			session('a', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z'),
			session('b', '2026-09-01T11:00:00Z', '2026-09-01T13:00:00Z'),
			session('c', '2026-09-01T14:00:00Z', '2026-09-01T15:00:00Z')
		];
		const tagsBySession = new Map([
			['a', [reading]],
			['b', [writing]],
			['c', [coding]]
		]);

		const [day] = buildCalendarDays(['2026-09-01'], intervals, tagsBySession, Date.now());

		expect(day!.durationMs).toBe(4 * HOUR);
		expect(day!.tags).toEqual([
			{ ...writing, durationMs: 2 * HOUR },
			{ ...coding, durationMs: HOUR },
			{ ...reading, durationMs: HOUR }
		]);
	});

	it('counts a tag once per day even when several sessions share it', () => {
		const intervals = [
			session('a', '2026-09-01T09:00:00Z', '2026-09-01T09:30:00Z'),
			session('b', '2026-09-01T10:00:00Z', '2026-09-01T10:30:00Z'),
			session('c', '2026-09-01T11:00:00Z', '2026-09-01T11:45:00Z')
		];
		const tagsBySession = new Map([
			['a', [coding]],
			['b', [coding]],
			['c', [reading]]
		]);

		const [day] = buildCalendarDays(['2026-09-01'], intervals, tagsBySession, Date.now());

		// Two half hours of coding outrank 45 minutes of reading.
		expect(day!.tags.map((tag) => [tag.name, tag.durationMs])).toEqual([
			['coding', HOUR],
			['reading', 0.75 * HOUR]
		]);
	});

	it('shows a midnight-crossing session’s tags on both days, and marks the running one', () => {
		const nowMs = at('2026-09-02T01:00:00Z');
		const intervals = [session('a', '2026-09-01T23:00:00Z', null)];

		const days = buildCalendarDays(
			['2026-09-01', '2026-09-02'],
			intervals,
			new Map([['a', [coding]]]),
			nowMs
		);

		const tags = [{ ...coding, durationMs: HOUR }];
		expect(days).toEqual([
			{ date: '2026-09-01', durationMs: HOUR, isRunning: true, tags },
			{ date: '2026-09-02', durationMs: HOUR, isRunning: true, tags }
		]);
	});
});

describe('monthTagTotals', () => {
	it('adds up each tag over the month only, most time first', () => {
		const intervals = [
			// The grid shows 31 August, but it is not part of September.
			session('a', '2026-08-31T09:00:00Z', '2026-08-31T17:00:00Z'),
			session('b', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z'),
			session('c', '2026-09-02T09:00:00Z', '2026-09-02T11:00:00Z'),
			session('d', '2026-09-03T09:00:00Z', '2026-09-03T11:30:00Z')
		];
		const tagsBySession = new Map([
			['a', [reading]],
			['b', [coding, reading]],
			['c', [coding]],
			['d', [writing]]
		]);
		const days = buildCalendarDays(
			['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'],
			intervals,
			tagsBySession,
			Date.now()
		);

		expect(monthTagTotals(days, '2026-09')).toEqual([
			{ ...coding, durationMs: 3 * HOUR },
			{ ...writing, durationMs: 2.5 * HOUR },
			{ ...reading, durationMs: HOUR }
		]);
	});
});

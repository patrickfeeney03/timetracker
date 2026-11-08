import { describe, expect, it } from 'vitest';
import { buildCalendarDays } from './calendar';

const coding = { id: 'tag-coding', name: 'coding' };
const reading = { id: 'tag-reading', name: 'reading' };
const writing = { id: 'tag-writing', name: 'writing' };

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

		expect(day!.durationMs).toBe(4 * 60 * 60_000);
		expect(day!.tags).toEqual([writing, coding, reading]);
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
		expect(day!.tags).toEqual([coding, reading]);
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

		expect(days).toEqual([
			{ date: '2026-09-01', durationMs: 60 * 60_000, isRunning: true, tags: [coding] },
			{ date: '2026-09-02', durationMs: 60 * 60_000, isRunning: true, tags: [coding] }
		]);
	});
});

import { describe, expect, it } from 'vitest';
import {
	contributionsForDate,
	epochMsToLocalDateTime,
	formatDateInTimeZone,
	isTimeZone,
	isValidDate,
	isValidMonth,
	localDateTimeToEpochMs,
	monthGridDates,
	shiftDate,
	shiftMonth,
	splitIntervalByLocalDays,
	summarizeByDay,
	type Interval
} from './time';

const interval = (startedAt: string, endedAt: string | null, timeZone: string): Interval => ({
	startedAt: Date.parse(startedAt),
	endedAt: endedAt === null ? null : Date.parse(endedAt),
	timeZone
});

describe('splitIntervalByLocalDays', () => {
	it('splits an ordinary midnight crossing in UTC', () => {
		const slices = splitIntervalByLocalDays(
			Date.parse('2026-09-18T22:00:00Z'),
			Date.parse('2026-09-19T02:00:00Z'),
			'UTC'
		);
		expect(slices).toEqual([
			{ date: '2026-09-18', durationMs: 2 * 3_600_000 },
			{ date: '2026-09-19', durationMs: 2 * 3_600_000 }
		]);
	});

	it('handles a leap day', () => {
		expect(
			splitIntervalByLocalDays(
				Date.parse('2024-02-28T23:30:00Z'),
				Date.parse('2024-02-29T00:30:00Z'),
				'UTC'
			)
		).toEqual([
			{ date: '2024-02-28', durationMs: 30 * 60_000 },
			{ date: '2024-02-29', durationMs: 30 * 60_000 }
		]);

		expect(
			splitIntervalByLocalDays(
				Date.parse('2024-02-29T00:00:00Z'),
				Date.parse('2024-03-01T00:00:00Z'),
				'UTC'
			)
		).toEqual([{ date: '2024-02-29', durationMs: 24 * 3_600_000 }]);
	});

	it('handles month and year boundaries', () => {
		expect(
			splitIntervalByLocalDays(
				Date.parse('2025-12-31T23:00:00Z'),
				Date.parse('2026-01-01T01:00:00Z'),
				'UTC'
			)
		).toEqual([
			{ date: '2025-12-31', durationMs: 3_600_000 },
			{ date: '2026-01-01', durationMs: 3_600_000 }
		]);
	});

	it('uses the recorded zone for positive UTC offsets', () => {
		// 14:00Z is 23:00 in Tokyo; midnight in Tokyo is 15:00Z.
		expect(
			splitIntervalByLocalDays(
				Date.parse('2026-09-18T14:00:00Z'),
				Date.parse('2026-09-18T16:00:00Z'),
				'Asia/Tokyo'
			)
		).toEqual([
			{ date: '2026-09-18', durationMs: 3_600_000 },
			{ date: '2026-09-19', durationMs: 3_600_000 }
		]);
	});

	it('uses the recorded zone for negative UTC offsets', () => {
		// 05:00Z is 22:00 in Los Angeles (PDT, UTC-7); midnight in LA is 07:00Z.
		expect(
			splitIntervalByLocalDays(
				Date.parse('2026-09-19T05:00:00Z'),
				Date.parse('2026-09-19T08:00:00Z'),
				'America/Los_Angeles'
			)
		).toEqual([
			{ date: '2026-09-18', durationMs: 2 * 3_600_000 },
			{ date: '2026-09-19', durationMs: 3_600_000 }
		]);
	});

	it('counts real elapsed time across the DST spring-forward', () => {
		// New York 2026-03-08: clocks jump 02:00 EST -> 03:00 EDT.
		const slices = splitIntervalByLocalDays(
			Date.parse('2026-03-08T05:30:00Z'), // 00:30 EST
			Date.parse('2026-03-08T08:00:00Z'), // 04:00 EDT
			'America/New_York'
		);
		expect(slices).toEqual([{ date: '2026-03-08', durationMs: 2.5 * 3_600_000 }]);
	});

	it('counts real elapsed time across the DST fall-back', () => {
		// New York 2026-11-01: 02:00 EDT repeats as 01:00 EST, so the local
		// wall-clock span from 00:30 to 02:30 is 3 real hours.
		const slices = splitIntervalByLocalDays(
			Date.parse('2026-11-01T04:30:00Z'), // 00:30 EDT
			Date.parse('2026-11-01T07:30:00Z'), // 02:30 EST
			'America/New_York'
		);
		expect(slices).toEqual([{ date: '2026-11-01', durationMs: 3 * 3_600_000 }]);
	});

	it('splits at a local midnight that DST skips entirely', () => {
		// Santiago 2026-09-06: the clock jumps 00:00 -> 01:00, so the day
		// starts at 01:00 local.
		const slices = splitIntervalByLocalDays(
			Date.parse('2026-09-06T03:00:00Z'), // 2026-09-05 23:00 -04:00
			Date.parse('2026-09-06T05:00:00Z'), // 2026-09-06 02:00 -03:00
			'America/Santiago'
		);
		expect(slices).toEqual([
			{ date: '2026-09-05', durationMs: 3_600_000 },
			{ date: '2026-09-06', durationMs: 3_600_000 }
		]);
	});

	it('returns nothing for empty or negative intervals', () => {
		expect(splitIntervalByLocalDays(1000, 1000, 'UTC')).toEqual([]);
		expect(splitIntervalByLocalDays(2000, 1000, 'UTC')).toEqual([]);
	});
});

describe('summarizeByDay', () => {
	it('sums several sessions into per-date totals', () => {
		const summaries = summarizeByDay(
			[
				interval('2026-09-18T08:00:00Z', '2026-09-18T09:30:00Z', 'UTC'),
				interval('2026-09-18T10:00:00Z', '2026-09-18T10:45:00Z', 'UTC'),
				interval('2026-09-19T08:00:00Z', null, 'UTC')
			],
			Date.parse('2026-09-19T09:15:00Z')
		);

		expect(summaries.get('2026-09-18')).toEqual({
			date: '2026-09-18',
			durationMs: 2.25 * 3_600_000,
			isRunning: false
		});
		expect(summaries.get('2026-09-19')).toEqual({
			date: '2026-09-19',
			durationMs: 1.25 * 3_600_000,
			isRunning: true
		});
	});

	it('keeps recorded dates stable when the device zone changes', () => {
		// 2026-09-19 03:30Z is 23:30 on 09-18 in New York.
		const recorded = interval('2026-09-19T03:30:00Z', '2026-09-19T04:30:00Z', 'America/New_York');
		const summaries = summarizeByDay([recorded], Date.parse('2026-09-19T05:00:00Z'));

		expect([...summaries.keys()].sort()).toEqual(['2026-09-18', '2026-09-19']);
		expect(summaries.get('2026-09-18')?.durationMs).toBe(30 * 60_000);
		expect(summaries.get('2026-09-19')?.durationMs).toBe(30 * 60_000);

		// The same instant lands on a different calendar date in another zone,
		// but the recorded zone is what determines the summary.
		expect(formatDateInTimeZone(Date.parse('2026-09-19T03:30:00Z'), 'Asia/Tokyo')).toBe(
			'2026-09-19'
		);
		expect(summaries.has('2026-09-20')).toBe(false);
	});

	it('attributes a midnight crossing to both dates', () => {
		const summaries = summarizeByDay(
			[interval('2026-09-18T22:00:00Z', '2026-09-19T01:00:00Z', 'UTC')],
			Date.parse('2026-09-19T01:00:00Z')
		);
		expect(summaries.get('2026-09-18')?.durationMs).toBe(2 * 3_600_000);
		expect(summaries.get('2026-09-19')?.durationMs).toBe(3_600_000);
	});
});

describe('contributionsForDate', () => {
	it('returns only the slice contributing to the requested date', () => {
		const crossing = interval('2026-09-18T22:00:00Z', '2026-09-19T01:00:00Z', 'UTC');
		const other = interval('2026-09-19T02:00:00Z', '2026-09-19T03:00:00Z', 'UTC');

		expect(contributionsForDate([crossing, other], '2026-09-19', Date.now())).toEqual([
			{ interval: crossing, durationMs: 3_600_000 },
			{ interval: other, durationMs: 3_600_000 }
		]);
		expect(contributionsForDate([crossing, other], '2026-09-18', Date.now())).toEqual([
			{ interval: crossing, durationMs: 2 * 3_600_000 }
		]);
	});

	it('uses the current server time for an open interval', () => {
		const running = interval('2026-09-19T08:00:00Z', null, 'UTC');
		const contributions = contributionsForDate(
			[running],
			'2026-09-19',
			Date.parse('2026-09-19T09:30:00Z')
		);
		expect(contributions).toEqual([{ interval: running, durationMs: 1.5 * 3_600_000 }]);
	});
});

describe('calendar helpers', () => {
	it('builds a Monday-first grid including neighbouring days', () => {
		const days = monthGridDates('2026-09');
		expect(days[0]).toBe('2026-08-31');
		expect(days[days.length - 1]).toBe('2026-10-04');
		expect(days).toHaveLength(35);
	});

	it('shifts dates and months across boundaries', () => {
		expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
		expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
		expect(shiftMonth('2026-01', -1)).toBe('2025-12');
		expect(shiftMonth('2026-12', 1)).toBe('2027-01');
	});
});

describe('validation and conversion', () => {
	it('validates timezones, dates and months', () => {
		expect(isTimeZone('America/New_York')).toBe(true);
		expect(isTimeZone('Not/AZone')).toBe(false);
		expect(isTimeZone('')).toBe(false);
		expect(isValidDate('2026-02-29')).toBe(false);
		expect(isValidDate('2024-02-29')).toBe(true);
		expect(isValidDate('2026-9-1')).toBe(false);
		expect(isValidMonth('2026-09')).toBe(true);
		expect(isValidMonth('2026-13')).toBe(false);
	});

	it('round-trips minute-level local datetimes in a zone', () => {
		const ms = localDateTimeToEpochMs('2026-09-18T09:30', 'America/New_York');
		expect(ms).toBe(Date.parse('2026-09-18T13:30:00Z'));
		expect(epochMsToLocalDateTime(ms!, 'America/New_York')).toBe('2026-09-18T09:30');
	});

	it('rejects malformed local datetimes', () => {
		expect(localDateTimeToEpochMs('2026-09-18', 'UTC')).toBeNull();
		expect(localDateTimeToEpochMs('not-a-date', 'UTC')).toBeNull();
		expect(localDateTimeToEpochMs('2026-09-18T09:30', 'Not/AZone')).toBeNull();
	});
});

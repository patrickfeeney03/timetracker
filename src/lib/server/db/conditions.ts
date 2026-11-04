import { and, gt, isNull, lt, or, type SQL } from 'drizzle-orm';
import { workSession } from './schema';

/** Sessions whose interval overlaps `[fromMs, toMs)`; running ones are open-ended. */
export function overlapsRange(fromMs: number, toMs: number): SQL {
	return and(
		lt(workSession.startedAt, toMs),
		or(gt(workSession.endedAt, fromMs), isNull(workSession.endedAt))
	)!;
}

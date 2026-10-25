import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Accepts the D1 binding or a read-replication session from `withSession()`.
 * Drizzle only calls `prepare` and `batch`, which sessions implement too, but
 * its types only name `D1Database`.
 */
export const getDb = (d1: D1Database | D1DatabaseSession) => drizzle(d1 as D1Database, { schema });

/** The Drizzle client used across server code. */
export type Db = ReturnType<typeof getDb>;

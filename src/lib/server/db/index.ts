import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export const getDb = (d1: D1Database) => drizzle(d1, { schema });

/** The Drizzle client used across server code. */
export type Db = ReturnType<typeof getDb>;

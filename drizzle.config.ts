import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only reads the schema, so the credentials below are
// optional for it. `push`, `migrate` and `studio` talk to a remote D1 database
// and require all three values from `.env` (see `.env.example`).
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	driver: 'd1-http',
	dbCredentials: {
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
		databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? '',
		token: process.env.CLOUDFLARE_D1_TOKEN ?? ''
	},
	verbose: true,
	strict: true
});

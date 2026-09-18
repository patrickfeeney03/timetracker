import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests',
	testMatch: '**/*.e2e.{ts,js}',
	timeout: 30_000,
	expect: { timeout: 7_000 },
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
	webServer: {
		// Applies the versioned migrations to the local D1 database, builds the
		// Worker and starts Wrangler with the test-only auth fixture enabled.
		command:
			'npm run db:migrate:local && npm run build && npm run preview -- --var ENABLE_TEST_AUTH:true',
		url: 'http://localhost:4173/login',
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});

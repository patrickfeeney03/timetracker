/**
 * `wrangler types` narrows `ENABLE_TEST_AUTH` to the literal `"false"` because
 * that is the checked-in default. The Playwright dev server overrides it at
 * runtime with `--var ENABLE_TEST_AUTH:true`, so widen before comparing.
 */
export function isTestAuthEnabled(env: { ENABLE_TEST_AUTH?: string }): boolean {
	return (env.ENABLE_TEST_AUTH as string | undefined) === 'true';
}

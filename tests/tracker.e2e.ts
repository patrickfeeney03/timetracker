import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end coverage for the personal time tracker. Authentication uses the
 * controlled test fixture (`/api/test-auth`) which only answers when the dev
 * server was started with `--var ENABLE_TEST_AUTH:true`.
 */

const uniqueEmail = (prefix: string) =>
	`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function signIn(page: Page, email = uniqueEmail('user'), reset = true) {
	const response = await page.request.post('/api/test-auth', { data: { email, reset } });
	expect(response.ok()).toBe(true);
}

/** Parses an `HH:MM:SS` clock into whole seconds. */
function parseClock(text: string | null): number {
	const match = (text ?? '').match(/(\d{2}):(\d{2}):(\d{2})/);
	if (!match) throw new Error(`Not a clock value: ${text}`);
	return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

test('signed-out visitors are redirected to the login page', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
	await expect(page.getByTestId('google-sign-in')).toHaveText(/Continue with Google/);
});

test('signed-out history links also redirect to login', async ({ page }) => {
	await page.goto('/history/2026-09-10');
	await expect(page).toHaveURL(/\/login\?redirectTo=/);
});

test('a running timer survives a reload and holds its value when paused', async ({ page }) => {
	await signIn(page);
	await page.goto('/');

	await page.getByTestId('start-button').click();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await expect(page.getByTestId('timer-display')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

	// Reopening the site must not stop or reset the server-side timer.
	await page.waitForTimeout(2200);
	await page.reload();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await expect(page.getByTestId('start-button')).toHaveCount(0);

	const beforePause = parseClock(await page.getByTestId('timer-display').textContent());
	await page.getByTestId('pause-button').click();
	await expect(page.getByTestId('start-button')).toHaveText('Resume');

	// Pausing freezes the clock instead of resetting it to zero.
	const afterPause = parseClock(await page.getByTestId('timer-display').textContent());
	expect(afterPause).toBeGreaterThan(0);
	expect(Math.abs(afterPause - beforePause)).toBeLessThanOrEqual(1);
});

test('the favicon shows whether the timer is running', async ({ page }) => {
	await signIn(page);
	await page.goto('/');
	const favicon = page.locator('link[rel="icon"]');
	const stoppedIcon = (await favicon.getAttribute('href')) ?? '';
	expect(stoppedIcon).not.toBe('');

	await page.getByTestId('start-button').click();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await expect(favicon).not.toHaveAttribute('href', stoppedIcon);
	const runningIcon = (await favicon.getAttribute('href')) ?? '';

	// Server-rendered pages, history included, pick the same icon.
	await page.reload();
	await expect(favicon).toHaveAttribute('href', runningIcon);
	await page.goto('/history/2020-01-01');
	await expect(favicon).toHaveAttribute('href', runningIcon);

	await page.goto('/');
	await page.getByTestId('pause-button').click();
	await expect(page.getByTestId('start-button')).toHaveText('Resume');
	await expect(favicon).toHaveAttribute('href', stoppedIcon);
});

test('time accumulates across start/pause cycles within the same day', async ({ page }) => {
	await signIn(page);
	await page.goto('/');
	await expect(page.getByTestId('start-button')).toHaveText('Start');

	await page.getByTestId('start-button').click();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await page.waitForTimeout(2200);
	await page.getByTestId('pause-button').click();
	await expect(page.getByTestId('start-button')).toHaveText('Resume');

	const first = parseClock(await page.getByTestId('timer-display').textContent());
	expect(first).toBeGreaterThan(0);

	// A second run continues from the frozen total instead of restarting at zero.
	await page.getByTestId('start-button').click();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await page.waitForTimeout(2200);
	await page.getByTestId('pause-button').click();
	await expect(page.getByTestId('start-button')).toHaveText('Resume');

	const second = parseClock(await page.getByTestId('timer-display').textContent());
	expect(second).toBeGreaterThanOrEqual(first + 1);
});

test('names a session when starting, renames it while running and keeps it in history', async ({
	page
}) => {
	await signIn(page);
	await page.goto('/');

	await page.getByTestId('session-name').fill('Inbox zero');
	await page.getByTestId('session-name').press('Enter');
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await expect(page.getByTestId('session-name')).toHaveValue('Inbox zero');

	// Enter saves the new name without pausing the timer.
	await page.getByTestId('session-name').fill('Release notes');
	await page.getByTestId('session-name').press('Enter');
	await expect(page.getByTestId('rename-button')).toBeDisabled();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await page.reload();
	await expect(page.getByTestId('session-name')).toHaveValue('Release notes');

	// An unsaved edit is kept when pausing.
	await page.getByTestId('session-name').fill('Release notes v2');
	await page.getByTestId('pause-button').click();
	await expect(page.getByTestId('start-button')).toHaveText('Resume');
	await expect(page.getByTestId('session-name')).toHaveValue('');

	const today = await page
		.getByTestId('calendar-day')
		.and(page.locator('.is-today'))
		.getAttribute('data-date');
	await page.goto(`/history/${today}`);
	await expect(page.getByTestId('session-item').getByTestId('session-name')).toHaveText(
		'Release notes v2'
	);
});

test('creates tags, reuses them across sessions and shows them in history', async ({ page }) => {
	await signIn(page);
	await page.goto('/');

	await page.getByTestId('timer-new-tag').fill('reading');
	await page.getByTestId('start-button').click();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'reading' })).toBeChecked();

	// Swap tags on the running session without pausing it.
	await page.getByRole('checkbox', { name: 'reading' }).uncheck();
	await page.getByTestId('timer-new-tag').fill('coding');
	await page.getByTestId('timer-new-tag').press('Enter');
	await expect(page.getByTestId('rename-button')).toBeDisabled();
	await expect(page.getByRole('checkbox', { name: 'coding' })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'reading' })).not.toBeChecked();
	await expect(page.getByTestId('timer-new-tag')).toHaveValue('');
	await expect(page.getByTestId('pause-button')).toBeVisible();

	await page.getByTestId('pause-button').click();
	await expect(page.getByTestId('start-button')).toHaveText('Resume');

	// Both tags are now reusable, and typing an existing name reuses it.
	await expect(page.getByTestId('tag-option')).toHaveText(['coding', 'reading']);
	await page.getByRole('checkbox', { name: 'reading' }).check();
	await page.getByTestId('timer-new-tag').fill('Coding');
	await page.getByTestId('start-button').click();
	await expect(page.getByTestId('pause-button')).toBeVisible();
	await expect(page.getByTestId('tag-option')).toHaveCount(2);
	await expect(page.getByRole('checkbox', { name: 'coding' })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'reading' })).toBeChecked();
	await page.getByTestId('pause-button').click();
	await expect(page.getByTestId('start-button')).toHaveText('Resume');

	const today = await page
		.getByTestId('calendar-day')
		.and(page.locator('.is-today'))
		.getAttribute('data-date');
	await page.goto(`/history/${today}`);
	const items = page.getByTestId('session-item');
	await expect(items).toHaveCount(2);
	await expect(items.nth(0).getByTestId('session-tag')).toHaveText(['coding']);
	await expect(items.nth(1).getByTestId('session-tag')).toHaveText(['coding', 'reading']);
});

test('a second device sees the running timer after focus refresh', async ({ browser }) => {
	const email = uniqueEmail('multi-device');
	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const pageA = await contextA.newPage();
	const pageB = await contextB.newPage();

	await pageA.request.post('/api/test-auth', { data: { email, reset: true } });
	await pageB.request.post('/api/test-auth', { data: { email } });

	await pageA.goto('/');
	await pageA.getByTestId('start-button').click();
	await expect(pageA.getByTestId('pause-button')).toBeVisible();

	// Device B cannot create a second active timer: load already shows the run.
	await pageB.goto('/');
	await expect(pageB.getByTestId('pause-button')).toBeVisible();
	await expect(pageB.getByTestId('start-button')).toHaveCount(0);

	// Pausing on B is reflected on A when the tab regains focus.
	await pageB.getByTestId('pause-button').click();
	await expect(pageB.getByTestId('start-button')).toHaveText('Resume');

	await pageA.bringToFront();
	await pageA.evaluate(() => window.dispatchEvent(new Event('focus')));
	await expect(pageA.getByTestId('start-button')).toHaveText('Resume');
	await expect(pageA.getByTestId('pause-button')).toHaveCount(0);

	await contextA.close();
	await contextB.close();
});

test('unreachable writes keep the timer unchanged and show a retry message', async ({ page }) => {
	await signIn(page);
	await page.goto('/');

	await page.route('**/*', (route) =>
		route.request().method() === 'POST' ? route.abort('failed') : route.continue()
	);

	await page.getByTestId('start-button').click();
	await expect(page.getByTestId('timer-error')).toContainText('Could not reach the server');
	await expect(page.getByTestId('start-button')).toBeVisible();
	await expect(page.getByTestId('timer-display')).toHaveText('00:00:00');
});

test('shows a loading state while a start request is in flight', async ({ page }) => {
	await signIn(page);
	await page.goto('/');

	// Slow the action down so the pending state is observable.
	await page.route('**/*', async (route) => {
		if (route.request().method() === 'POST')
			await new Promise((resolve) => setTimeout(resolve, 600));
		await route.continue();
	});

	const button = page.getByTestId('start-button');
	await button.click();
	await expect(button).toHaveText('Starting…');
	await expect(button).toBeDisabled();
	await expect(page.getByTestId('pause-button')).toBeVisible();
});

test('calendar navigates months and links to a history day', async ({ page }) => {
	await signIn(page);
	await page.goto('/');

	const monthHeading = page.locator('.card-header h2');
	const initial = await monthHeading.textContent();

	await page.getByRole('link', { name: 'Next month' }).click();
	await expect(page).toHaveURL(/month=\d{4}-\d{2}/);
	await expect(monthHeading).not.toHaveText(initial!);

	await page.getByRole('link', { name: 'Previous month' }).click();
	await expect(monthHeading).toHaveText(initial!);

	const day = page.getByTestId('calendar-day').nth(10);
	const date = await day.getAttribute('data-date');
	await day.click();
	await expect(page).toHaveURL(new RegExp(`/history/${date}$`));
	await expect(page.getByTestId('day-heading')).toBeVisible();
});

test('adds, corrects and deletes a session with minute precision', async ({ page }) => {
	await signIn(page);
	await page.goto('/history/2026-09-10');
	await expect(page.getByTestId('empty-state')).toBeVisible();

	await page.getByTestId('add-name').fill('Standup');
	await page.getByTestId('add-start').fill('2026-09-10T09:00');
	await page.getByTestId('add-end').fill('2026-09-10T10:30');
	await page.getByTestId('add-timezone').fill('UTC');
	await page.getByTestId('add-submit').click();

	await expect(page.getByTestId('session-item')).toHaveCount(1);
	await expect(page.getByTestId('day-total')).toHaveText('1h 30m');
	await expect(page.getByTestId('session-item')).toContainText('Standup');

	await page.getByTestId('edit-session').click();
	await expect(page.getByTestId('session-form-edit')).toBeVisible();
	await expect(page.getByTestId('edit-name')).toHaveValue('Standup');
	await page.getByTestId('edit-name').fill('Planning');
	await page.getByTestId('edit-end').fill('2026-09-10T11:00');
	await page.getByTestId('edit-submit').click();

	await expect(page.getByTestId('day-total')).toHaveText('2h 0m');
	await expect(page.getByTestId('session-item')).toContainText('09:00 – 11:00');
	await expect(page.getByTestId('session-item')).toContainText('Planning');

	page.once('dialog', (dialog) => dialog.accept());
	await page.getByTestId('delete-session').click();

	await expect(page.getByTestId('empty-state')).toBeVisible();
	await expect(page.getByTestId('day-total')).toHaveText('0m');
});

test('rejects overlapping sessions with an actionable message', async ({ page }) => {
	await signIn(page);
	await page.goto('/history/2026-09-11');
	await expect(page.getByTestId('empty-state')).toBeVisible();

	await page.getByTestId('add-start').fill('2026-09-11T09:00');
	await page.getByTestId('add-end').fill('2026-09-11T10:00');
	await page.getByTestId('add-timezone').fill('UTC');
	await page.getByTestId('add-submit').click();
	await expect(page.getByTestId('session-item')).toHaveCount(1);

	await page.getByTestId('add-start').fill('2026-09-11T09:30');
	await page.getByTestId('add-end').fill('2026-09-11T10:30');
	await page.getByTestId('add-submit').click();

	await expect(page.getByTestId('session-form-error')).toContainText('overlaps');
	await expect(page.getByTestId('session-item')).toHaveCount(1);
});

test('work crossing midnight appears on both local dates', async ({ page }) => {
	await signIn(page);
	await page.goto('/history/2026-09-09');
	await expect(page.getByTestId('empty-state')).toBeVisible();

	await page.getByTestId('add-start').fill('2026-09-09T23:00');
	await page.getByTestId('add-end').fill('2026-09-10T01:00');
	await page.getByTestId('add-timezone').fill('UTC');
	await page.getByTestId('add-submit').click();

	await expect(page.getByTestId('day-total')).toHaveText('1h 0m');

	await page.goto('/history/2026-09-10');
	await expect(page.getByTestId('day-total')).toHaveText('1h 0m');
	await expect(page.getByTestId('session-item')).toContainText('Crosses midnight');
});

test.describe('with a different device timezone', () => {
	test.use({ timezoneId: 'Pacific/Kiritimati' });

	test('previously recorded days do not move after travelling', async ({ page }) => {
		await signIn(page);
		await page.goto('/history/2026-09-12');
		await expect(page.getByTestId('empty-state')).toBeVisible();

		// Record work in a zone far away from the current device zone.
		await page.getByTestId('add-start').fill('2026-09-12T00:30');
		await page.getByTestId('add-end').fill('2026-09-12T01:30');
		await page.getByTestId('add-timezone').fill('Europe/Berlin');
		await page.getByTestId('add-submit').click();

		await expect(page.getByTestId('day-total')).toHaveText('1h 0m');
		await page.reload();
		await expect(page.getByTestId('day-total')).toHaveText('1h 0m');
		await expect(page.getByTestId('session-item')).toContainText('Recorded in Europe/Berlin');
	});
});

test('one user can never see another user\u2019s sessions', async ({ browser }) => {
	const userAEmail = uniqueEmail('user-a');
	const userBEmail = uniqueEmail('user-b');

	const contextA = await browser.newContext();
	const contextB = await browser.newContext();
	const pageA = await contextA.newPage();
	const pageB = await contextB.newPage();

	await pageA.request.post('/api/test-auth', { data: { email: userAEmail, reset: true } });
	await pageA.goto('/history/2026-09-13');
	await expect(pageA.getByTestId('empty-state')).toBeVisible();
	await pageA.getByTestId('add-start').fill('2026-09-13T09:00');
	await pageA.getByTestId('add-end').fill('2026-09-13T10:00');
	await pageA.getByTestId('add-timezone').fill('UTC');
	await pageA.getByTestId('add-submit').click();
	await expect(pageA.getByTestId('session-item')).toHaveCount(1);

	await pageB.request.post('/api/test-auth', { data: { email: userBEmail, reset: true } });
	await pageB.goto('/history/2026-09-13');
	await expect(pageB.getByTestId('empty-state')).toBeVisible();
	await expect(pageB.getByTestId('session-item')).toHaveCount(0);

	await contextA.close();
	await contextB.close();
});

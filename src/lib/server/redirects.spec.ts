import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from './redirects';

describe('safeRedirectTarget', () => {
	it('keeps the dashboard and its month parameter', () => {
		expect(safeRedirectTarget('/')).toBe('/');
		expect(safeRedirectTarget('/?month=2026-01')).toBe('/?month=2026-01');
	});

	it('keeps valid history dates', () => {
		expect(safeRedirectTarget('/history/2026-09-10')).toBe('/history/2026-09-10');
		expect(safeRedirectTarget('/history/2024-02-29')).toBe('/history/2024-02-29');
	});

	it('falls back for routes that do not exist', () => {
		expect(safeRedirectTarget('/es')).toBe('/');
		expect(safeRedirectTarget('/history/2026-02-30')).toBe('/');
		expect(safeRedirectTarget('/history/2026-09-10/extra')).toBe('/');
		expect(safeRedirectTarget('/api/test-auth')).toBe('/');
	});

	it('never redirects off-site', () => {
		expect(safeRedirectTarget('//evil.example/login')).toBe('/');
		expect(safeRedirectTarget('https://evil.example')).toBe('/');
		expect(safeRedirectTarget(null)).toBe('/');
		expect(safeRedirectTarget('')).toBe('/');
	});
});

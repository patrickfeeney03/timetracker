import { describe, expect, it } from 'vitest';
import { decideNavigation } from './navigation';

describe('decideNavigation', () => {
	it('redirects signed-out users to the login page', () => {
		expect(decideNavigation('/', false)).toBe('login');
		expect(decideNavigation('/history/2026-09-18', false)).toBe('login');
	});

	it('lets signed-out users open the login page', () => {
		expect(decideNavigation('/login', false)).toBe('allow');
	});

	it('sends signed-in users away from the login page', () => {
		expect(decideNavigation('/login', true)).toBe('home');
	});

	it('allows signed-in users anywhere else', () => {
		expect(decideNavigation('/', true)).toBe('allow');
		expect(decideNavigation('/history/2026-09-18', true)).toBe('allow');
	});

	it('always allows API routes', () => {
		expect(decideNavigation('/api/auth/callback/google', false)).toBe('allow');
		expect(decideNavigation('/api/auth/sign-out', true)).toBe('allow');
		expect(decideNavigation('/api/test-auth', false)).toBe('allow');
	});
});

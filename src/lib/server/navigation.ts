/**
 * Pure navigation guard used by `hooks.server.ts`. Keeping it separate makes the
 * authentication rules directly unit-testable.
 */
export type NavigationDecision = 'allow' | 'login' | 'home';

export function decideNavigation(pathname: string, hasUser: boolean): NavigationDecision {
	// API routes handle authentication themselves (Better Auth endpoints stay
	// reachable while signed out; the test fixture enforces its own flag).
	if (pathname === '/api' || pathname.startsWith('/api/')) return 'allow';

	if (!hasUser) return pathname === '/login' ? 'allow' : 'login';
	return pathname === '/login' ? 'home' : 'allow';
}

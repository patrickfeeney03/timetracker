/**
 * Structural types for `event.locals`. They mirror Better Auth's session shape
 * without leaking the request-scoped auth instance type into every route.
 */

export type SessionUser = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type SessionRecord = {
	id: string;
	token: string;
	userId: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
	ipAddress?: string | null;
	userAgent?: string | null;
};

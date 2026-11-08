/**
 * Session names and tags. Client-safe so inputs can share the limits, and the
 * server can validate with the same rules.
 */

export const SESSION_NAME_MAX_LENGTH = 200;
export const TAG_NAME_MAX_LENGTH = 40;
export const MAX_TAGS_PER_SESSION = 10;

/**
 * Tags take the categorical palette slots in `app.css` (`--tag-1`…) in the
 * order they were created, so a new tag never repaints older ones. Slots are
 * never reused: later tags share the neutral `--tag-other`.
 */
export const TAG_COLOR_COUNT = 8;

/** The CSS color for a tag's palette slot (`null` is the shared "other"). */
export function tagColorVar(slot: number | null): string {
	return slot === null ? 'var(--tag-other)' : `var(--tag-${slot + 1})`;
}

export type LabelError = { ok: false; field: 'name' | 'tags'; message: string };

/** Trims a submitted name. Blank becomes `null` (unnamed). */
export function normalizeSessionName(raw: string): { ok: true; name: string | null } | LabelError {
	const name = raw.trim();
	if (name.length > SESSION_NAME_MAX_LENGTH) {
		return {
			ok: false,
			field: 'name',
			message: `Keep the name to ${SESSION_NAME_MAX_LENGTH} characters or fewer.`
		};
	}
	return { ok: true, name: name === '' ? null : name };
}

export type TagSelection = {
	/** Ids of existing tags. Ids the user does not own are ignored on write. */
	tagIds: string[];
	/** Names to reuse case-insensitively, or create when new. */
	newTagNames: string[];
};

/**
 * Validates picked tag ids plus comma-separated new tag names. Names are
 * trimmed, inner whitespace is collapsed and duplicates are dropped ignoring
 * case.
 */
export function normalizeTagSelection(
	tagIds: string[],
	rawNewTags: string
): { ok: true; selection: TagSelection } | LabelError {
	const ids = [...new Set(tagIds.filter((id) => id !== ''))];

	const names = new Map<string, string>();
	for (const part of rawNewTags.split(',')) {
		const name = part.trim().replace(/\s+/g, ' ');
		if (name === '') continue;
		if (name.length > TAG_NAME_MAX_LENGTH) {
			return {
				ok: false,
				field: 'tags',
				message: `Keep each tag to ${TAG_NAME_MAX_LENGTH} characters or fewer.`
			};
		}
		if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
	}

	if (ids.length + names.size > MAX_TAGS_PER_SESSION) {
		return {
			ok: false,
			field: 'tags',
			message: `Use at most ${MAX_TAGS_PER_SESSION} tags per session.`
		};
	}
	return { ok: true, selection: { tagIds: ids, newTagNames: [...names.values()] } };
}

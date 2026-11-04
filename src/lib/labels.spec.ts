import { describe, expect, it } from 'vitest';
import { normalizeSessionName, normalizeTagSelection } from './labels';

describe('normalizeSessionName', () => {
	it('trims and treats blank as unnamed', () => {
		expect(normalizeSessionName('  Deep work ')).toEqual({ ok: true, name: 'Deep work' });
		expect(normalizeSessionName('   ')).toEqual({ ok: true, name: null });
	});

	it('rejects overlong names', () => {
		expect(normalizeSessionName('x'.repeat(201)).ok).toBe(false);
		expect(normalizeSessionName('x'.repeat(200)).ok).toBe(true);
	});
});

describe('normalizeTagSelection', () => {
	it('splits, tidies and dedupes new tag names ignoring case', () => {
		const result = normalizeTagSelection([], ' reading,  Deep   work , Reading,, ');
		expect(result).toEqual({
			ok: true,
			selection: { tagIds: [], newTagNames: ['reading', 'Deep work'] }
		});
	});

	it('dedupes picked ids and drops blanks', () => {
		const result = normalizeTagSelection(['a', 'b', 'a', ''], '');
		expect(result).toEqual({ ok: true, selection: { tagIds: ['a', 'b'], newTagNames: [] } });
	});

	it('rejects overlong tags and too many tags', () => {
		expect(normalizeTagSelection([], 'x'.repeat(41)).ok).toBe(false);
		const ids = Array.from({ length: 10 }, (_, index) => `tag-${index}`);
		expect(normalizeTagSelection(ids, '').ok).toBe(true);
		expect(normalizeTagSelection(ids, 'one more').ok).toBe(false);
	});
});

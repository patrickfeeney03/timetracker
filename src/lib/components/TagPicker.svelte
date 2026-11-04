<script lang="ts">
	import { MAX_TAGS_PER_SESSION, TAG_NAME_MAX_LENGTH } from '$lib/labels';
	import type { TagView } from '$lib/types';

	type Props = {
		/** Every tag the user has made. */
		tags: TagView[];
		/** Ids of the ticked tags. */
		selected: string[];
		/** Comma-separated names to reuse or create on submit. */
		newTags: string;
		/** Prefix for test ids, so several pickers can share a page. */
		idPrefix: string;
	};

	let { tags, selected = $bindable(), newTags = $bindable(), idPrefix }: Props = $props();

	function toggle(id: string, checked: boolean) {
		selected = checked ? [...selected, id] : selected.filter((value) => value !== id);
	}
</script>

<div class="tag-picker" role="group" aria-label="Tags" data-testid={`${idPrefix}-tags`}>
	<!-- Unticked checkboxes post nothing; this tells the server the picker was
		on the form, so "no tags" clears them instead of meaning "unchanged". -->
	<input type="hidden" name="tagPicker" value="1" />
	{#each tags as tag (tag.id)}
		<label class="tag-chip" data-testid="tag-option">
			<input
				type="checkbox"
				name="tag"
				value={tag.id}
				checked={selected.includes(tag.id)}
				onchange={(event) => toggle(tag.id, event.currentTarget.checked)}
			/>
			{tag.name}
		</label>
	{/each}
	<input
		class="tag-new"
		type="text"
		name="newTags"
		value={newTags}
		oninput={(event) => (newTags = event.currentTarget.value)}
		maxlength={(TAG_NAME_MAX_LENGTH + 2) * MAX_TAGS_PER_SESSION}
		placeholder={tags.length > 0 ? '+ New tag' : '+ Add tags, e.g. reading, coding'}
		aria-label="New tags, separated by commas"
		autocomplete="off"
		data-testid={`${idPrefix}-new-tag`}
	/>
</div>

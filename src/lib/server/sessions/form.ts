import type { LabelInput } from './service';

/**
 * Reads the optional name and tag fields. A field missing from the form means
 * "leave unchanged". Tag checkboxes send nothing when none are ticked, so the
 * tag picker also posts a `tagPicker` marker to tell "no tags" from "absent".
 */
export function readLabels(data: FormData): LabelInput {
	const name = data.get('name');
	const labels: LabelInput = {};
	if (typeof name === 'string') labels.name = name;
	if (data.has('tagPicker')) {
		labels.tags = {
			tagIds: data.getAll('tag').filter((value) => typeof value === 'string'),
			newTags: String(data.get('newTags') ?? '')
		};
	}
	return labels;
}

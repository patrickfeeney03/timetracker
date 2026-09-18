<script lang="ts">
	import { enhance } from '$app/forms';
	import { createSubmitHandler } from '$lib/forms';

	type Props = {
		mode: 'add' | 'edit';
		sessionId?: string;
		start: string;
		end: string;
		timeZone: string;
		deviceTimeZone: string;
		error?: string | null;
		onCancel?: () => void;
	};

	let {
		mode,
		sessionId,
		start,
		end,
		timeZone,
		deviceTimeZone,
		error = null,
		onCancel
	}: Props = $props();

	const commonTimeZones = [
		'UTC',
		'Europe/Berlin',
		'Europe/London',
		'Europe/Madrid',
		'Europe/Paris',
		'Europe/Warsaw',
		'America/New_York',
		'America/Chicago',
		'America/Denver',
		'America/Los_Angeles',
		'America/Sao_Paulo',
		'Asia/Tokyo',
		'Asia/Shanghai',
		'Asia/Kolkata',
		'Asia/Singapore',
		'Australia/Sydney',
		'Pacific/Auckland'
	];

	const zones = $derived(
		commonTimeZones.includes(deviceTimeZone)
			? commonTimeZones
			: [deviceTimeZone, ...commonTimeZones]
	);

	let submitting = $state(false);
	let localError = $state<string | null>(null);

	const handler = createSubmitHandler({
		setSubmitting: (value) => (submitting = value),
		setError: (message) => (localError = message),
		onSuccess: () => onCancel?.()
	});

	const errorText = $derived(localError ?? error ?? null);
</script>

<form
	method="POST"
	action={mode === 'add' ? '?/add' : '?/edit'}
	use:enhance={handler}
	class="card"
	data-testid={`session-form-${mode}`}
>
	<div class="card-header">
		<h2>{mode === 'add' ? 'Add a session' : 'Edit session'}</h2>
	</div>

	{#if sessionId}
		<input type="hidden" name="sessionId" value={sessionId} />
	{/if}

	<div class="field-grid">
		<div class="field">
			<label for={`${mode}-start`}>Start</label>
			<input
				id={`${mode}-start`}
				name="start"
				type="datetime-local"
				step="60"
				required
				defaultValue={start}
				data-testid={`${mode}-start`}
			/>
		</div>
		<div class="field">
			<label for={`${mode}-end`}>End</label>
			<input
				id={`${mode}-end`}
				name="end"
				type="datetime-local"
				step="60"
				required
				defaultValue={end}
				data-testid={`${mode}-end`}
			/>
		</div>
	</div>

	<div class="field" style="margin-top: 0.75rem;">
		<label for={`${mode}-timezone`}>Timezone (IANA)</label>
		<input
			id={`${mode}-timezone`}
			name="timeZone"
			type="text"
			required
			defaultValue={timeZone}
			list="timezone-options"
			autocomplete="off"
			spellcheck="false"
			data-testid={`${mode}-timezone`}
		/>
		<datalist id="timezone-options">
			{#each zones as zone (zone)}
				<option value={zone}></option>
			{/each}
		</datalist>
	</div>

	{#if errorText}
		<p
			class="message message-error"
			role="alert"
			style="margin-top: 0.75rem;"
			data-testid="session-form-error"
		>
			{errorText}
		</p>
	{/if}

	<div class="form-actions">
		<button class="btn btn-primary" disabled={submitting} data-testid={`${mode}-submit`}>
			{submitting ? 'Saving…' : mode === 'add' ? 'Add session' : 'Save changes'}
		</button>
		{#if onCancel}
			<button class="btn btn-ghost" type="button" onclick={onCancel}>Cancel</button>
		{/if}
	</div>
</form>

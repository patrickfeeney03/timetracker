<script lang="ts">
	import { enhance } from '$app/forms';
	import { createSubmitHandler } from '$lib/forms';
	import { formatLocalTime } from '$lib/format';
	import { SESSION_NAME_MAX_LENGTH } from '$lib/labels';
	import type { ActiveSessionView, ActionFormResult, TagView } from '$lib/types';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import LiveTimer from './LiveTimer.svelte';
	import TagPicker from './TagPicker.svelte';

	type Props = {
		active: ActiveSessionView | null;
		/** Today's recorded total in ms, including the running session up to `serverNow`. */
		todayTotalMs: number;
		serverNow: number;
		deviceTimeZone: string;
		/** Every tag the user has made. */
		tags: TagView[];
		form: ActionFormResult | null;
	};

	let { active, todayTotalMs, serverNow, deviceTimeZone, tags, form }: Props = $props();

	// The hidden input always carries the device's current IANA zone so a
	// travelling user gets the new zone captured on the next start.
	// svelte-ignore state_referenced_locally
	let timeZone = $state(deviceTimeZone);
	let localError = $state<string | null>(null);
	let startSubmitting = $state(false);
	let pauseSubmitting = $state(false);
	let renameSubmitting = $state(false);

	// Labels for the next start. Cleared once a start succeeds.
	let startTags = $state<string[]>([]);
	let startNewTags = $state('');

	// The running session's name and tags. Drafts follow the server values but
	// only reset when those values or the session itself change, so a focus
	// refresh never wipes a half-made edit.
	const activeId = $derived(active?.id ?? null);
	const savedName = $derived(active?.name ?? '');
	const savedTagKey = $derived(active ? tagKey(active.tagIds) : '');
	let nameDraft = $derived.by(() => {
		void activeId;
		return savedName;
	});
	let tagDraft = $derived.by(() => {
		void activeId;
		return savedTagKey === '' ? [] : savedTagKey.split(',');
	});
	let newTagsDraft = $derived.by(() => {
		void activeId;
		return '';
	});
	const dirty = $derived(
		nameDraft.trim() !== savedName || tagKey(tagDraft) !== savedTagKey || newTagsDraft.trim() !== ''
	);

	function tagKey(ids: string[]): string {
		return [...ids].sort().join(',');
	}

	onMount(() => {
		const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (current) timeZone = current;
	});

	const startHandler = createSubmitHandler({
		setSubmitting: (value) => (startSubmitting = value),
		setError: (message) => (localError = message),
		onSuccess: () => {
			startTags = [];
			startNewTags = '';
		}
	});
	const pauseHandler = createSubmitHandler({
		setSubmitting: (value) => (pauseSubmitting = value),
		setError: (message) => (localError = message)
	});
	const renameHandler = createSubmitHandler({
		setSubmitting: (value) => (renameSubmitting = value),
		setError: (message) => (localError = message),
		// New names are now chips (or were already); the server state decides.
		onSuccess: () => (newTagsDraft = '')
	});

	// Save and Pause share one form so unsaved edits are kept on pause. Untouched
	// labels are left out, so a stale tab cannot overwrite an edit made on
	// another device.
	const runningHandler: SubmitFunction = (input) => {
		if (input.action.search !== '?/pause') return renameHandler(input);
		if (!dirty) {
			for (const field of ['name', 'tag', 'newTags', 'tagPicker']) input.formData.delete(field);
		}
		return pauseHandler(input);
	};

	const serverError = $derived(
		form?.action === 'start' || form?.action === 'pause' || form?.action === 'rename'
			? form?.error
			: null
	);
	const errorText = $derived(localError ?? serverError ?? null);
</script>

<section class="card timer-card" aria-label="Timer">
	<div class="row-between">
		<div class="timer-meta">
			{#if active}
				<span class="pill pill-running"><span class="dot"></span> Running</span>
			{:else if todayTotalMs > 0}
				<span class="pill">Paused</span>
			{:else}
				<span class="pill pill-idle">Idle</span>
			{/if}
		</div>
	</div>

	<LiveTimer baseMs={todayTotalMs} {serverNow} running={active !== null} />

	<div class="timer-meta">
		{#if active}
			<span
				>Started {formatLocalTime(active.startedLocal)} · <strong>{active.timeZone}</strong></span
			>
			{#if active.timeZone !== deviceTimeZone}
				<span>This session keeps its original timezone until you pause it.</span>
			{/if}
		{:else if todayTotalMs > 0}
			<span>Today's total · <strong>{deviceTimeZone}</strong></span>
		{:else}
			<span>Starting captures <strong>{timeZone}</strong> as this session's timezone.</span>
		{/if}
	</div>

	{#if active}
		<form method="POST" action="?/rename" use:enhance={runningHandler} class="timer-form">
			<input type="hidden" name="sessionId" value={active.id} />
			<div class="name-row">
				<input
					type="text"
					name="name"
					value={nameDraft}
					oninput={(event) => (nameDraft = event.currentTarget.value)}
					maxlength={SESSION_NAME_MAX_LENGTH}
					placeholder="Name this session"
					aria-label="Session name"
					autocomplete="off"
					data-testid="session-name"
				/>
				<!-- First submit button, so Enter saves instead of pausing. Disabled
					while nothing changed, so Enter then does nothing at all. -->
				<button
					class="btn"
					disabled={!dirty || renameSubmitting || pauseSubmitting}
					data-testid="rename-button"
				>
					{renameSubmitting ? 'Saving…' : 'Save'}
				</button>
			</div>
			<TagPicker
				{tags}
				bind:selected={() => tagDraft, (value) => (tagDraft = value)}
				bind:newTags={() => newTagsDraft, (value) => (newTagsDraft = value)}
				idPrefix="timer"
			/>
			<button
				class="btn btn-primary btn-large btn-block"
				formaction="?/pause"
				disabled={pauseSubmitting || renameSubmitting}
				data-testid="pause-button"
			>
				{pauseSubmitting ? 'Pausing…' : 'Pause'}
			</button>
		</form>
	{:else}
		<form method="POST" action="?/start" use:enhance={startHandler} class="timer-form">
			<input type="hidden" name="timeZone" value={timeZone} />
			<input
				type="text"
				name="name"
				maxlength={SESSION_NAME_MAX_LENGTH}
				placeholder="What are you working on? (optional)"
				aria-label="Session name"
				autocomplete="off"
				data-testid="session-name"
			/>
			<TagPicker {tags} bind:selected={startTags} bind:newTags={startNewTags} idPrefix="timer" />
			<button
				class="btn btn-primary btn-large btn-block"
				disabled={startSubmitting}
				data-testid="start-button"
			>
				{startSubmitting ? 'Starting…' : todayTotalMs > 0 ? 'Resume' : 'Start'}
			</button>
		</form>
	{/if}

	{#if errorText}
		<p class="message message-error" role="alert" data-testid="timer-error">
			{errorText}
			<button class="link-button" type="button" onclick={() => (localError = null)}>Dismiss</button>
		</p>
	{/if}
</section>

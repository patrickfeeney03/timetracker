<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SessionForm from '$lib/components/SessionForm.svelte';
	import { formatDateLong, formatDuration, formatLocalTime } from '$lib/format';
	import { createSubmitHandler } from '$lib/forms';
	import type { ActionFormResult } from '$lib/types';

	const data = $derived(page.data);
	// Action results live on `page.form`, not inside load data.
	const form = $derived((page.form ?? null) as ActionFormResult | null);

	let editingId = $state<string | null>(null);
	let deleteSubmitting = $state(false);
	let deleteError = $state<string | null>(null);

	const deleteHandler = createSubmitHandler({
		setSubmitting: (value) => (deleteSubmitting = value),
		setError: (message) => (deleteError = message),
		confirm: () => window.confirm('Delete this session? This cannot be undone.')
	});

	const editError = (id: string) =>
		form?.action === 'edit' && form.sessionId === id ? (form.error ?? null) : null;
</script>

<div class="page">
	<section class="row-between">
		<div>
			<a class="small muted" href={resolve('/')}>← Calendar</a>
			<h1 data-testid="day-heading">{formatDateLong(data.date)}</h1>
		</div>
		<div style="text-align: right;">
			<div class="session-duration" style="font-size: 1.7rem;" data-testid="day-total">
				{formatDuration(data.totalMs)}
			</div>
			<p class="muted small" style="margin: 0;">
				{data.entries.length}
				{data.entries.length === 1 ? 'session' : 'sessions'}
			</p>
		</div>
	</section>

	<nav class="row" aria-label="Day navigation">
		<a class="btn" href={resolve(`/history/${data.previousDate}`)} rel="prev">← Previous day</a>
		<a class="btn" href={resolve(`/history/${data.nextDate}`)} rel="next">Next day →</a>
	</nav>

	{#if form?.action === 'delete' && form.error}
		<p class="message message-error" role="alert" data-testid="delete-error">{form.error}</p>
	{:else if deleteError}
		<p class="message message-error" role="alert" data-testid="delete-error">{deleteError}</p>
	{/if}

	{#if data.entries.length === 0}
		<div class="empty-state" data-testid="empty-state">
			<p style="margin: 0;">No time recorded on this day.</p>
			<p class="small" style="margin: 0.35rem 0 0;">Add a session below to correct your history.</p>
		</div>
	{:else}
		<ul class="session-list">
			{#each data.entries as entry (entry.id)}
				<li class="session-item" data-testid="session-item">
					<div>
						<div class="session-time">
							{formatLocalTime(entry.startLocal)} – {entry.endLocal
								? formatLocalTime(entry.endLocal)
								: 'now'}
						</div>
						<div class="row small muted" style="gap: 0.5rem; margin-top: 0.2rem;">
							{#if entry.isRunning}
								<span class="pill pill-running"><span class="dot"></span> Running</span>
							{/if}
							{#if entry.crossesMidnight}
								<span>Crosses midnight</span>
							{/if}
							{#if entry.timeZone !== data.deviceTimeZone}
								<span class="tz-note">Recorded in {entry.timeZone}</span>
							{:else}
								<span class="tz-note">{entry.timeZone}</span>
							{/if}
						</div>
					</div>

					<div class="session-actions">
						<span class="session-duration">{formatDuration(entry.durationMs)}</span>
						<button
							class="btn btn-ghost"
							type="button"
							disabled={entry.isRunning}
							title={entry.isRunning ? 'Pause the timer before editing' : 'Edit session'}
							onclick={() => (editingId = editingId === entry.id ? null : entry.id)}
							data-testid="edit-session"
						>
							Edit
						</button>
						<form method="POST" action="?/delete" use:enhance={deleteHandler}>
							<input type="hidden" name="sessionId" value={entry.id} />
							<button
								class="btn btn-danger"
								disabled={deleteSubmitting || entry.isRunning}
								title={entry.isRunning ? 'Pause the timer before deleting' : 'Delete session'}
								data-testid="delete-session"
							>
								Delete
							</button>
						</form>
					</div>
				</li>

				{#if editingId === entry.id}
					<li>
						<SessionForm
							mode="edit"
							sessionId={entry.id}
							start={entry.startLocal}
							end={entry.endLocal ?? entry.startLocal}
							timeZone={entry.timeZone}
							deviceTimeZone={data.deviceTimeZone}
							error={editError(entry.id)}
							onCancel={() => (editingId = null)}
						/>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}

	{#key data.date}
		<SessionForm
			mode="add"
			start={data.addDefaults.start}
			end={data.addDefaults.end}
			timeZone={data.addDefaults.timeZone}
			deviceTimeZone={data.deviceTimeZone}
			error={form?.action === 'add' ? (form.error ?? null) : null}
		/>
	{/key}
</div>

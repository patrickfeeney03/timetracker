<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { createAuthClient } from 'better-auth/svelte';

	const authClient = createAuthClient();
	let signingOut = $state(false);

	let { children } = $props();

	const user = $derived(page.data.user);
	const serverTimeZone = $derived(page.data.deviceTimeZone);
	const isLogin = $derived(page.url.pathname === '/login');

	onMount(() => {
		// Keep the server in sync with the device's current IANA timezone. It is
		// used for "today", calendar defaults and newly captured sessions. Only
		// re-render when the server's zone actually differs: the extra round trip
		// after a fresh visit could otherwise clobber form input.
		try {
			const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
			if (!timeZone) return;
			const current = document.cookie
				.split('; ')
				.find((cookie) => cookie.startsWith('tz='))
				?.slice(3);
			if (decodeURIComponent(current ?? '') === timeZone && serverTimeZone === timeZone) return;

			document.cookie = `tz=${encodeURIComponent(timeZone)};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
			if (serverTimeZone !== timeZone) void invalidateAll();
		} catch {
			// Intl can be unavailable in exotic environments; UTC remains the fallback.
		}
	});

	async function signOut() {
		signingOut = true;
		try {
			await authClient.signOut();
			await goto(resolve('/login'));
		} finally {
			signingOut = false;
		}
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="theme-color" content="#0d1015" />

	<title>Work Time Tracker</title>

	<!-- Site-wide social defaults only. Page-specific tags (title, description,
		canonical, og:title/og:description/og:url, twitter title/description) live
		in each page's svelte:head: Svelte dedupes <title> but renders duplicate
		<meta> tags, and most scrapers honor the first occurrence. -->
	<meta property="og:site_name" content="Work Time Tracker" />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="https://timetracker.patrick.pe/og-image.png" />
	<meta property="og:image:alt" content="Work Time Tracker — a timer that lives on the server" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content="https://timetracker.patrick.pe/og-image.png" />
</svelte:head>

<div class="app-shell">
	{#if !isLogin}
		<header class="topbar">
			<div class="topbar-inner">
				<a class="brand" href={resolve('/')}>Work Time Tracker</a>
				<div class="topbar-spacer"></div>
				{#if user}
					<span class="topbar-user" title={user.email}>{user.email}</span>
					<button class="link-button" onclick={signOut} disabled={signingOut}>
						{signingOut ? 'Signing out…' : 'Sign out'}
					</button>
				{/if}
			</div>
		</header>
	{/if}

	<main>
		{@render children()}
	</main>
</div>

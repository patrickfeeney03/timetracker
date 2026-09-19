<script lang="ts">
	import GoogleSignInButton from '$lib/components/GoogleSignInButton.svelte';

	const title = 'Work Time Tracker — a timer that lives on the server';
	// Keep under ~160 characters: Google truncates longer snippets.
	const description =
		'A work-time tracker whose timer runs on the server. Close the browser, switch devices, cross timezones — your recorded time stays exact.';

	const features = [
		{
			title: 'The timer lives on the server',
			body: 'Start on your laptop, check it from your phone. Closing the browser never stops or loses a running timer.'
		},
		{
			title: 'Intervals are the source of truth',
			body: 'Daily totals are always derived from exact UTC timestamps, never stored — so your history can never drift.'
		},
		{
			title: 'Timezone-safe history',
			body: 'Every session keeps the timezone it was recorded in. Travel never moves past work to another day, and midnight crossings are split at real local midnight.'
		},
		{
			title: 'One timer, every device',
			body: 'A single running timer per account, enforced by the database even when two devices race. Other devices catch up on focus, no WebSockets needed.'
		}
	];

	const structuredData = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'Work Time Tracker',
		url: 'https://timetracker.patrick.pe/login',
		applicationCategory: 'BusinessApplication',
		operatingSystem: 'Any',
		browserRequirements: 'Requires JavaScript',
		description,
		offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' }
	});

	// Built by concatenation so neither the Svelte compiler nor the lint parser
	// mistakes the JSON-LD wrapper for a real script element.
	const jsonLdOpen = '<' + 'script type="application/ld+json">';
	const jsonLdClose = '<' + '/' + 'script>';
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="https://timetracker.patrick.pe/login" />
	<meta property="og:url" content="https://timetracker.patrick.pe/login" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted, locally built JSON-LD -->
	{@html `${jsonLdOpen}${structuredData}${jsonLdClose}`}
</svelte:head>

<div class="landing">
	<section class="landing-hero">
		<div class="landing-hero-inner">
			<h1>Work Time Tracker</h1>
			<p class="landing-tagline">
				A timer that lives on the server — close the tab, switch devices, cross timezones. Your
				recorded time stays exact.
			</p>
			<GoogleSignInButton testid="google-sign-in" />
			<p class="landing-privacy">
				Free to use. Google sign-in requests only your name, email and profile image.
			</p>
		</div>
	</section>

	<section class="landing-features">
		<h2>Why it works</h2>
		<div class="landing-grid">
			{#each features as feature (feature.title)}
				<article class="card landing-card">
					<h3>{feature.title}</h3>
					<p class="muted">{feature.body}</p>
				</article>
			{/each}
		</div>
	</section>

	<footer class="landing-footer">Personal project</footer>
</div>

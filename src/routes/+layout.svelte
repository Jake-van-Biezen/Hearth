<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { pwaInfo } from 'virtual:pwa-info';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();

	// Manifest link is static in app.html (SPA: head must not depend on JS).
	// Register the service worker so the app is installable and works offline.
	onMount(async () => {
		if (!pwaInfo) return;
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});
</script>

<ModeWatcher defaultMode="system" />

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbfaf4" />
	<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#211e1a" />
</svelte:head>
{@render children()}
<Toaster offset={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }} />

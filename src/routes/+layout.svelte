<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" content="#fbfaf4" />
</svelte:head>
{@render children()}

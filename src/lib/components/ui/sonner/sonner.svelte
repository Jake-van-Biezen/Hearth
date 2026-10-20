<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import { mode } from 'mode-watcher';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme={mode.current ?? "light"}
	position="bottom-center"
	class="toaster group"
	style="--normal-bg:var(--sheet); --normal-text:var(--ink); --normal-border:var(--ctrl-border); --normal-border-color:var(--ctrl-border);"
	toastOptions={{
		classes: {
			toast: 'cn-toast'
		},
		style:
			"font-family:'Karla Variable','Karla',sans-serif;font-size:15px;background-color:var(--sheet);color:var(--ink);border:1px solid var(--ctrl-border);border-radius:8px;box-shadow:var(--shadow-toast);"
	}}
	{...restProps}
>
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" style="color:var(--ok); flex-shrink:0;" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" style="color:var(--err); flex-shrink:0;" />
	{/snippet}
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" style="color:var(--ink-soft); flex-shrink:0;" />
	{/snippet}
</Sonner>

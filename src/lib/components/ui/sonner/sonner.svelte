<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme="light"
	position="bottom-center"
	class="toaster group"
	style="--normal-bg:#ffffff; --normal-text:#22252a; --normal-border:#c9ccd2; --normal-border-color:#c9ccd2;"
	toastOptions={{
		classes: {
			toast: 'cn-toast'
		},
		style:
			"font-family:'Karla Variable','Karla',sans-serif;font-size:15px;background-color:#ffffff;color:#22252a;border:1px solid #c9ccd2;border-radius:8px;box-shadow:0 1px 2px rgba(34,37,42,0.06),0 10px 28px -12px rgba(34,37,42,0.25);"
	}}
	{...restProps}
>
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" style="color:#3b9e6b; flex-shrink:0;" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" style="color:#a03427; flex-shrink:0;" />
	{/snippet}
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" style="color:#4c5260; flex-shrink:0;" />
	{/snippet}
</Sonner>

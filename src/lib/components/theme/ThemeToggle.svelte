<script lang="ts">
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import { mode, setMode, resetMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	const options = [
		{ value: 'light', label: 'Light', run: () => setMode('light') },
		{ value: 'dark', label: 'Dark', run: () => setMode('dark') },
		{ value: 'system', label: 'System', run: () => resetMode() }
	] as const;
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="theme-btn" aria-label="Theme">
		{#if mode.current === 'dark'}
			<Moon size={20} strokeWidth={2.25} />
		{:else}
			<Sun size={20} strokeWidth={2.25} />
		{/if}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		{#each options as opt (opt.value)}
			<DropdownMenu.Item onclick={opt.run} aria-current={userPrefersMode.current === opt.value ? 'true' : undefined}>
				{opt.label}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>

<style>
	:global(.theme-btn) {
		height: 44px;
		width: 44px;
		display: grid;
		place-items: center;
		border: 1px solid var(--ctrl-border);
		background: var(--sheet);
		border-radius: 999px;
		box-shadow: var(--shadow-pill);
		color: var(--ink);
		cursor: pointer;
	}
	:global(.theme-btn:focus-visible) {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
</style>

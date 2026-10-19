<script lang="ts">
	import { pb } from '$lib/pocketbase';

	if (pb.authStore.isValid) {
		// noop placeholder until stories land
	}
</script>

<main class="flex min-h-screen flex-col items-center justify-center gap-2">
	<h1 class="text-4xl font-semibold tracking-tight">Hearth</h1>
	<p class="text-muted-foreground">A shared family calendar.</p>
</main>

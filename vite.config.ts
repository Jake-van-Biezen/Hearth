import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or if you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		}),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Hearth',
				short_name: 'Hearth',
				description: 'A shared family calendar',
				theme_color: '#1c1917',
				background_color: '#1c1917',
				display: 'standalone',
				start_url: '/',
				lang: 'en',
				icons: [
					{ src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
				runtimeCaching: [
					{
						urlPattern: ({ url }) => url.pathname.startsWith('/_pb') || url.pathname.startsWith('/api/files/'),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'hearth-pb-assets',
							expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }
						}
					}
				]
			}
		})
	]
});

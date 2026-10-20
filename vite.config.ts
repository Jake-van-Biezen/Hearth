import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
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

			// SPA build served by PocketBase from pb_public (same origin as the API).
			// PocketBase falls back to index.html for unknown paths.
			adapter: adapter({ fallback: 'index.html' })
		}),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			kit: { adapterFallback: 'index.html', spa: true },
			manifest: {
				name: 'Hearth',
				short_name: 'Hearth',
				description: 'A shared family calendar',
				theme_color: '#fbfaf4',
				background_color: '#fbfaf4',
				display: 'standalone',
				id: '/',
				start_url: '/',
				scope: '/',
				lang: 'en',
				icons: [
					{ src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
				// Web Push + notification click handlers (static/push-sw.js).
				importScripts: ['push-sw.js'],
				// PocketBase owns these: API (incl. the OAuth2 redirect popup) and admin UI.
				navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
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

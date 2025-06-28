import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react({
			babel: {
				plugins: ['babel-plugin-react-compiler'],
			},
		}),
		svgr(),
		VitePWA({
			registerType: 'autoUpdate',
			workbox: {
				// Caching strategy for all assets
				globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
			},
			manifest: {
				name: 'Glitchy Pixels Gallery',
				short_name: 'GlitchyPixels',
				description: 'An infinite gallery of glitch art.',
				theme_color: '#1a1a1a',
				icons: [
					{
						src: 'web-app-manifest-192x192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: 'web-app-manifest-512x512.png',
						sizes: '512x512',
						type: 'image/png',
					},
				],
			},
		}),
	],
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		react(),
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
						src: 'pwa-192x192.png', // Create this icon in /public
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: 'pwa-512x512.png', // Create this icon in /public
						sizes: '512x512',
						type: 'image/png',
					},
				],
			},
		}),
	],
})

import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';


// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		svelte({
			include: ['src/**/*.svelte', 'node_modules/**/*.svelte'],
			exclude: ['src/lib/Iframe.svelte']
		}),
		svelte({
			include: ['src/lib/Iframe.svelte'],
			compilerOptions: {
				customElement: true
			}
		})
	]
});

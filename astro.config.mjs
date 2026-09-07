// @ts-check
import { defineConfig } from 'astro/config';
import { remarkGalleryPlugin, remarkObsidianImages } from './scripts/remark-obsidian-media.mjs';
import { devSourceMediaFallbackPlugin } from './scripts/vite-dev-media.mjs';

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkGalleryPlugin, remarkObsidianImages],
  },
  vite: {
    plugins: [devSourceMediaFallbackPlugin()],
    resolve: {
      preserveSymlinks: true,
    },
  },
});

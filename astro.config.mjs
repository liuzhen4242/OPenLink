// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  vite: {
    // Allow Vite to follow symlinks into the Obsidian vault
    server: {
      fs: {
        allow: [
          '.',
          '/Users/zhenliu/极空云/obsidian',
        ],
      },
    },
    // Resolve symlinks so Astro can process files inside the vault
    resolve: {
      preserveSymlinks: true,
    },
  },
});

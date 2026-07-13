// @ts-check
import { defineConfig } from 'astro/config';

/**
 * Remark plugin: rewrites Obsidian bare image filenames ("Pasted%20image.png")
 * to absolute /@fs/ paths so Astro v7's content-assets plugin ignores them.
 */
function remarkObsidianImages() {
  return (tree, file) => {
    const filePath = file.path || '';
    // Derive the project directory from the .md file path
    const projectDir = filePath.replace(/\/[^/]+\.md$/, '');
    walk(tree);
    function walk(node) {
      if (node.type === 'image') {
        const url = node.url || '';
        if (url && !url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:')) {
          const decoded = decodeURIComponent(url);
          node.url = `/@fs${projectDir}/images/${encodeURIComponent(decoded)}`;
        }
      }
      if (node.children) node.children.forEach(walk);
    }
  };
}

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkObsidianImages],
  },
  vite: {
    server: {
      fs: {
        allow: ['.', '/Users/zhenliu/极空云/obsidian'],
      },
    },
    resolve: {
      preserveSymlinks: true,
    },
  },
});
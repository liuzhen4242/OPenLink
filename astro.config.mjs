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

/**
 * Remark plugin: converts ```gallery fenced code blocks into a
 * `.gallery-slider` raw-HTML block containing resolved <img> tags.
 *
 * Obsidian's "Gallery Slider" plugin renders this same ```gallery block
 * live inside Obsidian using a custom code-block processor. Astro's
 * markdown pipeline has no equivalent for unknown code-block languages —
 * by default it just renders the block as an escaped <pre><code> text
 * block, which is why gallery images were never showing up. This plugin
 * gives Astro the same rendering behavior at build time.
 */
function remarkGalleryPlugin() {
  return (tree, file) => {
    const filePath = file.path || '';
    const projectDir = filePath.replace(/\/[^/]+\.md$/, '');

    function resolveGalleryImage(url) {
      if (!url) return null;
      if (url.startsWith('http') || url.startsWith('data:')) return url;
      // Decode, then take just the filename — matches the runtime
      // rewriting logic already used for normal <img> tags in the page.
      const decoded = decodeURIComponent(url);
      const filename = decoded.split('/').pop();
      if (!filename) return null;
      return `/@fs${projectDir}/images/${encodeURIComponent(filename)}`;
    }

    function walk(node) {
      if (!node.children) return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];

        if (child.type === 'code' && child.lang === 'gallery') {
          const matches = [...(child.value || '').matchAll(/!\[\]\((.*?)\)/g)];
          const srcs = matches
            .map((m) => resolveGalleryImage(m[1]))
            .filter(Boolean);

          if (srcs.length > 0) {
            const imgsHtml = srcs
              .map(
                (src, idx) =>
                  `<img src="${src}" data-index="${idx}" class="${idx === 0 ? 'is-active' : ''}" alt="" />`
              )
              .join('\n');

            node.children[i] = {
              type: 'html',
              value: `<div class="gallery-slider" data-count="${srcs.length}">\n${imgsHtml}\n</div>`,
            };
          } else {
            node.children[i] = {
              type: 'html',
              value: `<p class="gallery-empty">No gallery images</p>`,
            };
          }

          continue;
        }

        walk(child);
      }
    }

    walk(tree);
  };
}

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkGalleryPlugin, remarkObsidianImages],
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

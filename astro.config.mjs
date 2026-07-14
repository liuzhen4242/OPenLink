// @ts-check
import { defineConfig } from 'astro/config';

// The marker string used to locate where, inside an absolute file path,
// the "content/projects/<ProjectDir>/xxx.md" portion begins.
const PROJECTS_ROOT_MARKER = 'content/projects/';

/**
 * Given the absolute path to a project's .md file, return the project's
 * directory relative to src/content/projects/ — e.g. "Xinjiang_Museum".
 */
function getRelativeProjectDir(filePath) {
  const idx = filePath.indexOf(PROJECTS_ROOT_MARKER);
  if (idx === -1) return '';
  const afterRoot = filePath.slice(idx + PROJECTS_ROOT_MARKER.length);
  const parts = afterRoot.split('/');
  parts.pop(); // drop the .md filename itself
  return parts.join('/');
}

/**
 * Resolve an Obsidian-style image reference (possibly URL-encoded, possibly
 * containing a leading "images/" segment) down to just its filename, then
 * build a stable production-safe URL under /project-images/, which is
 * populated at build/dev time by scripts/sync-project-images.mjs.
 *
 * NOTE: this deliberately does NOT use Vite's /@fs/ debug endpoint — /@fs/
 * only exists while a Vite dev server is running locally and can only see
 * paths that exist on that same machine. It does not exist at all in a
 * production build (e.g. on Netlify), which is why images broke there.
 */
function resolveProjectImage(relativeProjectDir, rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('http') || rawUrl.startsWith('data:')) return rawUrl;

  const decoded = decodeURIComponent(rawUrl);
  const filename = decoded.split('/').pop();
  if (!filename) return null;

  return `/project-images/${relativeProjectDir}/images/${encodeURIComponent(filename)}`;
}

/**
 * Remark plugin: rewrites Obsidian-style relative image references in the
 * markdown body (![](images/xxx.png)) to /project-images/ URLs.
 */
function remarkObsidianImages() {
  return (tree, file) => {
    const filePath = file.path || '';
    const relativeProjectDir = getRelativeProjectDir(filePath);

    walk(tree);
    function walk(node) {
      if (node.type === 'image') {
        const resolved = resolveProjectImage(relativeProjectDir, node.url || '');
        if (resolved) node.url = resolved;
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
    const relativeProjectDir = getRelativeProjectDir(filePath);

    function walk(node) {
      if (!node.children) return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];

        if (child.type === 'code' && child.lang === 'gallery') {
          const matches = [...(child.value || '').matchAll(/!\[\]\((.*?)\)/g)];
          const srcs = matches
            .map((m) => resolveProjectImage(relativeProjectDir, m[1]))
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

// @ts-check
import { defineConfig } from 'astro/config';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Absolute path to the folder scripts/sync-project-images.mjs writes
// resized/compressed images into (populated before both `npm run dev` and
// `npm run build` — see package.json).
const PUBLIC_IMAGES_ROOT = fileURLToPath(new URL('./public/project-images/', import.meta.url));

// The marker string used to locate where, inside an absolute file path,
// the "content/projects/<ProjectDir>/xxx.md" portion begins.
const PROJECTS_ROOT_MARKER = 'content/projects/';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * macOS (APFS/HFS+) stores filenames on disk in Unicode NFD form, but text
 * typed into Markdown (or pasted from elsewhere) is usually NFC. The same
 * visible Chinese filename can therefore differ byte-for-byte between what
 * Node reads via readdirSync (NFD, matches disk) and what's embedded in the
 * markdown source (NFC) — silently breaking exact-string/regex matching.
 * Normalizing both sides to NFC before comparing avoids this.
 */
function normalize(str) {
  return str.normalize('NFC');
}

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
 * Resolve an Obsidian-style image reference to a production-safe URL set:
 * { src, srcset, sizes }. Looks for the "<base>-<width>w.webp" responsive
 * variants that scripts/sync-project-images.mjs generates; if none exist
 * (e.g. the file is a .gif/.svg passthrough, or sync hasn't run yet) it
 * falls back to a single plain URL for the original filename.
 *
 * NOTE: this deliberately does NOT use Vite's /@fs/ debug endpoint — /@fs/
 * only exists while a Vite dev server is running locally and can only see
 * paths that exist on that same machine. It does not exist at all in a
 * production build (e.g. on Netlify, Vercel, Cloudflare Pages, etc).
 */
function resolveProjectImageSet(relativeProjectDir, rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('http') || rawUrl.startsWith('data:')) {
    return { src: rawUrl, srcset: null, sizes: null };
  }

  const decoded = normalize(decodeURIComponent(rawUrl));
  const filename = decoded.split('/').pop();
  if (!filename) return null;

  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  const imagesDirAbs = path.join(PUBLIC_IMAGES_ROOT, relativeProjectDir, 'images');
  const urlDir = `/project-images/${relativeProjectDir}/images`;

  let variants = [];
  let matchedOriginalName = filename;

  if (existsSync(imagesDirAbs)) {
    const pattern = new RegExp(`^${escapeRegExp(base)}-(\\d+)w\\.webp$`);
    const entries = readdirSync(imagesDirAbs);

    variants = entries
      .map((name) => {
        const m = normalize(name).match(pattern);
        return m ? { name, width: parseInt(m[1], 10) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.width - b.width);

    // No responsive variant matched — the file might still exist as a
    // plain passthrough copy (e.g. compression failed and we fell back to
    // copying the original, or it's a .gif/.svg). Find its real on-disk
    // name so we don't 404 on a normalization mismatch.
    if (variants.length === 0) {
      const directMatch = entries.find((name) => normalize(name) === filename);
      if (directMatch) matchedOriginalName = directMatch;
    }
  }

  if (variants.length > 0) {
    const srcset = variants
      .map((v) => `${urlDir}/${encodeURIComponent(v.name)} ${v.width}w`)
      .join(', ');
    // Largest available variant doubles as the plain fallback `src` for
    // anything that ignores srcset (old crawlers, RSS readers, etc).
    const largest = variants[variants.length - 1];
    return {
      src: `${urlDir}/${encodeURIComponent(largest.name)}`,
      srcset,
      // These images run full-bleed in .prose (max-width: none), so the
      // rendered width is essentially the viewport width at every
      // breakpoint — tell the browser that directly.
      sizes: '100vw',
    };
  }

  // No responsive variants found — plain passthrough file (gif/svg, or a
  // compression failure that fell back to a raw copy).
  return { src: `${urlDir}/${encodeURIComponent(matchedOriginalName)}`, srcset: null, sizes: null };
}

/**
 * Remark plugin: rewrites Obsidian-style relative image references in the
 * markdown body (![](images/xxx.png)) to /project-images/ URLs with a
 * responsive srcset, and adds loading="lazy" so off-screen images don't
 * block initial page load.
 */
function remarkObsidianImages() {
  return (tree, file) => {
    const filePath = file.path || '';
    const relativeProjectDir = getRelativeProjectDir(filePath);

    walk(tree);
    function walk(node) {
      if (node.type === 'image') {
        const resolved = resolveProjectImageSet(relativeProjectDir, node.url || '');
        if (resolved) {
          node.url = resolved.src;
          const hProperties = { loading: 'lazy', decoding: 'async' };
          if (resolved.srcset) hProperties.srcset = resolved.srcset;
          if (resolved.sizes) hProperties.sizes = resolved.sizes;
          node.data = node.data || {};
          node.data.hProperties = { ...(node.data.hProperties || {}), ...hProperties };
        }
      }
      if (node.children) node.children.forEach(walk);
    }
  };
}

/**
 * Remark plugin: converts ```gallery fenced code blocks into a
 * `.gallery-slider` raw-HTML block containing resolved <img> tags (each
 * with its own responsive srcset).
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
          const resolvedImgs = matches
            .map((m) => resolveProjectImageSet(relativeProjectDir, m[1]))
            .filter(Boolean);

          if (resolvedImgs.length > 0) {
            const imgsHtml = resolvedImgs
              .map((img, idx) => {
                const srcsetAttr = img.srcset ? ` srcset="${img.srcset}"` : '';
                const sizesAttr = img.sizes ? ` sizes="${img.sizes}"` : '';
                const activeClass = idx === 0 ? 'is-active' : '';
                return `<img src="${img.src}"${srcsetAttr}${sizesAttr} data-index="${idx}" class="${activeClass}" loading="lazy" decoding="async" alt="" />`;
              })
              .join('\n');

            node.children[i] = {
              type: 'html',
              value: `<div class="gallery-slider" data-count="${resolvedImgs.length}">\n${imgsHtml}\n</div>`,
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

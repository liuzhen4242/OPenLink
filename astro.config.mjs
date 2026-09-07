// @ts-check
import { defineConfig } from 'astro/config';
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Absolute path to the folder scripts/sync-project-images.mjs writes
// resized/compressed images into (populated before both `npm run dev` and
// `npm run build` — see package.json).
const PUBLIC_IMAGES_ROOT = fileURLToPath(new URL('./public/project-images/', import.meta.url));
const CONTENT_ROOT = fileURLToPath(new URL('./src/content/', import.meta.url));

/**
 * Dev-only fallback for /project-images/* requests. The image sync script
 * only runs at `npm run dev`/`npm run build` startup, so an image added to
 * a source folder afterwards would 404 until a restart. Instead of making
 * dev watch folders (unreliable with sync tools), serve the ORIGINAL source
 * image straight from src/content when it hasn't been copied to public yet.
 * Production builds are unaffected: they still ship the synced webp set.
 */
function devSourceImageFallbackPlugin() {
  const MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.tiff': 'image/tiff',
  };

  return {
    name: 'openlink-dev-source-images',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/project-images/')) return next();

        // 1) Already synced into public? Let Vite serve it as usual.
        const after = url.slice('/project-images/'.length).split('?')[0];
        const decodedAfter = normalize(decodeURIComponent(after));
        const publicFile = path.join(PUBLIC_IMAGES_ROOT, decodedAfter);
        if (existsSync(publicFile)) return next();

        // 2) Otherwise try to find the original in the source content folders,
        // so newly added images appear without re-running the sync script.
        const slashIdx = decodedAfter.lastIndexOf('/');
        if (slashIdx === -1) return next();
        const dirPart = decodedAfter.slice(0, slashIdx); // "images" or "<Project>/images"
        const requested = decodedAfter.slice(slashIdx + 1);
        if (requested.startsWith('.')) return next();

        const segments = dirPart.split('/').filter(Boolean);
        if (segments[segments.length - 1] !== 'images') return next();

        const isBlog = segments.length === 1;
        const sourceImages = isBlog
          ? path.join(CONTENT_ROOT, 'blog', 'images')
          : path.join(CONTENT_ROOT, 'projects', segments[0], 'images');
        if (!existsSync(sourceImages)) return next();

        // Strip a "-480w.webp"-style responsive suffix so a variant request
        // can match the original source file (base name, any extension).
        const requestedBase = requested.replace(/-\d+w\.webp$/i, '').replace(/\.[^.]+$/, '');
        const match = readdirSync(sourceImages).find((name) => {
          if (name.startsWith('.')) return false;
          const nameBase = normalize(name).replace(/\.[^.]+$/, '');
          return normalize(name) === requested || nameBase === requestedBase;
        });
        if (!match) return next();

        const filePath = path.resolve(sourceImages, match);
        if (!filePath.startsWith(path.resolve(CONTENT_ROOT) + path.sep)) return next();

        const ext = path.extname(match).toLowerCase();
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        createReadStream(filePath).on('error', () => res.end()).pipe(res);
      });
    },
  };
}

// The marker string used to locate where, inside an absolute file path,
// the "content/projects/<ProjectDir>/xxx.md" portion begins.
const PROJECTS_ROOT_MARKER = 'content/projects/';

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * macOS (APFS/HFS+) stores filenames on disk in Unicode NFD form, but text
 * typed into Markdown (or pasted from elsewhere) is usually NFC. Normalizing
 * both sides to NFC before comparing avoids silent mismatches.
 */
function normalize(str) {
  return str.normalize('NFC');
}

/**
 * Given the absolute path to a project's .md file, return the project's
 * directory relative to src/content/projects/ — e.g. "Xinjiang_Museum".
 */
function getRelativeProjectDir(filePath) {
  // On Windows, file paths use backslashes; normalize to forward slashes so
  // the marker search and split below work the same as on macOS/Linux.
  const normalizedPath = filePath.replace(/\\/g, '/');
  const idx = normalizedPath.indexOf(PROJECTS_ROOT_MARKER);
  if (idx === -1) return '';
  const afterRoot = normalizedPath.slice(idx + PROJECTS_ROOT_MARKER.length);
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
  // blog 等相对目录为空的文章，URL 直接用 /project-images/images，避免双斜杠
  const urlDir = relativeProjectDir
    ? `/project-images/${relativeProjectDir}/images`
    : '/project-images/images';

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

    if (variants.length === 0) {
      const directMatch = entries.find((name) => normalize(name) === filename);
      if (directMatch) matchedOriginalName = directMatch;
    }
  }

  if (variants.length > 0) {
    const srcset = variants
      .map((v) => `${urlDir}/${encodeURIComponent(v.name)} ${v.width}w`)
      .join(', ');
    const largest = variants[variants.length - 1];
    return {
      src: `${urlDir}/${encodeURIComponent(largest.name)}`,
      srcset,
      sizes: '100vw',
    };
  }

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

    function walk(node) {
      if (!node.children) return;
      for (const child of node.children) {
        if (child.type === 'image') {
          const resolved = resolveProjectImageSet(relativeProjectDir, child.url || '');
          if (resolved) {
            child.url = resolved.src;
            const hProperties = { loading: 'lazy', decoding: 'async' };
            if (resolved.srcset) hProperties.srcset = resolved.srcset;
            if (resolved.sizes) hProperties.sizes = resolved.sizes;
            child.data = child.data || {};
            child.data.hProperties = { ...(child.data.hProperties || {}), ...hProperties };
          }
        }
        walk(child);
      }
    }
    walk(tree);
  };
}

/**
 * Remark plugin: converts ```gallery fenced code blocks into a
 * `.gallery-slider` raw-HTML block containing resolved <img> tags (each
 * with its own responsive srcset). Untouched by the coverImage-matching
 * logic above, since gallery blocks are `code` nodes, not `image` nodes —
 * so a photo used as coverImage will still show up inside a gallery block
 * if you happen to also include it there.
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
                const activeClass = idx === 0 ? 'is-active' : '';
                // Deliberately no srcset/sizes here: while an <img> is
                // display:none (every slide except the active one), the
                // browser can't measure its real render width, so it
                // guesses a small srcset candidate — then re-fetches a
                // larger one the instant it becomes visible, which is
                // exactly what caused the flash/stall on slide changes.
                // A single fixed-size image sidesteps that entirely.
                return `<img src="${img.src}" data-index="${idx}" class="${activeClass}" alt="" />`;
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
    plugins: [devSourceImageFallbackPlugin()],
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

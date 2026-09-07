// @ts-check
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Absolute path to the folder scripts/sync-project-images.mjs writes
// resized/compressed images into (populated before `npm run dev` / `npm run build`).
const PUBLIC_IMAGES_ROOT = fileURLToPath(new URL('../public/project-images/', import.meta.url));

const PROJECTS_ROOT_MARKER = 'content/projects/';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv']);

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
  const normalizedPath = filePath.replace(/\\/g, '/');
  const idx = normalizedPath.indexOf(PROJECTS_ROOT_MARKER);
  if (idx === -1) return '';
  const afterRoot = normalizedPath.slice(idx + PROJECTS_ROOT_MARKER.length);
  const parts = afterRoot.split('/');
  parts.pop(); // drop the .md filename itself
  return parts.join('/');
}

/**
 * Resolve an Obsidian-style relative media reference to a production-safe URL:
 * { src, srcset?, sizes? }. Images get responsive "-<width>w.webp" variants when
 * available; anything else (videos, gifs, svgs, ...) falls back to the plain URL.
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

function isVideoUrl(rawUrl) {
  try {
    const filename = normalize(decodeURIComponent(rawUrl)).split(/[?#]/)[0].split('/').pop() || '';
    return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Remark plugin: rewrites Obsidian-style relative image references in the
 * markdown body (![](images/xxx.png)) to /project-images/ URLs with a
 * responsive srcset. Video references (![](images/xxx.mp4)) become native
 * <video controls> elements pointing at the same synced URL.
 */
function remarkObsidianImages() {
  return (tree, file) => {
    const filePath = file.path || '';
    const relativeProjectDir = getRelativeProjectDir(filePath);

    function walk(node) {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'image') {
          const rawUrl = child.url || '';
          const resolved = resolveProjectImageSet(relativeProjectDir, rawUrl);
          if (resolved) {
            if (isVideoUrl(rawUrl)) {
              // Replace the image node entirely — an .mp4 can't be rendered as <img>.
              node.children[i] = {
                type: 'html',
                value: `<video src="${resolved.src}" controls preload="metadata" playsinline></video>`,
              };
              continue;
            }
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
 * `.gallery-slider` raw-HTML block containing resolved <img> tags.
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
                // larger one the instant it becomes visible. A single
                // fixed-size image sidesteps that entirely.
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

export { remarkGalleryPlugin, remarkObsidianImages };

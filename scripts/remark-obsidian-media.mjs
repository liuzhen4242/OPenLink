// @ts-check
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

// Absolute path to the folder scripts/sync-project-images.mjs writes
// resized/compressed images into (populated before `npm run dev` / `npm run build`).
const PUBLIC_IMAGES_ROOT = fileURLToPath(new URL('../public/project-images/', import.meta.url));

const PROJECTS_ROOT_MARKER = 'content/projects/';
const BLOG_ROOT_MARKER = 'content/blog/';

/**
 * 轮播图 <img> 的 sizes 属性。三栏骨架中正文列被 max-w-2xl（672px）封顶，
 * 桌面端（容器 1280px 完整展开时）实际渲染宽 672px，即图片下载目标。
 * 构建期内联，与 BaseLayout 的 --max-w / --pad-x 保持一致。
 */
// Gallery 的画布实际约 672px，但按约 2x 像素密度请求资源，
// 让相册比普通正文图片更清晰，同时仍由浏览器在 800w/1200w/1600w
// 等压缩 WebP 之间自适应选择，而不是直接加载原图。
const GALLERY_SIZES = '(min-width: 1344px) 1200px, calc((100vw - 4rem) * 2)';
const GALLERY_MODES = new Set(['play', 'iphone', 'photo-wall', 'grid', 'archdaily']);
const GALLERY_LIMITS = { iphone: 7, archdaily: 7, grid: 6, 'photo-wall': 7 };
const DEFAULT_PLAY_SECONDS = 1;

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
 * Given the absolute path to a project's .md file, return the article's
 * directory relative to its collection root — e.g. "Xinjiang_Museum" for a
 * project, or the article slug (e.g. "深汕大塘智慧产业园过程记录") for a blog
 * post. Flattened blog posts use their Markdown file name as that key.
 */
function getRelativeProjectDir(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const idx = normalizedPath.indexOf(PROJECTS_ROOT_MARKER);
  if (idx !== -1) {
    const afterRoot = normalizedPath.slice(idx + PROJECTS_ROOT_MARKER.length);
    const parts = afterRoot.split('/');
    parts.pop(); // drop the .md filename itself
    return parts.length > 0 ? parts.join('/') : path.basename(filePath, path.extname(filePath));
  }
  const bidx = normalizedPath.indexOf(BLOG_ROOT_MARKER);
  if (bidx !== -1) {
    const afterRoot = normalizedPath.slice(bidx + BLOG_ROOT_MARKER.length);
    const parts = afterRoot.split('/');
    parts.pop(); // drop the .md filename itself
    // blog/public/<slug>/… or blog/draft/<slug>/… → <slug>.
    // Once public posts are flat, use the Markdown filename as the stable key.
    if (parts[0] === 'public' || parts[0] === 'draft') parts.shift();
    return parts.length > 0 ? parts.join('/') : path.basename(filePath, path.extname(filePath));
  }
  return '';
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeGalleryMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'photowall' ? 'photo-wall' : mode;
}

function parseGalleryBlock(value, language) {
  let title = '';
  let mode = '';
  let seconds = DEFAULT_PLAY_SECONDS;

  for (const line of String(value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    if (/^!\[\]\(.*\)$/.test(line)) continue;

    const speedOnly = line.match(/^s\s*=\s*(\d+(?:\.\d+)?)$/i);
    if (speedOnly) {
      seconds = Number(speedOnly[1]);
      if (!mode) mode = 'play';
      continue;
    }

    const quoted = line.match(/^["'](.*?)["']\s*(?:s\s*=\s*(\d+(?:\.\d+)?))?$/i);
    if (!quoted) continue;

    const candidate = normalizeGalleryMode(quoted[1]);
    if (GALLERY_MODES.has(candidate)) {
      mode = candidate;
      if (candidate === 'play' && quoted[2]) seconds = Number(quoted[2]);
    } else if (!title) {
      title = quoted[1].trim();
    }
  }

  if (!mode) mode = language === 'gallery2' ? 'photo-wall' : 'play';
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = DEFAULT_PLAY_SECONDS;

  return {
    title,
    mode,
    intervalMs: Math.round(Math.min(60, Math.max(0.25, seconds)) * 1000),
  };
}

function galleryImageHtml(img, attributes = '') {
  const srcsetAttr = img.srcset
    ? ` srcset="${img.srcset}" sizes="${GALLERY_SIZES}"`
    : '';
  const dimensionsAttr = img.width && img.height
    ? ` width="${img.width}" height="${img.height}"`
    : '';
  return `<img src="${img.src}"${srcsetAttr}${dimensionsAttr} loading="lazy" decoding="async"${attributes} alt="" />`;
}

/**
 * Read the intrinsic dimensions of a resolved public image URL
 * (e.g. "/project-images/Hainan-TouristStation/images/xxx-2000w.webp")
 * straight off disk so the gallery container can get a fixed
 * aspect-ratio at build time — the browser knows the container
 * geometry before any image finishes loading, so the layout never shifts.
 * Returns { width, height } or null when the file is unreachable /
 * external (http/data URLs) / unreadable. All responsive variants of an
 * image share the same ratio (resize keeps proportions), so reading the
 * src variant is enough.
 */
async function getImageDimensions(publicUrl) {
  if (!publicUrl || publicUrl.startsWith('http') || publicUrl.startsWith('data:')) return null;
  try {
    const relative = normalize(decodeURIComponent(publicUrl)).replace(/^\/project-images\//, '');
    const filePath = path.join(PUBLIC_IMAGES_ROOT, relative);
    if (!existsSync(filePath)) return null;
    const meta = await sharp(filePath, { limitInputPixels: false }).metadata();
    if (!meta.width || !meta.height) return null;
    return { width: meta.width, height: meta.height };
  } catch {
    return null;
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
 * Remark plugin: converts ```gallery and legacy ```gallery2 blocks into one
 * gallery model. `play` renders a slider; the four static modes render a
 * fixed 16:9 composition. Image resolving and metadata parsing are shared.
 *
 * Build-time behaviour:
 * - reads every image's intrinsic dimensions off disk and inlines the
 *   slimmest ratio as `style="aspect-ratio: W / H"` on the container, so
 *   the browser fixes the slider's geometry before any image loads and the
 *   page layout never shifts as slides change;
 * - emits srcset/sizes so each viewport downloads the right variant;
 * - the old display:none + decode-wait switching is replaced by the
 *   stylesheet's stacked opacity cross-fade (see MediaGallery.astro).
 */
function remarkGalleryPlugin() {
  return async (tree, file) => {
    const filePath = file.path || '';
    const relativeProjectDir = getRelativeProjectDir(filePath);

    async function walk(node) {
      if (!node.children) return;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const language = typeof child.lang === 'string'
          ? child.lang.trim().split(/\s+/)[0].toLowerCase()
          : '';

        if (child.type === 'code' && (language === 'gallery' || language === 'gallery2')) {
          const { title, mode, intervalMs } = parseGalleryBlock(child.value, language);
          const matches = [...(child.value || '').matchAll(/!\[\]\((.*?)\)/g)];
          const resolvedImgs = matches
            .map((m) => resolveProjectImageSet(relativeProjectDir, m[1]))
            .filter(Boolean);

          if (resolvedImgs.length > 0) {
            const images = await Promise.all(resolvedImgs.map(async (img) => {
              const dimensions = await getImageDimensions(img.src);
              return { ...img, ...dimensions };
            }));
            const titleHtml = title ? `<div class="gallery-title">${escapeHtml(title)}</div>` : '';
            const titleClass = title ? ' has-title' : '';

            if (mode === 'play') {
              const known = images.filter((img) => img.width > 0 && img.height > 0);
              let styleAttr = '';
              if (known.length === images.length) {
                const slim = known.reduce((a, b) => a.width / a.height < b.width / b.height ? a : b);
                styleAttr = ` style="aspect-ratio: ${slim.width} / ${slim.height}"`;
              }
              const imagesHtml = images.map((img, idx) => galleryImageHtml(
                img,
                ` data-index="${idx}" class="${idx === 0 ? 'is-active' : ''}"`
              )).join('\n');
              node.children[i] = {
                type: 'html',
                value: `<div class="gallery-frame gallery-slider${titleClass}" data-gallery-mode="play" data-interval="${intervalMs}" data-count="${images.length}"${styleAttr}>${titleHtml}\n${imagesHtml}\n</div>`,
              };
            } else {
              const visibleLimit = GALLERY_LIMITS[mode];
              const visibleCount = Math.min(images.length, visibleLimit);
              const hiddenCount = images.length - visibleCount;
              const itemsHtml = images.map((img, idx) => {
                const overflow = idx >= visibleLimit ? ' gallery-overflow' : '';
                const more = idx === visibleCount - 1 && hiddenCount > 0
                  ? `<span class="gallery-more" aria-label="还有 ${hiddenCount} 张照片">+${hiddenCount}</span>`
                  : '';
                return `<figure class="gallery-item${overflow}">${galleryImageHtml(img, ` data-gallery-index="${idx}"`)}${more}</figure>`;
              }).join('\n');
              node.children[i] = {
                type: 'html',
                value: `<section class="gallery-frame gallery-wall gallery-${mode}${titleClass}" data-gallery-mode="${mode}" data-count="${images.length}">${titleHtml}<div class="gallery-canvas">${itemsHtml}</div></section>`,
              };
            }
          } else {
            node.children[i] = {
              type: 'html',
              value: `<p class="gallery-empty">No gallery images</p>`,
            };
          }

          continue;
        }

        await walk(child);
      }
    }

    await walk(tree);
  };
}

export { remarkGalleryPlugin, remarkObsidianImages };

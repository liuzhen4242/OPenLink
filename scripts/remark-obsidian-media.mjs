// @ts-check
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

// Absolute path to the folder scripts/sync-project-images.mjs writes
// resized/compressed images into (populated before `npm run dev` / `npm run build`).
const PUBLIC_IMAGES_ROOT = fileURLToPath(new URL('../public/project-images/', import.meta.url));

const PROJECTS_ROOT_MARKER = 'content/projects/';

/**
 * 轮播图 <img> 的 sizes 属性。三栏骨架中正文列被 max-w-2xl（672px）封顶，
 * 桌面端（容器 1280px 完整展开时）实际渲染宽 672px，即图片下载目标。
 * 构建期内联，与 BaseLayout 的 --max-w / --pad-x 保持一致。
 */
const GALLERY_SIZES = '(min-width: 1344px) 672px, calc(100vw - 4rem)';

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
 * Remark plugin: converts ```gallery fenced code blocks into a
 * `.gallery-slider` raw-HTML block containing resolved <img> tags.
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

        if (child.type === 'code' && child.lang === 'gallery') {
          const matches = [...(child.value || '').matchAll(/!\[\]\((.*?)\)/g)];
          const resolvedImgs = matches
            .map((m) => resolveProjectImageSet(relativeProjectDir, m[1]))
            .filter(Boolean);

          if (resolvedImgs.length > 0) {
            // 构建期定容器比例：取本轮播中宽高比最小（最“瘦”）的图。
            // 只有每张图都能读到尺寸时才内联；外链图等读不到的轮播
            // 由 CSS 默认 aspect-ratio 兜底。
            const dims = await Promise.all(
              resolvedImgs.map((img) => getImageDimensions(img.src))
            );
            const known = dims.filter((d) => d && d.width > 0 && d.height > 0);
            let styleAttr = '';
            if (known.length === resolvedImgs.length) {
              const slim = known.reduce((a, b) =>
                a.width / a.height < b.width / b.height ? a : b
              );
              styleAttr = ` style="aspect-ratio: ${slim.width} / ${slim.height}"`;
            }

            const imgsHtml = resolvedImgs
              .map((img, idx) => {
                const activeClass = idx === 0 ? 'is-active' : '';
                // 容器尺寸已在构建期内联，所有 img 叠放在固定画布内
                // （opacity 切换），浏览器可准确测量渲染宽度，srcset 正常生效。
                const srcsetAttr = img.srcset
                  ? ` srcset="${img.srcset}" sizes="${GALLERY_SIZES}"`
                  : '';
                return `<img src="${img.src}"${srcsetAttr} loading="lazy" decoding="async" data-index="${idx}" class="${activeClass}" alt="" />`;
              })
              .join('\n');

            node.children[i] = {
              type: 'html',
              value: `<div class="gallery-slider" data-count="${resolvedImgs.length}"${styleAttr}>\n${imgsHtml}\n</div>`,
            };
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

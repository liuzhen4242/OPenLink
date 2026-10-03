import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const contentRoot = fileURLToPath(new URL('../src/content/', import.meta.url));
const projectsRoot = path.join(contentRoot, 'projects');
const blogRoot = path.join(contentRoot, 'blog');
const publicRoot = fileURLToPath(new URL('../public/project-images/', import.meta.url));

// Each compressible image gets re-encoded at every one of these widths
// (skipping any that would upscale the source). The browser picks whichever
// one best matches the visitor's actual screen via the <img srcset> it's
// given — phones download the small ones, large monitors get the big ones.
const RESPONSIVE_WIDTHS = [480, 800, 1200, 1600, 2000];
const WEBP_QUALITY = 78;

// How many encode jobs run at once. libvips already uses its own thread pool,
// so a small amount of job-level parallelism keeps cores busy without thrashing.
const CONCURRENCY = 4;

const COMPRESSIBLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.avif']);

// macOS（及部分同步工具）会在真实文件旁生成 AppleDouble 元数据（"._filename"）
// 与 .DS_Store；Windows 会生成 Thumbs.db 缩略图缓存。它们都不是图片：
// 跳过以免污染输出或中断同步。
function isJunk(name) {
  return (
    name.startsWith('._') ||
    name === '.DS_Store' ||
    name === 'Thumbs.db' ||
    name === 'desktop.ini'
  );
}

// sharp refuses to touch images above ~268 million pixels by default, as a
// safety guard against decompression-bomb attacks from untrusted uploads.
// These are our own photos/scans, so it's safe to lift that ceiling.
const SHARP_OPTIONS = { limitInputPixels: false };

let sourceImageCount = 0;
let generatedVariantCount = 0;
let skippedVariantCount = 0;
let passthroughCount = 0;

// Every output file that should exist after this run (relative to publicRoot).
// Collected across all image sets, then used once at the end to remove orphans.
const globalExpected = new Set();

/**
 * Compress/convert every image under imagesSrc into imagesDest.
 * Projects map to public/project-images/<ProjectDir>/images; the blog's
 * shared images folder maps to public/project-images/images (blog articles
 * resolve with an empty relative dir, see getRelativeProjectDir).
 *
 * Incremental: an output that already exists and is newer than its source is
 * left untouched, so a dev restart with no new images finishes in milliseconds.
 * Only missing or stale variants are re-encoded, in parallel.
 */
async function processImageSet(imagesSrc, imagesDest, label) {
  if (!existsSync(imagesSrc)) return;

  mkdirSync(imagesDest, { recursive: true });

  const files = readdirSync(imagesSrc, { withFileTypes: true }).filter(
    (f) => f.isFile() && !isJunk(f.name)
  );

  const jobs = []; // { srcPath, destPath, width }

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const srcPath = path.join(imagesSrc, file.name);
    const srcStat = statSync(srcPath);

    // 0 字节空文件（如 Obsidian 粘贴失败的占位）不是有效媒体：
    // sharp 读不了、复制也白费，跳过以免中断整个同步。
    if (srcStat.size === 0) {
      console.warn(`[sync-project-images] skipping empty file ${file.name}`);
      continue;
    }
    const srcMtime = srcStat.mtimeMs;

    if (!COMPRESSIBLE_EXTENSIONS.has(ext)) {
      // GIF (would lose animation on re-encode), SVG (already tiny), and
      // anything else unrecognized: copy through untouched.
      const destPath = path.join(imagesDest, file.name);
      globalExpected.add(path.relative(publicRoot, destPath));
      if (existsSync(destPath) && statSync(destPath).mtimeMs >= srcMtime) {
        passthroughCount++; // already up to date
      } else {
        cpSync(srcPath, destPath);
        passthroughCount++;
      }
      continue;
    }

    sourceImageCount++;
    const base = file.name.slice(0, -ext.length);

    let originalWidth;
    try {
      const metadata = await sharp(srcPath, SHARP_OPTIONS).metadata();
      originalWidth = metadata.width || RESPONSIVE_WIDTHS[RESPONSIVE_WIDTHS.length - 1];
    } catch (err) {
      console.error(
        `[sync-project-images] failed to read ${file.name}, copying original instead:`,
        err.message
      );
      const destPath = path.join(imagesDest, file.name);
      globalExpected.add(path.relative(publicRoot, destPath));
      try {
        cpSync(srcPath, destPath);
        passthroughCount++;
      } catch (cpErr) {
        console.error(`[sync-project-images] also failed to copy ${file.name}:`, cpErr.message);
      }
      continue;
    }

    // Only generate widths that don't upscale the source image.
    let widthsToGenerate = RESPONSIVE_WIDTHS.filter((w) => w <= originalWidth);
    // If the source is smaller than our smallest configured width (e.g.
    // a small icon), still emit exactly one variant at its native size.
    if (widthsToGenerate.length === 0) {
      widthsToGenerate = [originalWidth];
    }

    for (const width of widthsToGenerate) {
      const destPath = path.join(imagesDest, `${base}-${width}w.webp`);
      globalExpected.add(path.relative(publicRoot, destPath));
      if (existsSync(destPath) && statSync(destPath).mtimeMs >= srcMtime) {
        skippedVariantCount++;
        continue;
      }
      jobs.push({ srcPath, destPath, width });
    }
  }

  // Re-encode everything that is missing or stale, in parallel.
  await runWithConcurrency(jobs, CONCURRENCY, async (job) => {
    try {
      await sharp(job.srcPath, SHARP_OPTIONS)
        .resize({ width: job.width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toFile(job.destPath);
      generatedVariantCount++;
    } catch (err) {
      console.error(
        `[sync-project-images] failed to process ${path.basename(job.srcPath)} (${job.width}w), copying original instead:`,
        err.message
      );
      cpSync(job.srcPath, job.destPath);
      passthroughCount++;
    }
  });

  console.log(`[sync-project-images] ${label} -> public/project-images/`);
}

/** Recursively list all files under dir, as paths relative to dir. */
function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const rel of listFiles(full)) out.push(path.join(entry.name, rel));
    } else {
      out.push(entry.name);
    }
  }
  return out;
}

/** Run async jobs with bounded concurrency. */
async function runWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) return;
  const limit = Math.min(concurrency, items.length);
  async function next() {
    let i;
    while ((i = nextIndex()) !== undefined) {
      await worker(items[i]);
    }
  }
  let cursor = 0;
  const nextIndex = () => (cursor < items.length ? cursor++ : undefined);
  await Promise.all(Array.from({ length: limit }, () => next()));
}

if (!existsSync(publicRoot)) {
  mkdirSync(publicRoot, { recursive: true });
}

const projectDirs = readdirSync(projectsRoot, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith('.')
);

for (const dir of projectDirs) {
  const imagesSrc = path.join(projectsRoot, dir.name, 'images');
  const imagesDest = path.join(publicRoot, dir.name, 'images');
  await processImageSet(imagesSrc, imagesDest, `${dir.name}/images`);
}

// Blog 文章：public/ 与 draft/ 下每个文章目录的 images/ 各自同步
// 到 public/project-images/<文章slug>/images（对应 remark 插件的 slug 解析）。
// 历史共享目录 src/content/blog/images → public/project-images/images 保留兼容。
for (const sub of ['public', 'draft']) {
  const base = path.join(blogRoot, sub);
  if (!existsSync(base)) continue;
  for (const dir of readdirSync(base, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('.')
  )) {
    const imagesSrc = path.join(base, dir.name, 'images');
    const imagesDest = path.join(publicRoot, dir.name, 'images');
    await processImageSet(imagesSrc, imagesDest, `blog/${sub}/${dir.name}/images`);
  }
}
await processImageSet(path.join(blogRoot, 'images'), path.join(publicRoot, 'images'), 'blog/images');

// Remove outputs whose source no longer exists (keeps the build dir tidy).
for (const rel of listFiles(publicRoot)) {
  if (!globalExpected.has(rel)) {
    const orphan = path.join(publicRoot, rel);
    try {
      unlinkSync(orphan);
      console.log(`[sync-project-images] removed orphan ${rel}`);
    } catch (err) {
      // 文件可能正被系统/预览进程占用（Windows Thumbs.db 等），跳过不中断
      console.warn(`[sync-project-images] could not remove orphan ${rel}:`, err.message);
    }
  }
}

console.log(
  `[sync-project-images] done. source images=${sourceImageCount}, generated=${generatedVariantCount}, up-to-date=${skippedVariantCount}, passthrough=${passthroughCount}`
);

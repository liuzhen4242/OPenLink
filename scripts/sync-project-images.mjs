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

// macOS (and some sync tools) drop hidden AppleDouble metadata files
// ("._filename") and .DS_Store next to real files. They are not images:
// skip them so they don't spam warnings or get copied into the output.
function isMacJunk(name) {
  return name.startsWith('._') || name === '.DS_Store';
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
    (f) => f.isFile() && !isMacJunk(f.name)
  );

  const jobs = []; // { srcPath, destPath, width }

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const srcPath = path.join(imagesSrc, file.name);
    const srcMtime = statSync(srcPath).mtimeMs;

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
      cpSync(srcPath, destPath);
      passthroughCount++;
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

// Blog 共享图片目录（src/content/blog/images）→ public/project-images/images
// blog 文章的 getRelativeProjectDir 为空，URL 为 /project-images/images/xxx
await processImageSet(path.join(blogRoot, 'images'), path.join(publicRoot, 'images'), 'blog/images');

// Remove outputs whose source no longer exists (keeps the build dir tidy).
for (const rel of listFiles(publicRoot)) {
  if (!globalExpected.has(rel)) {
    const orphan = path.join(publicRoot, rel);
    unlinkSync(orphan);
    console.log(`[sync-project-images] removed orphan ${rel}`);
  }
}

console.log(
  `[sync-project-images] done. source images=${sourceImageCount}, generated=${generatedVariantCount}, up-to-date=${skippedVariantCount}, passthrough=${passthroughCount}`
);

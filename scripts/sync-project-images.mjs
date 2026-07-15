import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const projectsRoot = fileURLToPath(new URL('../src/content/projects/', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public/project-images/', import.meta.url));

// Each compressible image gets re-encoded at every one of these widths
// (skipping any that would upscale the source). The browser picks whichever
// one best matches the visitor's actual screen via the <img srcset> it's
// given — phones download the small ones, large monitors get the big ones.
const RESPONSIVE_WIDTHS = [480, 800, 1200, 1600, 2000];
const WEBP_QUALITY = 78;

const COMPRESSIBLE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.avif']);

// sharp refuses to touch images above ~268 million pixels by default, as a
// safety guard against decompression-bomb attacks from untrusted uploads.
// These are our own photos/scans, so it's safe to lift that ceiling.
const SHARP_OPTIONS = { limitInputPixels: false };

if (existsSync(publicRoot)) {
  rmSync(publicRoot, { recursive: true, force: true });
}
mkdirSync(publicRoot, { recursive: true });

const projectDirs = readdirSync(projectsRoot, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith('.')
);

let sourceImageCount = 0;
let variantCount = 0;
let passthroughCount = 0;

for (const dir of projectDirs) {
  const imagesSrc = path.join(projectsRoot, dir.name, 'images');
  if (!existsSync(imagesSrc)) continue;

  const imagesDest = path.join(publicRoot, dir.name, 'images');
  mkdirSync(imagesDest, { recursive: true });

  const files = readdirSync(imagesSrc, { withFileTypes: true }).filter((f) => f.isFile());

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase();
    const srcPath = path.join(imagesSrc, file.name);

    if (!COMPRESSIBLE_EXTENSIONS.has(ext)) {
      // GIF (would lose animation on re-encode), SVG (already tiny), and
      // anything else unrecognized: copy through untouched.
      cpSync(srcPath, path.join(imagesDest, file.name));
      passthroughCount++;
      continue;
    }

    sourceImageCount++;
    const base = file.name.slice(0, -ext.length);

    try {
      const metadata = await sharp(srcPath, SHARP_OPTIONS).metadata();
      const originalWidth = metadata.width || RESPONSIVE_WIDTHS[RESPONSIVE_WIDTHS.length - 1];

      // Only generate widths that don't upscale the source image.
      let widthsToGenerate = RESPONSIVE_WIDTHS.filter((w) => w <= originalWidth);
      // If the source is smaller than our smallest configured width (e.g.
      // a small icon), still emit exactly one variant at its native size.
      if (widthsToGenerate.length === 0) {
        widthsToGenerate = [originalWidth];
      }

      for (const width of widthsToGenerate) {
        const destPath = path.join(imagesDest, `${base}-${width}w.webp`);
        await sharp(srcPath, SHARP_OPTIONS)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toFile(destPath);
        variantCount++;
      }
    } catch (err) {
      console.error(
        `[sync-project-images] failed to process ${file.name}, copying original instead:`,
        err.message
      );
      cpSync(srcPath, path.join(imagesDest, file.name));
      passthroughCount++;
    }
  }

  console.log(`[sync-project-images] ${dir.name}/images -> public/project-images/${dir.name}/images`);
}

console.log(
  `[sync-project-images] done. source images=${sourceImageCount}, responsive variants generated=${variantCount}, passthrough=${passthroughCount}`
);

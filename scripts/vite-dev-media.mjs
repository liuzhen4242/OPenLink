// @ts-check
import { createReadStream, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PUBLIC_IMAGES_ROOT = fileURLToPath(new URL('../public/project-images/', import.meta.url));
const CONTENT_ROOT = fileURLToPath(new URL('../src/content/', import.meta.url));

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
};

function normalize(str) {
  return str.normalize('NFC');
}

/**
 * Dev-only fallback for /project-images/* requests. The media sync script
 * only runs at `npm run dev`/`npm run build` startup, so a file added to a
 * source folder afterwards would 404 until a restart. Instead of making dev
 * watch folders (unreliable with sync tools), serve the ORIGINAL source file
 * straight from src/content when it hasn't been copied to public yet.
 * Production builds are unaffected: they still ship the synced set.
 */
function devSourceMediaFallbackPlugin() {
  return {
    name: 'openlink-dev-source-media',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/project-images/')) return next();

        const after = url.slice('/project-images/'.length).split('?')[0];
        const decodedAfter = normalize(decodeURIComponent(after));
        const publicFile = path.join(PUBLIC_IMAGES_ROOT, decodedAfter);
        if (existsSync(publicFile)) return next();

        const slashIdx = decodedAfter.lastIndexOf('/');
        if (slashIdx === -1) return next();
        const dirPart = decodedAfter.slice(0, slashIdx);
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

export { devSourceMediaFallbackPlugin };

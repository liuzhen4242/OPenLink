#!/usr/bin/env node
'use strict';
// The custom Markdown image renderers depend on attachment files, while Astro's
// content digest only includes Markdown text. Invalidate rendered content when
// images change even if their filenames and article text are unchanged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const attachment = path.join(root, 'src/content/attachment');
const cacheDir = path.join(root, '.astro');
const marker = path.join(cacheDir, 'image-library-cache.json');
const rows = [];
function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const full = path.join(directory, item.name);
    if (item.isDirectory()) walk(full);
    else if (item.isFile() && /\.(jpe?g|png|webp|avif|heic|heif|tiff?|gif|svg)$/i.test(item.name)) {
      const stat = fs.statSync(full);
      rows.push([path.relative(attachment, full).split(path.sep).join('/'), stat.size, stat.mtimeMs]);
    }
  }
}
walk(attachment);
rows.sort((a, b) => a[0].localeCompare(b[0]));
const fingerprint = 'v2:' + crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const previous = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : '';
if (previous !== fingerprint) {
  // Astro 7 stores this in cacheDir (node_modules/.astro by default). Also clear
  // the old location left behind by earlier Astro versions.
  for (const store of [path.join(cacheDir, 'data-store.json'), path.join(root, 'node_modules/.astro/data-store.json')]) {
    if (fs.existsSync(store)) fs.unlinkSync(store);
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(marker, fingerprint);
  console.log('[image-library] Refreshed Markdown image cache after attachment changes.');
}

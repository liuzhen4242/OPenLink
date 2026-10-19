// One-time cleanup after detaching attachments from article folders.
// Move blog/public/<folder>/<note>.md to blog/public/<note>.md and keep all
// attachment links valid from their new, shallower location.
import { existsSync, readdirSync, renameSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const publicRoot = fileURLToPath(new URL('../src/content/blog/public/', import.meta.url));

for (const entry of readdirSync(publicRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const articleDir = path.join(publicRoot, entry.name);
  const notes = readdirSync(articleDir, { withFileTypes: true }).filter((item) => item.isFile() && /\.md$/i.test(item.name));
  if (notes.length !== 1) {
    console.warn(`[flatten-blog-public] skipped ${entry.name}: expected one Markdown file, found ${notes.length}`);
    continue;
  }
  const source = path.join(articleDir, notes[0].name);
  const destination = path.join(publicRoot, notes[0].name);
  if (existsSync(destination)) throw new Error(`Refusing to overwrite existing article: ${destination}`);

  const body = readFileSync(source, 'utf8');
  // article dir was blog/public/<folder>; after flattening it is blog/public.
  const updated = body.replace(/\.\.\/\.\.\/attachment\//g, '../../attachment/');
  if (updated !== body) writeFileSync(source, updated);
  renameSync(source, destination);
  // The directory is expected to be empty: attachments were migrated earlier.
  if (readdirSync(articleDir).length === 0) {
    // `renameSync` only moved the note, so remove the now-empty folder.
    // rmdir is deliberately not recursive.
    const { rmdirSync } = await import('node:fs');
    rmdirSync(articleDir);
  }
}

console.log('Flattened public blog articles.');

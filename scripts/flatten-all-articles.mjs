// Flatten project and secondary blog article files after detaching attachments.
import { existsSync, readdirSync, renameSync, readFileSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const contentRoot = fileURLToPath(new URL('../src/content/', import.meta.url));
const roots = [path.join(contentRoot, 'projects'), path.join(contentRoot, 'blog', 'private'), path.join(contentRoot, 'blog', 'softDevelop')];

for (const root of roots) {
  if (!existsSync(root)) continue;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const folder = path.join(root, entry.name);
    const notes = readdirSync(folder, { withFileTypes: true }).filter((item) => item.isFile() && /\.md$/i.test(item.name));
    if (notes.length === 0) {
      const leftovers = readdirSync(folder).filter((name) => !name.startsWith('.'));
      if (leftovers.length > 0) continue;
      for (const hidden of readdirSync(folder)) rmSync(path.join(folder, hidden), { recursive: true, force: true });
      rmdirSync(folder);
      continue;
    }
    if (notes.length !== 1) throw new Error(`Expected one Markdown file in ${folder}, found ${notes.length}`);
    const source = path.join(folder, notes[0].name);
    const destination = path.join(root, notes[0].name);
    if (existsSync(destination)) throw new Error(`Refusing to overwrite existing article: ${destination}`);
    const body = readFileSync(source, 'utf8');
    const updated = body.replace(/\.\.\/\.\.\/attachment\//g, '../attachment/');
    if (updated !== body) writeFileSync(source, updated);
    renameSync(source, destination);
    const leftovers = readdirSync(folder).filter((name) => !name.startsWith('.'));
    if (leftovers.length > 0) throw new Error(`Unexpected files remain in ${folder}: ${leftovers.join(', ')}`);
    for (const hidden of readdirSync(folder)) rmSync(path.join(folder, hidden), { recursive: true, force: true });
    rmdirSync(folder);
  }
}
console.log('Flattened project and secondary blog article files.');

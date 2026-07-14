import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// scripts/sync-project-images.mjs is expected to live at <repo>/scripts/
const projectsRoot = fileURLToPath(new URL('../src/content/projects/', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public/project-images/', import.meta.url));

// Start fresh each run so renamed/deleted images in the vault don't linger
// forever inside public/ as stale leftovers.
if (existsSync(publicRoot)) {
  rmSync(publicRoot, { recursive: true, force: true });
}
mkdirSync(publicRoot, { recursive: true });

const projectDirs = readdirSync(projectsRoot, { withFileTypes: true }).filter(
  (entry) => entry.isDirectory() && !entry.name.startsWith('.')
);

let copiedCount = 0;

for (const dir of projectDirs) {
  const imagesSrc = path.join(projectsRoot, dir.name, 'images');
  if (!existsSync(imagesSrc)) continue;

  const imagesDest = path.join(publicRoot, dir.name, 'images');
  cpSync(imagesSrc, imagesDest, { recursive: true });
  copiedCount++;
  console.log(`[sync-project-images] ${dir.name}/images -> public/project-images/${dir.name}/images`);
}

console.log(`[sync-project-images] done, ${copiedCount} project(s) synced.`);

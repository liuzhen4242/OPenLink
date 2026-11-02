import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'src/content/.obsidian/plugins/gallery-preview');
await mkdir(output, { recursive: true });
await build({ entryPoints: [path.join(root, 'plugins/gallery-preview/main.cjs')], outfile: path.join(output, 'main.js'), bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'] });
const css = await readFile(path.join(root, 'src/styles/gallery.css'), 'utf8');
const scoped = css.replace(/(^|\n)(\s*)([^@{}\n][^{}]*?)\s*\{/g, (_, newline, space, selectors) => newline + space + selectors.split(',').map(s => s.trim().startsWith('.dark ') ? '.theme-dark .gallery-preview ' + s.trim().slice(6) : '.gallery-preview ' + s.trim()).join(', ') + ' {');
const photoswipe = (await readFile(path.join(root, 'node_modules/photoswipe/dist/photoswipe.css'), 'utf8')).replace(/\.pswp(?=[\s.{:#>\[])/g, '.pswp.gallery-preview-lightbox');
await writeFile(path.join(output, 'styles.css'), scoped + '\n.gallery-preview .gallery-frame { margin: .75rem 0; }\n.theme-dark .gallery-preview .gallery-frame { background: #111; }\n.gallery-preview img { box-shadow: none; transition: none; }\n.pswp.gallery-preview-lightbox { z-index: 10000; }\n' + photoswipe);
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ id: 'gallery-preview', name: 'Gallery Preview', version: '1.0.0', minAppVersion: '1.5.0', description: 'Preview gallery blocks with shared website layouts and PhotoSwipe.', author: 'OpenLink', isDesktopOnly: true }, null, 2) + '\n');
console.log('Gallery Preview built:', output);

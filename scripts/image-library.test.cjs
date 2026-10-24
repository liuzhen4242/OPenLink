'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { processImage, run, rewriteLinks, digest } = require('./image-library.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'image-library-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src/content/attachment/文章'), { recursive: true });
  await fs.mkdir(path.join(root, '.git'));
  return root;
}

test('JPEG archives exact bytes, keeps links/filename, caps long edge, and is idempotent', async (t) => {
  const root = await fixture(t);
  const relative = 'attachment/文章/照片.jpg';
  const full = path.join(root, 'src/content', relative);
  const original = await sharp({ create: { width: 3600, height: 1800, channels: 3, background: '#48a8c0' } }).jpeg({ quality: 100 }).toBuffer();
  await fs.writeFile(full, original);
  const preview = await processImage(root, relative);
  assert.equal(preview.status, 'compressed');
  assert.deepEqual(await fs.readFile(full), original);
  assert.equal(await fs.stat(path.join(root, 'src/content/_originals')).catch(() => null), null);
  const first = await processImage(root, relative, true);
  assert.equal(first.output, relative);
  assert.deepEqual(await fs.readFile(path.join(root, 'src/content', first.original)), original);
  const compressed = await fs.readFile(full);
  assert.ok(compressed.length < original.length);
  const metadata = await sharp(compressed).metadata();
  assert.equal(metadata.width, 2560);
  assert.equal(metadata.height, 1280);
  assert.equal((await processImage(root, relative, true)).status, 'already-processed');
  assert.deepEqual(await fs.readFile(full), compressed);
  // Replacing a photo with a new original must preserve the first archive too.
  const replacement = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: '#f0a030' } }).jpeg({ quality: 100 }).toBuffer();
  await fs.writeFile(full, replacement);
  const second = await processImage(root, relative, true);
  assert.notEqual(first.original, second.original);
  assert.deepEqual(await fs.readFile(path.join(root, 'src/content', first.original)), original);
  assert.deepEqual(await fs.readFile(path.join(root, 'src/content', second.original)), replacement);
});

test('transparent PNG stays PNG and retains alpha; tiny GIF and SVG are untouched', async (t) => {
  const root = await fixture(t);
  const relative = 'attachment/文章/透明.png';
  const full = path.join(root, 'src/content', relative);
  await fs.writeFile(full, await sharp({ create: { width: 3000, height: 1600, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } } }).png({ compressionLevel: 0 }).toBuffer());
  const result = await processImage(root, relative, true);
  const metadata = await sharp(full).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.hasAlpha, true);
  assert.ok(result.after < result.before);
  for (const [filename, input] of [
    ['动画.gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')],
    ['矢量.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')],
  ]) {
    const name = 'attachment/文章/' + filename;
    await fs.writeFile(path.join(root, 'src/content', name), input);
    const item = await processImage(root, name, true);
    assert.equal(item.before, item.after);
    assert.deepEqual(await fs.readFile(path.join(root, 'src/content', name)), input);
  }
});

test('archive failure cannot overwrite the source', async (t) => {
  const root = await fixture(t);
  const relative = 'attachment/文章/照片.jpg';
  const original = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: 'blue' } }).jpeg().toBuffer();
  const full = path.join(root, 'src/content', relative);
  await fs.writeFile(full, original);
  await fs.writeFile(path.join(root, 'src/content/_originals'), 'occupied');
  await assert.rejects(processImage(root, relative, true));
  assert.deepEqual(await fs.readFile(full), original);
});

test('an empty paste placeholder is left unchanged and can be retried after data arrives', async (t) => {
  const root = await fixture(t);
  const relative = 'attachment/文章/占位.png';
  await fs.writeFile(path.join(root, 'src/content', relative), '');
  assert.equal((await processImage(root, relative, true)).status, 'empty-skipped');
  assert.equal((await fs.stat(path.join(root, 'src/content', relative))).size, 0);
});

test('TIFF conversion updates actual references, including gallery and cover, retaining prose/examples', async (t) => {
  const root = await fixture(t);
  const relative = 'attachment/文章/照片 1.tif';
  const full = path.join(root, 'src/content', relative);
  const input = await sharp({ create: { width: 400, height: 200, channels: 3, background: 'red' } }).tiff().toBuffer();
  await fs.writeFile(full, input);
  await fs.mkdir(path.join(root, 'src/content/blog'));
  const note = path.join(root, 'src/content/blog/文章.md');
  await fs.writeFile(note, '---\ncoverImage: "../attachment/文章/照片 1.tif"\n---\n![[照片 1.tif|300]]\n![](../attachment/文章/照片%201.tif)\n```gallery\n../attachment/文章/照片 1.tif\n```\n```markdown\n![[照片 1.tif]]\n```\n');
  const item = await processImage(root, relative, true);
  assert.equal(item.output, relative + '.webp');
  const text = await fs.readFile(note, 'utf8');
  assert.ok(text.includes('coverImage: "../attachment/文章/照片 1.tif.webp"'));
  assert.ok(text.includes('![[照片 1.tif.webp|300]]'));
  assert.ok(text.includes('%E7%85%A7%E7%89%87%201.tif.webp'));
  assert.ok(text.includes('```gallery\n../attachment/文章/照片 1.tif.webp'));
  assert.ok(text.includes('```markdown\n![[照片 1.tif]]'));
  assert.equal(await fs.stat(full).catch(() => null), null);
  assert.deepEqual(await fs.readFile(path.join(root, 'src/content', item.original)), input);
  assert.equal((await processImage(root, item.output, true)).status, 'already-processed');
});

test('conversion never overwrites an unrelated destination or deletes the original', async (t) => {
  const root = await fixture(t);
  const relative = 'attachment/文章/照片.tif';
  const full = path.join(root, 'src/content', relative);
  const input = await sharp({ create: { width: 40, height: 20, channels: 3, background: 'red' } }).tiff().toBuffer();
  await fs.writeFile(full, input);
  await fs.writeFile(full + '.webp', 'do not overwrite');
  await assert.rejects(processImage(root, relative, true), /occupied/);
  assert.equal(await fs.readFile(full + '.webp', 'utf8'), 'do not overwrite');
  assert.deepEqual(await fs.readFile(full), input);
});

test('same basename in another article is not rewritten, URI suffixes and HTML survive', () => {
  const from = 'attachment/文章/IMG.heic';
  const to = from + '.webp';
  assert.equal(rewriteLinks('![[IMG.heic]]', 'blog/别的文章.md', from, to, false), '![[IMG.heic]]');
  const text = '![](../attachment/文章/IMG.heic#detail "caption")\n<img src="../attachment/文章/IMG.heic">';
  const result = rewriteLinks(text, 'blog/文章.md', from, to);
  assert.ok(result.includes('IMG.heic.webp#detail "caption"'));
  assert.ok(result.includes('src="../attachment/文章/IMG.heic.webp"'));
});

test('batch lock prevents overlapping writes and is released even on per-file errors', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, '.git/image-library.lock'), 'another task');
  await assert.rejects(run(root, ['attachment/文章/missing.jpg'], true), /Another image-library/);
  await fs.unlink(path.join(root, '.git/image-library.lock'));
  const results = await run(root, ['attachment/文章/missing.jpg'], true);
  assert.equal(results[0].status, 'error');
  assert.equal(await fs.stat(path.join(root, '.git/image-library.lock')).catch(() => null), null);
  await assert.rejects(processImage(root, 'attachment/../outside.jpg', true));
  assert.equal(digest('same'), digest('same'));
});

test('Obsidian auto processing recognizes local paste/drop bytes and ignores NAS arrivals', async () => {
  class TFile { constructor(name) { this.path = name; } }
  class Plugin {
    async loadData() { return {}; }
    addSettingTab() {}
    addCommand() {}
    registerEvent() {}
  }
  const module = { exports: {} };
  const source = await fs.readFile(path.join(__dirname, '../src/content/.obsidian/plugins/local-image-library/main.js'), 'utf8');
  vm.runInNewContext(source, {
    module, Buffer, process, console, setTimeout, clearTimeout,
    require: (name) => name === 'obsidian' ? { Plugin, TFile, PluginSettingTab: class {}, Setting: class {}, Notice: class {} } : require(name),
  });
  const plugin = new module.exports();
  const image = new TFile('attachment/文章/local.jpg');
  const remote = new TFile('attachment/文章/remote.jpg');
  const data = new Map([[image.path, Buffer.from('local original bytes')], [remote.path, Buffer.from('NAS compressed bytes')]]);
  let ready;
  const listeners = [];
  plugin.app = {
    workspace: {
      onLayoutReady(callback) { ready = callback; },
      on(name) { listeners.push(name); },
    },
    vault: {
      on(name) { listeners.push(name); },
      getAbstractFileByPath(name) { return name === image.path ? image : remote; },
      async readBinary(file) { return data.get(file.path); },
    },
  };
  await plugin.onload();
  assert.equal(listeners.length, 0, 'vault startup must not bulk-process attachments');
  ready();
  assert.ok(listeners.includes('editor-paste'));
  assert.ok(listeners.includes('editor-drop'));
  let calls = 0;
  plugin.execute = async () => { calls++; return []; };
  plugin.enqueue(remote.path, true);
  await plugin.queue;
  assert.equal(calls, 0);
  await plugin.captureImport({ clipboardData: { files: [{ name: 'image.jpg', type: 'image/jpeg', async arrayBuffer() { return data.get(image.path); } }] } });
  plugin.enqueue(image.path, true);
  plugin.enqueue(remote.path, true);
  await plugin.queue;
  assert.equal(calls, 1, 'only locally imported bytes trigger the worker');
  data.set(image.path, Buffer.from('compressed output bytes'));
  plugin.enqueue(image.path, true);
  await plugin.queue;
  assert.equal(calls, 1, 'own compressed output must not be encoded again');
  plugin.enqueue();
  await plugin.queue;
  assert.equal(calls, 2, 'manual migration remains available');
  plugin.onunload();
});

test('image cache refreshes on same-name image changes/deletion and stays cached otherwise', async (t) => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'scripts'));
  const script = path.join(root, 'scripts/invalidate-image-cache.cjs');
  await fs.copyFile(path.join(__dirname, 'invalidate-image-cache.cjs'), script);
  const image = path.join(root, 'src/content/attachment/文章/image.jpg');
  const store = path.join(root, '.astro/data-store.json');
  const astro7Store = path.join(root, 'node_modules/.astro/data-store.json');
  await fs.mkdir(path.dirname(astro7Store), { recursive: true });
  await fs.writeFile(astro7Store, 'Astro 7 cached content');
  await fs.writeFile(image, 'initial image bytes');
  const refresh = () => execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(refresh(), /Refreshed/);
  assert.equal(await fs.stat(astro7Store).catch(() => null), null);
  await fs.writeFile(store, 'cached content');
  await fs.writeFile(astro7Store, 'Astro 7 cached content');
  assert.equal(refresh(), '');
  assert.equal(await fs.readFile(store, 'utf8'), 'cached content');
  assert.equal(await fs.readFile(astro7Store, 'utf8'), 'Astro 7 cached content');
  await fs.writeFile(image, 'replacement image with different size');
  assert.match(refresh(), /Refreshed/);
  assert.equal(await fs.stat(store).catch(() => null), null);
  assert.equal(await fs.stat(astro7Store).catch(() => null), null);
  await fs.writeFile(store, 'cached content');
  await fs.unlink(image);
  assert.match(refresh(), /Refreshed/);
  assert.equal(await fs.stat(store).catch(() => null), null);
});

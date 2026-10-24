#!/usr/bin/env node
'use strict';

// This runs in system Node, never in Obsidian's Electron native-module runtime.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const VERSION = 1;
const POLICY = 'long-edge-2560-jpeg85-webp85-png-lossless-v1';
const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.heic', '.heif', '.tif', '.tiff', '.gif', '.svg']);
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const slash = (name) => name.split(path.sep).join('/');
const exists = async (name) => !!(await fs.stat(name).catch(() => null));

async function atomicWrite(name, data) {
  await fs.mkdir(path.dirname(name), { recursive: true });
  const temp = `${name}.${crypto.randomUUID()}.image-tmp`;
  try {
    await fs.writeFile(temp, data, { flag: 'wx' });
    await fs.rename(temp, name);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith('.') || entry.name === '_originals') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}

function safeImagePath(relative) {
  const clean = relative.replaceAll('\\', '/');
  if (!clean.startsWith('attachment/') || clean.split('/').some((part) => part === '..' || part.startsWith('.'))) {
    throw new Error(`Only ordinary files under attachment/ can be processed: ${relative}`);
  }
  return clean;
}

// Change actual image destinations, not arbitrary prose or code examples. Covers
// Markdown, wikilinks, frontmatter, HTML and the sites' gallery code blocks.
function rewriteLinks(text, note, from, to, uniqueBasename = false) {
  const noteDir = path.posix.dirname(note);
  const basename = path.posix.basename(from);
  function destination(raw) {
    let decoded;
    try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }
    const suffix = decoded.match(/[?#].*$/)?.[0] || '';
    const clean = decoded.slice(0, decoded.length - suffix.length || undefined);
    const candidates = [path.posix.normalize(path.posix.join(noteDir, clean)), path.posix.normalize(clean)];
    if (!clean.includes('/') && path.posix.basename(note, '.md') === path.posix.basename(path.posix.dirname(from))) candidates.push(from);
    if (uniqueBasename && clean === basename) candidates.push(from);
    if (!candidates.includes(from)) return raw;
    let result;
    if (clean === basename) result = path.posix.basename(to);
    else if (path.posix.normalize(clean) === from) result = to;
    else {
      result = path.posix.relative(noteDir, to);
      if (clean.startsWith('./') && !result.startsWith('.')) result = './' + result;
    }
    if (/%[\da-f]{2}/i.test(raw)) result = result.split('/').map(encodeURIComponent).join('/');
    return result + suffix;
  }
  function markdownDestination(raw) {
    if (raw.startsWith('<')) return raw.replace(/^<([^>]+)>/, (_, dest) => `<${destination(dest)}>`);
    const direct = destination(raw);
    if (direct !== raw) return direct;
    return raw.replace(/^(.*?)(\s+["'][^\n]*["'])$/, (_, dest, title) => destination(dest) + title);
  }
  let fence = '';
  let gallery = false;
  let frontmatter = false;
  return text.split('\n').map((line, index) => {
    if (index === 0 && line.trim() === '---') { frontmatter = true; return line; }
    if (frontmatter && line.trim() === '---') { frontmatter = false; return line; }
    const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (match) {
      if (!fence) { fence = match[1][0]; gallery = /^(gallery|gallery2|photo-wall)\b/i.test(match[2].trim()); }
      else if (match[1][0] === fence) { fence = ''; gallery = false; }
      return line;
    }
    if (fence && !gallery) return line;
    let result = line.replace(/(!?\[\[)([^\]\n]+)(\]\])/g, (_, open, value, close) => {
      const split = value.indexOf('|');
      return open + destination(split < 0 ? value : value.slice(0, split)) + (split < 0 ? '' : value.slice(split)) + close;
    }).replace(/(!?\[[^\]\n]*\]\(\s*)(<[^>\n]+>|[^)\n]*?)(\s*\))/g, (_, open, dest, close) => open + markdownDestination(dest) + close)
      .replace(/\b(src|href)=(['"])(.*?)\2/g, (_, key, quote, dest) => `${key}=${quote}${destination(dest)}${quote}`);
    if (frontmatter) result = result.replace(/^(\s*(?:coverImage|coverMedia|image|cover):\s*)(.*?)(\r?)$/, (_, prefix, value, cr) => {
      const quote = value.match(/^(['"])(.*)\1$/);
      return prefix + (quote ? quote[1] + destination(quote[2]) + quote[1] : destination(value)) + cr;
    });
    if (gallery && result === line) {
      result = line.replace(/^(\s*)(.*?)(\s*)$/, (_, start, value, end) => start + destination(value) + end);
    }
    return result;
  }).join('\n');
}

async function archiveOriginal(content, relative, input, inputHash) {
  const parsed = path.posix.parse(relative);
  const archive = `_originals/${parsed.dir}/${parsed.name}.${inputHash.slice(0, 16)}${parsed.ext}`;
  const full = path.join(content, archive);
  await fs.mkdir(path.dirname(full), { recursive: true });
  try { await fs.writeFile(full, input, { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (digest(await fs.readFile(full)) !== inputHash) throw new Error(`Original archive failed verification: ${archive}`);
  return archive;
}

async function processImage(root, relative, apply = false) {
  relative = safeImagePath(relative);
  const content = path.join(root, 'src/content');
  const full = path.join(content, relative);
  const extension = path.posix.extname(relative).toLowerCase();
  if (!EXTENSIONS.has(extension)) return { file: relative, status: 'unsupported' };
  // Do not follow a symlink outside the attachment tree.
  const real = await fs.realpath(full);
  const realContent = await fs.realpath(content);
  if (!real.startsWith(realContent + path.sep)) throw new Error('Image resolves outside the content directory');
  const input = await fs.readFile(full);
  if (!input.length) return { file: relative, status: 'empty-skipped', before: 0, after: 0 };
  const inputHash = digest(input);
  const recordPath = (name) => path.join(content, '.image-library', digest(name) + '.json');
  const record = await fs.readFile(recordPath(relative), 'utf8').then(JSON.parse).catch(() => null);
  if (record?.policy === POLICY && record.outputHash === inputHash) return { file: relative, status: 'already-processed' };

  let output = input;
  let outputRelative = relative;
  let reason = 'kept';
  if (extension !== '.gif' && extension !== '.svg') {
    const inputData = ['.heic', '.heif'].includes(extension)
      ? await require('heic-convert')({ buffer: input, format: 'JPEG', quality: 1 })
      : input;
    const metadata = await sharp(inputData, { limitInputPixels: false }).metadata();
    if ((metadata.pages || 1) === 1) {
      let pipeline = sharp(inputData, { limitInputPixels: false }).rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true });
      if (extension === '.jpg' || extension === '.jpeg') pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
      else if (extension === '.png') pipeline = pipeline.png({ compressionLevel: 9 }); // Preserve alpha and text; no palette quantization.
      else if (extension === '.avif') pipeline = pipeline.avif({ quality: 65 });
      else pipeline = pipeline.webp({ quality: 85, effort: 4 });
      const candidate = await pipeline.toBuffer();
      const converts = ['.heic', '.heif', '.tif', '.tiff'].includes(extension);
      if (converts || candidate.length < input.length) {
        output = candidate;
        if (converts) outputRelative = relative + '.webp'; // Never collide with an existing photo.webp.
        reason = 'compressed';
      }
    } else reason = 'animation-kept';
  }
  const outputHash = digest(output);
  const result = { file: relative, output: outputRelative, status: reason, before: input.length, after: output.length };
  if (!apply) return result;

  const archive = await archiveOriginal(content, relative, input, inputHash);
  // A NAS update or editor write during encoding must never be overwritten.
  if (digest(await fs.readFile(full)) !== inputHash) throw new Error(`Image changed during compression; original retained, retry later: ${relative}`);
  const outputFull = path.join(content, outputRelative);
  if (outputRelative !== relative) {
    if (await exists(outputFull)) {
      if (digest(await fs.readFile(outputFull)) !== outputHash) throw new Error(`Output name is occupied; no files overwritten: ${outputRelative}`);
    } else await fs.writeFile(outputFull, output, { flag: 'wx' });
    const attachmentFiles = await walk(path.join(content, 'attachment'));
    const unique = attachmentFiles.filter((name) => path.basename(name) === path.posix.basename(relative)).length === 1;
    for (const noteFull of (await walk(content)).filter((name) => name.endsWith('.md'))) {
      const before = await fs.readFile(noteFull, 'utf8');
      const after = rewriteLinks(before, slash(path.relative(content, noteFull)), relative, outputRelative, unique);
      if (after !== before) {
        if (await fs.readFile(noteFull, 'utf8') !== before) throw new Error(`Note changed during link update; both images retained: ${noteFull}`);
        await atomicWrite(noteFull, after);
      }
    }
  }

  const receipt = { version: VERSION, policy: POLICY, file: outputRelative, source: relative, original: archive, originalHash: inputHash, outputHash, before: input.length, after: output.length };
  // Save the intended output hash first. A crash after replacing the image can
  // then never cause another lossy encode on the next run. If replacement has
  // not happened yet, the hash will not match and the original is retried.
  await atomicWrite(recordPath(outputRelative), JSON.stringify(receipt, null, 2) + '\n');
  if (outputRelative === relative && outputHash !== inputHash) {
    if (digest(await fs.readFile(full)) !== inputHash) throw new Error('Source changed before replacement; retry later');
    await atomicWrite(full, output);
  }
  if (outputRelative !== relative) {
    if (digest(await fs.readFile(full)) !== inputHash) throw new Error('Source changed during link migration; both files retained');
    await fs.unlink(full); // The verified original remains in _originals.
  }
  return { ...result, original: archive };
}

async function run(root, files, apply) {
  const content = path.join(root, 'src/content');
  let lock;
  let lockPath;
  if (apply) {
    let gitDir = path.join(root, '.git');
    if ((await fs.stat(gitDir)).isFile()) gitDir = path.resolve(root, (await fs.readFile(gitDir, 'utf8')).trim().replace(/^gitdir:\s*/, ''));
    lockPath = path.join(gitDir, 'image-library.lock');
    try { lock = await fs.open(lockPath, 'wx'); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Another image-library task is running. If it crashed, remove .git/image-library.lock before retrying.'); throw error; }
    await lock.writeFile(String(process.pid));
  }
  try {
    const selected = files?.length ? files : (await walk(path.join(content, 'attachment'))).map((name) => slash(path.relative(content, name))).filter((name) => EXTENSIONS.has(path.extname(name).toLowerCase()));
    const results = [];
    for (const file of selected) {
      try { results.push(await processImage(root, file, apply)); }
      catch (error) { results.push({ file, status: 'error', error: error.message }); }
    }
    return results;
  } finally {
    if (lock) { await lock.close(); await fs.unlink(lockPath); }
  }
}

module.exports = { processImage, run, rewriteLinks, digest };
if (require.main === module) {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf('--file');
  const root = path.resolve(__dirname, '..');
  run(root, fileIndex < 0 ? null : [args[fileIndex + 1]], args.includes('--apply')).then((results) => {
    if (args.includes('--json')) console.log(JSON.stringify(results));
    else {
      const before = results.reduce((sum, item) => sum + (item.before || 0), 0);
      const after = results.reduce((sum, item) => sum + (item.after || 0), 0);
      console.log(`${args.includes('--apply') ? 'Processed' : 'Preview only'}: ${results.length} images, ${(before / 1048576).toFixed(1)} → ${(after / 1048576).toFixed(1)} MiB`);
      for (const item of results.filter((item) => item.status === 'error')) console.error(`${item.file}: ${item.error}`);
    }
    if (results.some((item) => item.status === 'error')) process.exitCode = 1;
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

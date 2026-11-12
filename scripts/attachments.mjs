#!/usr/bin/env node
// Attachment ingestion, read-only validation, and explicit root-file repair.
// No Obsidian/Electron dependencies; paths are relative to the repository root.
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const slash = (value) => value.split(path.sep).join('/');
const key = (value) => value.normalize('NFC').toLowerCase();
const media = /\.(png|jpe?g|gif|webp|svg|avif|heic|heif|tiff?|bmp|mp4|webm|mov|m4v|ogv|mp3|wav|m4a|ogg|pdf)$/i;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const exists = async (file) => !!(await fs.stat(file).catch(() => null));
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };

async function walk(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    if (entry.name.startsWith('.') || entry.name === '_originals') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}

// Collect destination ranges so repairs change links only, preserving all prose,
// alt text, titles, URI fragments, line endings, and code examples.
export function destinations(text) {
  const refs = [];
  let fence = null;
  let frontmatter = false;
  let comment = false;
  let offset = 0;
  for (const original of text.split(/(?<=\n)/)) {
    const line = original.replace(/\r?\n$/, '');
    const add = (start, raw) => refs.push({ start: offset + start, end: offset + start + raw.length, raw });
    if (offset === 0 && line.replace(/^\uFEFF/, '').trim() === '---') frontmatter = true;
    else if (frontmatter && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
    else if (frontmatter) {
      const m = line.match(/^(\s*(?:coverImage|coverMedia|image|cover):\s*)(.*?)\s*$/);
      if (m) {
        const quoted = m[2].match(/^(["'])(.*?)\1(?:\s+#.*)?$/);
        add(m[1].length + (quoted ? 1 : 0), quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '').trimEnd());
      }
    } else {
      // Mask comments and inline code without shifting source offsets.
      let visible = line.replace(/<!--[\s\S]*?-->/g, (s) => ' '.repeat(s.length));
      if (comment) {
        const end = visible.indexOf('-->');
        if (end < 0) visible = ' '.repeat(visible.length);
        else { visible = ' '.repeat(end + 3) + visible.slice(end + 3); comment = false; }
      }
      const begin = visible.indexOf('<!--');
      if (begin >= 0) { comment = true; visible = visible.slice(0, begin) + ' '.repeat(visible.length - begin); }
      const fm = visible.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (fm) {
        if (!fence) fence = { char: fm[1][0], length: fm[1].length, gallery: /^(gallery|gallery2|photo-wall)\b/i.test(fm[2].trim()) };
        else if (fm[1][0] === fence.char && fm[1].length >= fence.length && !fm[2].trim()) fence = null;
      } else if (!fence || fence.gallery) {
        visible = visible.replace(/(`+).*?\1/g, (s) => ' '.repeat(s.length));
        const patterns = [
          /!?\[\[([^\]|\n]+)(?:\|[^\]\n]*)?\]\]/g,
          /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:\\.|[^()\n]|\([^()\n]*\))*)\)/g,
          /\b(?:src|href)\s*=\s*(["'])(.*?)\1/g,
          /^\s*\[[^\]]+\]:\s*(<[^>]+>|.+?)\s*$/g,
        ];
        for (let i = 0; i < patterns.length; i++) {
          for (const m of visible.matchAll(patterns[i])) {
            let raw = i === 2 ? m[2] : m[1];
            let start = m.index + (i === 2 ? m[0].indexOf(m[1]) + 1 : m[0].indexOf(raw));
            if (i === 1 || i === 3) {
              if (raw.startsWith('<')) { start++; raw = raw.slice(1, raw.indexOf('>')); }
              else raw = raw.replace(/\s+["'][^\n]*["']\s*$/, '').trimEnd();
            }
            add(start, raw);
          }
        }
        if (fence?.gallery && !/[!<\[]/.test(visible)) {
          const raw = visible.trim();
          if (media.test(raw.split(/[?#]/)[0])) add(visible.indexOf(raw), raw);
        }
      }
    }
    offset += original.length;
  }
  return refs.sort((a, b) => a.start - b.start).filter((ref, i, all) => !i || ref.start >= all[i - 1].end);
}

function decoded(raw) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(raw)) return null;
  // Split URI suffix before decoding so %23 in a filename is not a fragment.
  const at = raw.search(/[?#]/);
  let name = at < 0 ? raw : raw.slice(0, at);
  try { name = decodeURIComponent(name); } catch { /* Preserve literal percent. */ }
  name = name.replace(/\\([ ()\[\]])/g, '$1');
  return { name: name.replaceAll('\\', '/'), suffix: at < 0 ? '' : raw.slice(at) };
}

export async function inventory(root = ROOT) {
  const content = path.join(root, 'src/content');
  const files = await walk(content);
  const fileMap = new Map(files.map((file) => [key(slash(path.relative(content, file))), file]));
  const attachments = files.filter((file) => inside(path.join(content, 'attachment'), file));
  const notes = [];
  for (const file of files.filter((file) => /\.md$/i.test(file) && !inside(path.join(content, 'attachment'), file))) {
    const relative = slash(path.relative(content, file));
    const body = await fs.readFile(file, 'utf8');
    const name = path.basename(file, path.extname(file));
    const refs = [];
    for (const ref of destinations(body)) {
      const value = decoded(ref.raw);
      if (!value || !media.test(value.name)) continue;
      let target = value.name.startsWith('attachment/') ? path.posix.normalize(value.name) : path.posix.normalize(path.posix.join(path.posix.dirname(relative), value.name));
      let matches = fileMap.has(key(target)) ? [fileMap.get(key(target))] : [];
      // Obsidian shortest-path wikilinks; explicit Markdown paths stay strict.
      const wiki = body.slice(Math.max(0, ref.start - 2), ref.start) === '[[';
      if (!matches.length && wiki) {
        matches = attachments.filter((f) => key(slash(path.relative(content, f))).endsWith('/' + key(value.name)));
        if (matches.length === 1) target = slash(path.relative(content, matches[0]));
      }
      if (matches.length === 1) target = slash(path.relative(content, matches[0]));
      refs.push({ ...ref, ...value, target, matches, line: body.slice(0, ref.start).split('\n').length });
    }
    notes.push({ file, relative, name, body, refs, article: /^(blog|projects)\//.test(relative) });
  }
  return { root, content, notes, attachments };
}

function selectNote(state, argument) {
  const file = path.resolve(state.root, argument);
  const note = state.notes.find((n) => key(n.file) === key(file));
  if (!note?.article) throw new Error('--note must identify an existing Markdown article under src/content/blog or src/content/projects');
  const duplicates = state.notes.filter((n) => n.article && key(n.name) === key(note.name));
  if (duplicates.length > 1) throw new Error(`Duplicate Markdown filename: ${duplicates.map((n) => n.relative).join(', ')}`);
  if (!note.name || /[<>:"/\\|?*]|[. ]$/.test(note.name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(note.name)) throw new Error('Article filename is not a portable attachment directory name');
  return note;
}

async function safeDirectory(state, name) {
  const dir = path.join(state.content, 'attachment', name);
  // Verify existing ancestors before creating anything through a symlink.
  let ancestor = dir;
  while (!(await exists(ancestor))) ancestor = path.dirname(ancestor);
  const realContent = await fs.realpath(state.content);
  if (!inside(realContent, await fs.realpath(ancestor))) throw new Error('Attachment directory resolves outside content');
  await fs.mkdir(dir, { recursive: true });
  if (!inside(realContent, await fs.realpath(dir))) throw new Error('Attachment directory resolves outside content');
  return dir;
}

async function copyUnique(state, note, source, name = path.basename(source)) {
  if (name !== path.basename(name) || /[<>:"/\\|?*]|[. ]$/.test(name) || name.startsWith('.') || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) throw new Error('Invalid portable attachment filename');
  if (!media.test(name)) throw new Error('Unsupported media extension');
  const input = await fs.readFile(source);
  if (!input.length) throw new Error('Cannot ingest an empty file');
  const inputHash = hash(input);
  const dir = await safeDirectory(state, note.name);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && hash(await fs.readFile(path.join(dir, entry.name))) === inputHash) return path.join(dir, entry.name);
  }
  const parsed = path.parse(name);
  for (let i = 0; ; i++) {
    const candidate = i ? `${parsed.name}-${i + 1}${parsed.ext}` : name;
    if (entries.some((entry) => key(entry.name) === key(candidate))) continue;
    const target = path.join(dir, candidate);
    try {
      // Exclusive copy also refuses a destination created since the directory scan.
      await fs.copyFile(source, target, constants.COPYFILE_EXCL);
      if (hash(await fs.readFile(target)) !== inputHash) throw new Error('Source changed during import; source retained');
      return target;
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
}

function markdownPath(note, file) {
  // Encode spaces, URI punctuation and parentheses, keeping Chinese names readable.
  return slash(path.relative(path.dirname(note.file), file)).replace(/[%\s#?()<>"'\[\]`]/g, (c) => encodeURIComponent(c).replace(/[()']/g, (v) => '%' + v.charCodeAt(0).toString(16).toUpperCase()));
}

export async function addAttachment(root, noteArgument, sourceArgument, name) {
  const state = await inventory(root);
  const note = selectNote(state, noteArgument);
  const source = path.resolve(root, sourceArgument);
  if (!(await fs.stat(source)).isFile()) throw new Error('--file must be a regular file');
  if (name && path.extname(name).toLowerCase() !== path.extname(source).toLowerCase()) throw new Error('--name must keep the source extension; this command does not convert image formats');
  const target = await copyUnique(state, note, source, name);
  return { file: slash(path.relative(root, target)), markdown: `![](${markdownPath(note, target)})` };
}

export async function checkAttachments(root = ROOT, noteArgument) {
  const state = await inventory(root);
  const notes = noteArgument ? [selectNote(state, noteArgument)] : state.notes.filter((n) => n.article);
  const errors = [];
  const warnings = [];
  for (const note of notes) {
    const duplicates = state.notes.filter((n) => n.article && key(n.name) === key(note.name));
    if (duplicates.length > 1) errors.push(`${note.relative}: duplicate article filename`);
    for (const ref of note.refs) {
      const label = `${note.relative}:${ref.line}: ${ref.raw}`;
      if (ref.matches.length !== 1) errors.push(`${label} (${ref.matches.length ? 'ambiguous' : 'missing'})`);
      if (!key(ref.target).startsWith(key(`attachment/${note.name}/`))) errors.push(`${label} (expected attachment/${note.name}/)`);
      else if (path.posix.dirname(ref.target) !== `attachment/${note.name}`) errors.push(`${label} (nested media directories are not scanned by the site)`);
    }
  }
  const used = new Set(state.notes.flatMap((n) => n.refs.flatMap((r) => r.matches.map((f) => key(f)))));
  for (const file of state.attachments) {
    const relative = slash(path.relative(state.content, file));
    const folder = relative.split('/')[1];
    if (noteArgument && key(folder) !== key(notes[0].name)) continue;
    if (path.posix.dirname(relative) === 'attachment') errors.push(`${relative}: loose root attachment`);
    if (!used.has(key(file))) warnings.push(`${relative}: unreferenced (retained)`);
  }
  return { articles: notes.length, references: notes.reduce((sum, n) => sum + n.refs.length, 0), errors, warnings };
}

export async function repairAttachments(root, noteArgument, apply = false) {
  const state = await inventory(root);
  const note = selectNote(state, noteArgument);
  const candidates = [...new Map(note.refs.filter((r) => r.matches.length === 1 && path.posix.dirname(r.target) === 'attachment').map((r) => [r.target, r])).values()];
  const plan = [];
  for (const ref of candidates) {
    const owners = state.notes.filter((n) => n.refs.some((r) => r.matches.some((f) => key(f) === key(ref.matches[0]))));
    const shared = owners.some((n) => n.file !== note.file);
    plan.push({ from: ref.target, to: `attachment/${note.name}/${path.posix.basename(ref.target)}`, status: shared ? 'shared-skipped' : 'planned', owners: owners.map((n) => n.relative) });
  }
  if (!apply) return plan;
  const replacements = new Map();
  for (const item of plan.filter((item) => item.status === 'planned')) {
    const source = path.join(state.content, item.from);
    if (!inside(await fs.realpath(state.content), await fs.realpath(source))) throw new Error('Source resolves outside content');
    const target = await copyUnique(state, note, source);
    replacements.set(item.from, target);
    item.to = slash(path.relative(state.content, target));
    item.status = 'copied';
  }
  let updated = note.body;
  for (const ref of [...note.refs].reverse()) {
    const target = replacements.get(ref.target);
    if (target) updated = updated.slice(0, ref.start) + markdownPath(note, target) + ref.suffix + updated.slice(ref.end);
  }
  if (updated !== note.body) {
    const temp = `${note.file}.${crypto.randomUUID()}.attachment-tmp`;
    try {
      await fs.writeFile(temp, updated, { flag: 'wx' });
      if (await fs.readFile(note.file, 'utf8') !== note.body) throw new Error('Article changed during repair; all source files retained');
      await fs.rename(temp, note.file);
    } finally { await fs.unlink(temp).catch(() => {}); }
    // Fresh scan before removing originals: newly added references keep their source.
    const fresh = await inventory(root);
    for (const item of plan.filter((item) => item.status === 'copied')) {
      const source = path.join(state.content, item.from);
      const target = replacements.get(item.from);
      const stillUsed = fresh.notes.some((n) => n.refs.some((r) => r.matches.some((f) => key(f) === key(source))));
      if (!stillUsed && hash(await fs.readFile(source)) === hash(await fs.readFile(target))) {
        await fs.unlink(source);
        item.status = 'moved';
      } else item.status = 'copied-source-retained';
    }
  }
  return plan;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.apply = true;
    else if (['--note', '--file', '--name'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) {
      options[args[i].slice(2)] = args[i + 1];
      i++;
    }
    else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  if (command === 'add' && options.note && options.file && !options.apply) {
    console.log(JSON.stringify(await addAttachment(ROOT, options.note, options.file, options.name), null, 2));
  } else if (command === 'check' && !options.apply && !options.file && !options.name) {
    const report = await checkAttachments(ROOT, options.note);
    for (const error of report.errors) console.error(`ERROR ${error}`);
    for (const warning of report.warnings) console.warn(`WARN ${warning}`);
    console.log(`Checked ${report.articles} article(s), ${report.references} reference(s): ${report.errors.length} error(s), ${report.warnings.length} warning(s).`);
    if (report.errors.length) process.exitCode = 1;
  } else if (command === 'fix' && options.note && !options.file && !options.name) {
    const plan = await repairAttachments(ROOT, options.note, !!options.apply);
    console.log(JSON.stringify({ apply: !!options.apply, plan }, null, 2));
    if (plan.some((p) => p.status === 'shared-skipped')) process.exitCode = 1;
  } else throw new Error('Usage: attachments.mjs add --note <article.md> --file <image> [--name <filename>] | check [--note <article.md>] | fix --note <article.md> [--apply]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

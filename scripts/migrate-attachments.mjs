// One-time content-library migration:
//   <article>/images/*  ->  content/attachment/<Markdown file name>/*
// and rewrites Markdown references to relative links understood by Obsidian.
// Safe to re-run: it refuses to overwrite conflicting destination files.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const contentRoot = fileURLToPath(new URL('../src/content/', import.meta.url));
const attachmentRoot = path.join(contentRoot, 'attachment');
const blogRoot = path.join(contentRoot, 'blog');
const projectsRoot = path.join(contentRoot, 'projects');

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return /\.md$/i.test(entry.name) ? [full] : [];
  });
}
function hash(file) { return crypto.createHash('sha256').update(readFileSync(file)).digest('hex'); }
function relativeMarkdownPath(fromDir, target) {
  const rel = path.relative(fromDir, target).split(path.sep).join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}
function moveDirectory(source, destination) {
  if (!existsSync(source)) return;
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (existsSync(to)) {
      if (hash(from) !== hash(to)) throw new Error(`Refusing to overwrite different file: ${to}`);
      rmSync(from);
    } else renameSync(from, to);
  }
  if (readdirSync(source).length === 0) rmSync(source, { recursive: true });
}

const notes = [...markdownFiles(projectsRoot), ...markdownFiles(blogRoot)];
const noteNames = new Map();
for (const note of notes) {
  const noteName = path.basename(note, '.md');
  if (noteNames.has(noteName)) throw new Error(`Duplicate note name cannot share an attachment folder: ${noteName}`);
  noteNames.set(noteName, note);
}

mkdirSync(attachmentRoot, { recursive: true });
const knownAttachmentHashes = new Set();
for (const note of notes) {
  const oldImages = path.join(path.dirname(note), 'images');
  if (!existsSync(oldImages)) continue;
  const attachmentDir = path.join(attachmentRoot, path.basename(note, '.md'));
  moveDirectory(oldImages, attachmentDir);
  for (const entry of readdirSync(attachmentDir, { withFileTypes: true })) {
    if (entry.isFile()) knownAttachmentHashes.add(hash(path.join(attachmentDir, entry.name)));
  }
  const relativeAttachmentDir = relativeMarkdownPath(path.dirname(note), attachmentDir);
  const body = readFileSync(note, 'utf8');
  const updated = body
    .replace(/(!\[[^\]]*\]\()images\//g, `$1${relativeAttachmentDir}/`)
    .replace(/\.\/images\//g, `${relativeAttachmentDir}/`);
  if (updated !== body) writeFileSync(note, updated);
}

// Preserve legacy files with no article reference instead of deleting them.
const legacyBlogImages = path.join(blogRoot, 'images');
if (existsSync(legacyBlogImages)) {
  const unassigned = path.join(attachmentRoot, '_unassigned');
  for (const entry of readdirSync(legacyBlogImages, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(legacyBlogImages, entry.name);
    if (knownAttachmentHashes.has(hash(from))) rmSync(from);
    else {
      mkdirSync(unassigned, { recursive: true });
      const to = path.join(unassigned, entry.name);
      if (existsSync(to) && hash(from) !== hash(to)) throw new Error(`Refusing to overwrite different file: ${to}`);
      if (!existsSync(to)) renameSync(from, to);
      else rmSync(from);
    }
  }
  if (readdirSync(legacyBlogImages).length === 0) rmSync(legacyBlogImages, { recursive: true });
}

console.log(`Attachment migration complete. Article folders live in ${attachmentRoot}`);

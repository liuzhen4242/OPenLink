import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = path.resolve('src/content');
const folders = ['blog', 'projects'];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  });
}

function articleFiles() {
  return folders.flatMap((folder) => walk(path.join(root, folder)));
}

function dateOnly(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isPlaceholder(value) {
  return typeof value === 'string' && /^\{\{[^}]+\}\}$/.test(value.trim());
}

function normalizeDate(value, fallback) {
  if (!value) return fallback;
  if (value instanceof Date) return dateOnly(value.getTime());
  return String(value).slice(0, 10);
}

function isEnglishName(value) {
  return /^[\p{Script=Latin}\p{N}\s._&+\-]+$/u.test(value);
}

function normalizeMedia(value) {
  if (typeof value !== 'string') return value;
  let result = value.trim();
  const markdownImage = result.match(/^!\[[^\]]*\]\((.*)\)$/);
  const wikilink = result.match(/^!?\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/);
  if (markdownImage) result = markdownImage[1].trim();
  if (wikilink) result = wikilink[1].trim();
  if (result.startsWith('<') && result.endsWith('>')) result = result.slice(1, -1);
  try {
    result = decodeURIComponent(result);
  } catch {
    // Keep the original path when a filename contains an invalid escape.
  }
  return result;
}

function parseFrontmatter(source) {
  const safeSource = source.replace(
    /^(coverImage|coverMedia):\s*(?!["'])(.+)$/gm,
    (line, key, value) => `${key}: ${JSON.stringify(value.trim())}`
  );
  return yaml.load(safeSource) || {};
}

function normalizeArticle(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.startsWith('---\n')) return null;
  const end = source.indexOf('\n---', 4);
  if (end < 0) return null;

  const raw = parseFrontmatter(source.slice(4, end));
  const body = source.slice(end + 4);
  const fileName = path.basename(filePath, '.md');
  const stat = fs.statSync(filePath);
  const isProject = filePath.includes(`${path.sep}projects${path.sep}`);
  const data = {};

  const title = !isPlaceholder(raw.title) ? raw.title : undefined;
  const titleEn = !isPlaceholder(raw.titleEn) ? raw.titleEn : undefined;
  data.title = title ?? (!isEnglishName(fileName) ? fileName : null);
  data.titleEn = titleEn ?? (isEnglishName(fileName) ? fileName : null);
  data.date = normalizeDate(raw.date, dateOnly(stat.birthtimeMs));
  data.update = normalizeDate(raw.update, dateOnly(stat.mtimeMs));
  data.description = isPlaceholder(raw.description) ? null : (raw.description ?? null);

  const author = raw.author ?? ['zhenliu'];
  data.author = Array.isArray(author) ? author : [author];

  const category = Array.isArray(raw.category)
    ? raw.category.filter((item) => !isPlaceholder(item))
    : [];
  data.category = category.length ? category : ['未分类'];
  data.status = raw.status || 'public';

  for (const key of ['coverImage', 'coverMedia', 'notes']) {
    if (raw[key] !== undefined && raw[key] !== null && !isPlaceholder(raw[key])) {
      data[key] = key === 'notes' ? raw[key] : normalizeMedia(raw[key]);
    }
  }

  const output = `---\n${yaml.dump(data, { noRefs: true, lineWidth: -1, sortKeys: false }).trimEnd()}\n---${body}`;
  return { filePath, isProject, changed: output !== source, output, before: raw, after: data };
}

const results = articleFiles().map(normalizeArticle).filter(Boolean);
const changed = results.filter((result) => result.changed);

for (const result of changed) {
  console.log(`${process.argv.includes('--write') ? 'updated' : 'would update'} ${path.relative(process.cwd(), result.filePath)}`);
}

console.log(`frontmatter: ${results.length} articles scanned, ${changed.length} ${process.argv.includes('--write') ? 'updated' : 'would update'}`);

if (process.argv.includes('--write')) {
  for (const result of changed) fs.writeFileSync(result.filePath, result.output);
}

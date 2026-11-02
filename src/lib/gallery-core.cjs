const MODES = new Set(['play', 'iphone', 'photo-wall', 'grid', 'archdaily']);
const LIMITS = { iphone: 7, archdaily: 7, grid: 6, 'photo-wall': 7 };
function parseImageLine(line) {
  const md = line.trim().match(/^!\[.*?\]\((.*?)\)$/);
  if (md) return md[1].trim().replace(/^<(.*)>$/, '$1');
  const wiki = line.trim().match(/^!\[\[([^|\]]+)(?:\|[^\]]*)?\]\]$/);
  if (wiki) return wiki[1].trim();
  // Obsidian may insert a plain attachment path inside a fenced code block.
  const raw = line.trim().replace(/^<(.*)>$/, '$1');
  if (/^["']/.test(raw)) return '';
  return /\.(?:jpe?g|png|webp|avif|heic|heif|tiff?|gif|svg)(?:[?#].*)?$/i.test(raw) ? raw : '';
}
function extractImageUrls(value) { return String(value || '').split(/\r?\n/).map(parseImageLine).filter(Boolean); }
function parseGallery(value) {
  let title = '', mode = '', seconds = 1;
  for (const line of String(value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    if (parseImageLine(line)) continue;
    const speed = line.match(/^s\s*=\s*(\d+(?:\.\d+)?)$/i);
    if (speed) { seconds = Number(speed[1]); if (!mode) mode = 'play'; continue; }
    const quoted = line.match(/^["'](.*?)["']\s*(?:s\s*=\s*(\d+(?:\.\d+)?))?$/i);
    if (!quoted) continue;
    let candidate = quoted[1].trim().toLowerCase();
    if (candidate === 'photowall') candidate = 'photo-wall';
    if (MODES.has(candidate)) { mode = candidate; if (mode === 'play' && quoted[2]) seconds = Number(quoted[2]); }
    else if (!title) title = quoted[1].trim();
  }
  if (!Number.isFinite(seconds) || seconds <= 0) seconds = 1;
  return {title, mode: mode || 'play', intervalMs: Math.round(Math.min(60, Math.max(.25, seconds)) * 1000)};
}
module.exports = { parseGallery, parseImageLine, extractImageUrls, LIMITS };


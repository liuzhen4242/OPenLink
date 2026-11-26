const { Plugin, MarkdownRenderChild, editorLivePreviewField } = require('obsidian');
const { StateField } = require('@codemirror/state');
const { Decoration, EditorView, WidgetType } = require('@codemirror/view');
const { playerForLine } = require('../../src/lib/bilibili-video.cjs');

function createPlayer(doc, src) {
  const frame = doc.createElement('iframe');
  frame.className = 'openlink-bilibili-player';
  frame.title = '哔哩哔哩视频播放器';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'no-referrer';
  frame.allowFullscreen = true;
  frame.src = src;
  return frame;
}

class PlayerWidget extends WidgetType {
  constructor(src) {
    super();
    this.src = src;
  }

  eq(other) {
    return this.src === other.src;
  }

  toDOM(view) {
    return createPlayer(view.dom.ownerDocument, this.src);
  }
}

// Collect the Markdown line offsets once per document edit. Cursor movement
// only changes which players should be visible.
function findVideos(doc) {
  const videos = [];
  let frontmatter = /^\uFEFF?---\s*$/.test(doc.line(1).text);
  let fence = null;
  let commentEnd = null;
  for (let number = 1; number <= doc.lines; number++) {
    const { from, to, text } = doc.line(number);
    if (frontmatter) {
      if (number > 1 && /^(---|\.\.\.)\s*$/.test(text)) frontmatter = false;
      continue;
    }
    const marker = /^ {0,3}(\x60{3,}|~{3,})(.*)$/.exec(text);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (commentEnd) {
      if (text.includes(commentEnd)) commentEnd = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    if (text.includes('<!--') && !text.includes('-->')) commentEnd = '-->';
    if ((text.match(/%%/g)?.length || 0) % 2) commentEnd = '%%';
    if (commentEnd || /^(?: {4}|\s*\t)/.test(text)) continue;

    const src = playerForLine(text);
    if (src) videos.push({ from, to, src });
  }
  return videos;
}

function editorDecorations(state, videos) {
  if (!state.field(editorLivePreviewField, false)) return Decoration.none;
  const ranges = [];
  for (const { from, to, src } of videos) {
    if (state.selection.ranges.some((selection) => selection.from <= to && selection.to >= from)) continue;
    ranges.push(Decoration.replace({ widget: new PlayerWidget(src), block: true }).range(from, to));
  }
  return Decoration.set(ranges);
}

const livePlayers = StateField.define({
  create(state) {
    const videos = findVideos(state.doc);
    return { videos, decorations: editorDecorations(state, videos) };
  },
  update(previous, transaction) {
    const { state, startState, docChanged } = transaction;
    if (!docChanged && !transaction.selection &&
        state.field(editorLivePreviewField, false) === startState.field(editorLivePreviewField, false)) return previous;
    const videos = docChanged ? findVideos(state.doc) : previous.videos;
    return { videos, decorations: editorDecorations(state, videos) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

function readingPlayer(paragraph) {
  // Obsidian can expose a bare URL as text or as an automatic hyperlink.
  if (paragraph.querySelector('code')) return null;
  const rawPlayer = playerForLine(paragraph.textContent);
  if (rawPlayer) return rawPlayer;
  const [anchor] = paragraph.children;
  if (paragraph.children.length !== 1 || anchor.tagName !== 'A') return null;
  let caption = '';
  for (let sibling = anchor.previousSibling; sibling; sibling = sibling.previousSibling) {
    caption = sibling.textContent + caption;
  }
  for (let sibling = anchor.nextSibling; sibling; sibling = sibling.nextSibling) {
    if (sibling.textContent.trim()) return null;
  }
  caption = caption.trim();
  if (caption && !/^【[^】\r\n]+】$/.test(caption)) return null;
  return playerForLine(anchor.getAttribute('href') || '');
}

class ReadingPlayer extends MarkdownRenderChild {
  constructor(frame, paragraph) {
    super(frame);
    this.paragraph = paragraph;
  }

  onload() {
    this.paragraph.classList.add('openlink-bilibili-source');
  }

  onunload() {
    this.paragraph.classList.remove('openlink-bilibili-source');
    this.containerEl.remove();
  }
}

module.exports = class BilibiliPreview extends Plugin {
  onload() {
    this.registerEditorExtension(livePlayers);
    this.registerMarkdownPostProcessor((element, context) => {
      const paragraphs = element.matches('p') ? [element] : element.querySelectorAll('p');
      for (const paragraph of paragraphs) {
        if (paragraph.closest('li, blockquote, pre') ||
            paragraph.nextElementSibling?.classList.contains('openlink-bilibili-player')) continue;
        const src = readingPlayer(paragraph);
        if (!src) continue;
        const frame = createPlayer(paragraph.ownerDocument, src);
        paragraph.after(frame);
        context.addChild(new ReadingPlayer(frame, paragraph));
      }
    });
  }
};

"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/lib/bilibili-video.cjs
var require_bilibili_video = __commonJS({
  "src/lib/bilibili-video.cjs"(exports2, module2) {
    "use strict";
    var VIDEO_LINE = /^(?:【[^】\r\n]+】[ \t\u00a0]*)?(?:\[[^\]\r\n]+\]\((<?https?:\/\/[^\s<>()]+>?)\)|<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<>()]+))[ \t]*$/i;
    function playerForLine2(line) {
      if (/[\r\n]/.test(line)) return null;
      const match = VIDEO_LINE.exec(line.trim());
      if (!match) return null;
      let link;
      try {
        const destination = (match[1] || match[2] || match[3]).replace(/^<|>$/g, "").replace(/\\&|&amp;/g, "&");
        link = new URL(destination);
      } catch {
        return null;
      }
      if (!["bilibili.com", "www.bilibili.com", "m.bilibili.com"].includes(link.hostname) || link.port || link.username || link.password) return null;
      const id = /^\/video\/(BV[A-Za-z0-9]{10}|av[1-9]\d*)\/?$/i.exec(link.pathname)?.[1];
      if (!id) return null;
      const player = new URL("https://player.bilibili.com/player.html");
      if (/^BV/i.test(id)) player.searchParams.set("bvid", "BV" + id.slice(2));
      else player.searchParams.set("aid", id.slice(2));
      for (const [param, valid] of [["p", /^[1-9]\d*$/], ["t", /^\d+(?:\.\d+)?$/]]) {
        const value = link.searchParams.get(param);
        if (value && valid.test(value)) player.searchParams.set(param, value);
      }
      player.searchParams.set("autoplay", "0");
      player.searchParams.set("danmaku", "0");
      return player.href;
    }
    module2.exports = { playerForLine: playerForLine2 };
  }
});

// plugins/bilibili-preview/main.cjs
var { Plugin, MarkdownRenderChild, editorLivePreviewField } = require("obsidian");
var { StateField } = require("@codemirror/state");
var { Decoration, EditorView, WidgetType } = require("@codemirror/view");
var { playerForLine } = require_bilibili_video();
function createPlayer(doc, src) {
  const frame = doc.createElement("iframe");
  frame.className = "openlink-bilibili-player";
  frame.title = "\u54D4\u54E9\u54D4\u54E9\u89C6\u9891\u64AD\u653E\u5668";
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer";
  frame.allowFullscreen = true;
  frame.src = src;
  return frame;
}
var PlayerWidget = class extends WidgetType {
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
};
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
    if (text.includes("<!--") && !text.includes("-->")) commentEnd = "-->";
    if ((text.match(/%%/g)?.length || 0) % 2) commentEnd = "%%";
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
var livePlayers = StateField.define({
  create(state) {
    const videos = findVideos(state.doc);
    return { videos, decorations: editorDecorations(state, videos) };
  },
  update(previous, transaction) {
    const { state, startState, docChanged } = transaction;
    if (!docChanged && !transaction.selection && state.field(editorLivePreviewField, false) === startState.field(editorLivePreviewField, false)) return previous;
    const videos = docChanged ? findVideos(state.doc) : previous.videos;
    return { videos, decorations: editorDecorations(state, videos) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});
function readingPlayer(paragraph) {
  if (paragraph.querySelector("code")) return null;
  const rawPlayer = playerForLine(paragraph.textContent);
  if (rawPlayer) return rawPlayer;
  const [anchor] = paragraph.children;
  if (paragraph.children.length !== 1 || anchor.tagName !== "A") return null;
  let caption = "";
  for (let sibling = anchor.previousSibling; sibling; sibling = sibling.previousSibling) {
    caption = sibling.textContent + caption;
  }
  for (let sibling = anchor.nextSibling; sibling; sibling = sibling.nextSibling) {
    if (sibling.textContent.trim()) return null;
  }
  caption = caption.trim();
  if (caption && !/^【[^】\r\n]+】$/.test(caption)) return null;
  return playerForLine(anchor.getAttribute("href") || "");
}
var ReadingPlayer = class extends MarkdownRenderChild {
  constructor(frame, paragraph) {
    super(frame);
    this.paragraph = paragraph;
  }
  onload() {
    this.paragraph.classList.add("openlink-bilibili-source");
  }
  onunload() {
    this.paragraph.classList.remove("openlink-bilibili-source");
    this.containerEl.remove();
  }
};
module.exports = class BilibiliPreview extends Plugin {
  onload() {
    this.registerEditorExtension(livePlayers);
    this.registerMarkdownPostProcessor((element, context) => {
      const paragraphs = element.matches("p") ? [element] : element.querySelectorAll("p");
      for (const paragraph of paragraphs) {
        if (paragraph.closest("li, blockquote, pre") || paragraph.nextElementSibling?.classList.contains("openlink-bilibili-player")) continue;
        const src = readingPlayer(paragraph);
        if (!src) continue;
        const frame = createPlayer(paragraph.ownerDocument, src);
        paragraph.after(frame);
        context.addChild(new ReadingPlayer(frame, paragraph));
      }
    });
  }
};

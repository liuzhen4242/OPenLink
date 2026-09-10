// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { remarkGalleryPlugin, remarkObsidianImages } from './scripts/remark-obsidian-media.mjs';
import { devSourceMediaFallbackPlugin } from './scripts/vite-dev-media.mjs';

/**
 * ── 注释系统 remark 插件（完整移植自 Herschel-blog）────────────────────────
 */

/** 把正文里的 <sup>[1]</sup> 规范成 <sup>1</sup>：引注索引只显示数字、不带方括号 */
function remarkPlainNoteIndex() {
  return (tree) => {
    const visit = (node) => {
      const children = node.children;
      if (!Array.isArray(children)) return;

      // CommonMark 会把 <sup> 与 </sup> 解析成独立的 html 节点，
      // 中间的 "[1]" 是普通 text 节点，因此按“开标签 + 文本 + 闭标签”三段改写。
      for (let i = 0; i < children.length; i++) {
        const open = children[i];
        const text = children[i + 1];
        const close = children[i + 2];

        if (
          open && text && close &&
          open.type === 'html' && close.type === 'html' &&
          /^<sup[^>]*>$/i.test(open.value.trim()) &&
          /^<\/sup>$/i.test(close.value.trim()) &&
          text.type === 'text'
        ) {
          const m = text.value.match(/^\s*\[\s*(\d+)\s*\]\s*$/);
          if (m) text.value = m[1];
        }

        visit(children[i]);
      }
    };
    visit(tree);
  };
}

/** 把 HTML 属性里的文本安全转义 */
function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 新手向内联注释（作者显式指定范围）：
 *   {需要注释的文字|注释内容}
 * 渲染为 <span class="note-word">文字</span><sup data-note="注释内容">自动序号</sup>。
 * 下划线范围由作者用花括号决定，注释正文与序号全部自动生成。
 */
function remarkCurlyNotes() {
  return (tree) => {
    let index = 0;

    const visit = (node, parent) => {
      if (
        node.type === 'text' &&
        parent && parent.type === 'paragraph' &&
        /\{[^}|]+\|[^}]*\}/.test(node.value)
      ) {
        const re = /\{([^}|]+)\|([^}]*)\}/g;
        const parts = [];
        let last = 0;
        let changed = false;
        let m;

        while ((m = re.exec(node.value))) {
          parts.push({ type: 'text', value: node.value.slice(last, m.index) });
          const target = m[1].trim();
          const note = m[2].trim();
          if (target) {
            index += 1;
            parts.push({ type: 'html', value: '<span class="note-word">' });
            parts.push({ type: 'text', value: target });
            parts.push({ type: 'html', value: '</span>' });
            parts.push({ type: 'html', value: `<sup data-note="${escapeHtmlAttr(note)}">` });
            parts.push({ type: 'text', value: String(index) });
            parts.push({ type: 'html', value: '</sup>' });
          }
          last = re.lastIndex;
          changed = true;
        }

        if (changed) {
          if (last < node.value.length) {
            parts.push({ type: 'text', value: node.value.slice(last) });
          }
          const list = parent.children;
          list.splice(list.indexOf(node), 1, ...parts);
          return;
        }
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child, node);
      }
    };

    visit(tree, null);
  };
}

/**
 * 给“词级引注”的词加下划线标记：当 <sup>n</sup> 紧贴在一个词（无空格/标点间隔）后面时，
 * 渲染层自动把该词包成 <span class="note-word">…</span>，配合极淡灰下划线表示引注精确定位。
 * 整句注释（上标跟在标点或空格后）不会被包裹。
 */
function remarkWordUnderline() {
  // 词：连续的中英文、数字、下划线或连字符；锚定在文本末尾
  const WORD = /([\p{L}\p{N}_-]+)$/u;

  return (tree) => {
    const visit = (node) => {
      const children = node.children;
      if (!Array.isArray(children)) return;

      const out = [];
      let i = 0;
      while (i < children.length) {
        const cur = children[i];
        const isSupOpen =
          cur.type === 'html' && /^<sup[^>]*>$/i.test(String(cur.value).trim());

        // 标准结构：<sup> 数字 </sup>（CommonMark 会拆成三个节点）
        const hasSplitSup =
          isSupOpen &&
          i + 2 < children.length &&
          children[i + 1].type === 'text' &&
          children[i + 2].type === 'html' &&
          /^<\/sup>$/i.test(String(children[i + 2].value).trim());

        if (isSupOpen && hasSplitSup) {
          const prev = out[out.length - 1];
          if (prev && prev.type === 'text') {
            const m = WORD.exec(prev.value);
            const tail = m && m[0];
            // 尾词过长视为普通句子，不划线；只处理像“参数化”“design”这种短词
            if (tail && tail.length <= 12) {
              prev.value = prev.value.slice(0, m.index);
              out.push({ type: 'html', value: '<span class="note-word">' });
              out.push({ type: 'text', value: tail });
              for (let k = i; k <= i + 2; k++) out.push(children[k]);
              out.push({ type: 'html', value: '</span>' });
              i += 3;
              continue;
            }
          }
        }

        out.push(cur);
        i++;
      }

      node.children = out;
      out.forEach(visit);
    };

    visit(tree);
  };
}

export default defineConfig({
  markdown: {
    remarkPlugins: [
      remarkGalleryPlugin,
      remarkObsidianImages,
      remarkCurlyNotes,
      remarkPlainNoteIndex,
      remarkWordUnderline,
    ],
  },
  vite: {
    plugins: [tailwindcss(), devSourceMediaFallbackPlugin()],
    resolve: {
      preserveSymlinks: true,
    },
  },
});

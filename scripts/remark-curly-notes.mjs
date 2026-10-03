// @ts-check

/**
 * ── 花括号内联注释 remark 插件 ─────────────────────────────────────────────
 *   {需要注释的文字|注释内容}
 * 渲染为 <span class="note-word">文字</span><sup data-note="注释内容">自动序号</sup>，
 * 注释内容由前端收集到右栏（或窄屏文末脚注）。
 *
 * 支持范围与注释里的轻量 Markdown：
 *   {**加粗词**|说明}        —— 范围里的 ** ** 由 markdown 正常渲染（保留 strong 节点）
 *   {词|**加粗的说明**}      —— 注释内容序列化为 markdown 存入 data-note，前端再渲染
 *   *斜体*、`行内代码`、~~删除线~~、[链接](url) 同理。
 *
 * 实现说明：remark 解析阶段会把 {**词**|注} 里的 ** 先拆成 strong 节点，
 * 导致"整段是单个文本节点"的旧正则匹配不到。这里把段落行内内容拍平成
 * "分段 + 偏移"，在拼接文本上定位 {…|…}，再把命中区间切回原节点重建，
 * 因此目标区里的加粗/斜体等节点能原样保留。
 */

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 行内节点的纯文本（用于拼 raw 文本做匹配定位） */
function inlineText(node) {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (Array.isArray(node.children)) return node.children.map(inlineText).join('');
  return '';
}

/** 把行内节点序列重新序列化成 Markdown 文本（用于 data-note，前端再渲染） */
function inlineToMd(node) {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'inlineCode':
      return '`' + node.value + '`';
    case 'strong':
      return '**' + node.children.map(inlineToMd).join('') + '**';
    case 'emphasis':
      return '*' + node.children.map(inlineToMd).join('') + '*';
    case 'delete':
      return '~~' + node.children.map(inlineToMd).join('') + '~~';
    case 'link':
      return '[' + node.children.map(inlineToMd).join('') + '](' + node.url + ')';
    case 'image':
      return '![' + (node.alt || '') + '](' + node.url + ')';
    default:
      return node.value || '';
  }
}

/** 把节点在其文本偏移 at 处切成两半（复合节点按需递归切） */
function splitNode(node, at) {
  if (at <= 0) return { head: null, tail: node };
  if (node.type === 'text' || node.type === 'inlineCode') {
    return {
      head: { type: node.type, value: node.value.slice(0, at) },
      tail: { type: node.type, value: node.value.slice(at) },
    };
  }
  if (Array.isArray(node.children)) {
    const children = node.children;
    let acc = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const len = inlineText(child).length;
      if (acc + len > at) {
        const { head, tail } = splitNode(child, at - acc);
        const headChildren = children.slice(0, i);
        if (head) headChildren.push(head);
        const tailChildren = [];
        if (tail) tailChildren.push(tail);
        tailChildren.push(...children.slice(i + 1));
        return {
          head: { ...node, children: headChildren },
          tail: { ...node, children: tailChildren },
        };
      }
      acc += len;
    }
  }
  return { head: null, tail: node };
}

export function remarkCurlyNotes() {
  return (tree) => {
    let index = 0;

    const visit = (node, parent) => {
      if (node.type === 'paragraph' && Array.isArray(node.children)) {
        processParagraph(node);
        return; // 段落已重建，不再下钻
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) visit(child, node);
      }
    };

    const processParagraph = (paragraph) => {
      const children = paragraph.children;

      // 1) 拍平成"分段"：每个行内节点一段，记录其在拼接文本里的偏移
      const segs = [];
      for (const n of children) {
        segs.push({ node: n, text: inlineText(n), start: 0 });
      }

      let off = 0;
      for (const s of segs) {
        s.start = off;
        s.end = off + s.text.length;
        off += s.text.length;
      }
      const raw = segs.map((s) => s.text).join('');
      if (!/\{/.test(raw)) return;

      const re = /\{([^}|]+)\|([^}]*)\}/g;
      const matches = [];
      let m;
      while ((m = re.exec(raw))) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          targetStart: m.index + 1,
          targetEnd: m.index + 1 + m[1].length,
          noteStart: m.index + 1 + m[1].length + 1,
          noteEnd: m.index + m[0].length - 1,
        });
      }
      if (matches.length === 0) return;

      // 2) 若某个匹配区间内混有零宽节点（<br>、图片等），无法安全重建 → 整段按原样保留
      for (const s of segs) {
        if (s.text.length === 0 && matches.some((mm) => s.start > mm.start && s.start < mm.end)) {
          return;
        }
      }

      // 3) 沿分段游标重建 children
      const out = [];
      let segIdx = 0;

      // 把流位置推进到 rawPos；keepHead 时把被切开的前半段并入 out
      const advanceTo = (rawPos, keepHead) => {
        while (segIdx < segs.length && segs[segIdx].end <= rawPos) {
          if (keepHead) out.push(segs[segIdx].node);
          segIdx++;
        }
        if (segIdx < segs.length && segs[segIdx].start < rawPos) {
          const s = segs[segIdx];
          const cut = rawPos - s.start;
          const { head, tail } = splitNode(s.node, cut);
          if (keepHead && head) out.push(head);
          segs[segIdx] = { node: tail, text: s.text.slice(cut), start: rawPos, end: s.end };
        }
      };

      // 收集 [fromRaw, toRaw) 范围内的节点（流位置需已到 fromRaw）
      const collectRange = (fromRaw, toRaw) => {
        advanceTo(fromRaw, false);
        const nodes = [];
        while (segIdx < segs.length && segs[segIdx].start < toRaw) {
          const s = segs[segIdx];
          if (s.text.length === 0) {
            segIdx++;
            continue;
          }
          if (s.end <= toRaw) {
            nodes.push(s.node);
            segIdx++;
          } else {
            const cut = toRaw - s.start;
            const { head, tail } = splitNode(s.node, cut);
            nodes.push(head);
            segs[segIdx] = { node: tail, text: s.text.slice(cut), start: toRaw, end: s.end };
          }
        }
        return nodes;
      };

      for (const match of matches) {
        advanceTo(match.start, true); // 保留 { 之前的正文
        advanceTo(match.targetStart, false); // 丢弃 {
        const targetNodes = collectRange(match.targetStart, match.targetEnd);
        const noteNodes = collectRange(match.noteStart, match.noteEnd);
        advanceTo(match.end, false); // 丢弃 } 及残留

        index += 1;
        out.push({ type: 'html', value: '<span class="note-word">' });
        out.push(...targetNodes);
        out.push({ type: 'html', value: '</span>' });
        const noteMd = noteNodes.map(inlineToMd).join('');
        out.push({ type: 'html', value: `<sup data-note="${escapeHtmlAttr(noteMd)}">` });
        out.push({ type: 'text', value: String(index) });
        out.push({ type: 'html', value: '</sup>' });
      }

      while (segIdx < segs.length) {
        out.push(segs[segIdx].node);
        segIdx++;
      }

      paragraph.children = out;
    };

    visit(tree, null);
  };
}

// 注释（引注）内容的轻量 Markdown 渲染。
// 服务端（静态 notes set:html）与客户端（{词|注释} 的 data-note 收集）共用。
// 顺序：先转义 HTML，再处理 `代码` → **加粗** → ~~删除线~~ → *斜体* → [链接](url)，
// 保证原始 < > & 不会变成标签，仅这五种标记被转换。

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderInlineMd(src) {
  let s = esc(src ?? '');

  // 行内代码（最先处理，代码内容不再参与其它标记）
  s = s.replace(/`([^`\n]+)`/g, (_m, code) => `<code>${code}</code>`);

  // 加粗 **x**
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, (_m, t) => `<strong>${t}</strong>`);

  // 删除线 ~~x~~
  s = s.replace(/~~([^~\n]+)~~/g, (_m, t) => `<s>${t}</s>`);

  // 斜体 *x*（单个 * 成对才转，** 已在上面被消费掉）
  s = s.replace(/\*([^*\n]+)\*/g, (_m, t) => `<em>${t}</em>`);

  // 链接 [text](url)
  s = s.replace(/\[([^\]\n]+)\]\(([^()\s]+)\)/g, (_m, label, url) => {
    const href = url.replace(/"/g, '&quot;');
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });

  return s;
}

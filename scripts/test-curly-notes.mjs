// 花括号注释插件 + 注释迷你 Markdown 渲染 的单元测试。
// 运行：node scripts/test-curly-notes.mjs
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { remarkCurlyNotes } from './remark-curly-notes.mjs';
import { renderInlineMd } from '../src/lib/renderInlineMd.js';

const render = async (md) => {
  const file = await unified()
    .use(remarkParse)
    .use(remarkCurlyNotes)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(md);
  return String(file);
};

let pass = 0;
let fail = 0;
const check = async (name, md, expected) => {
  let got;
  try {
    got = await render(md);
  } catch (e) {
    got = `THREW: ${e.message}`;
  }
  if (got === expected) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`  md:       ${md}`);
    console.log(`  expected: ${expected}`);
    console.log(`  got:      ${got}`);
  }
};

// ── remarkCurlyNotes ────────────────────────────────────────────────
await check(
  '普通纯文本注释（旧行为保持）',
  '所谓{参数化|用参数驱动形态生成}设计',
  '<p>所谓<span class="note-word">参数化</span><sup data-note="用参数驱动形态生成">1</sup>设计</p>',
);

await check(
  '目标区加粗 {**词**|注释}',
  '- {**本地仓同步**|check，sync rui，materials，script}',
  '<ul>\n<li><span class="note-word"><strong>本地仓同步</strong></span><sup data-note="check，sync rui，materials，script">1</sup></li>\n</ul>',
);

await check(
  '注释区加粗 {词|**注释**}',
  '{词|**加粗的注释**}',
  '<p><span class="note-word">词</span><sup data-note="**加粗的注释**">1</sup></p>',
);

await check(
  '目标与注释都加粗',
  '{**a**|**b**}',
  '<p><span class="note-word"><strong>a</strong></span><sup data-note="**b**">1</sup></p>',
);

await check(
  '斜体 {*目标*|*注释*}',
  '{*斜体*|*注释*}',
  '<p><span class="note-word"><em>斜体</em></span><sup data-note="*注释*">1</sup></p>',
);

await check(
  '行内代码 {`目标`|`注释`}',
  '{`代码`|`注释代码`}',
  '<p><span class="note-word"><code>代码</code></span><sup data-note="`注释代码`">1</sup></p>',
);

await check(
  '段落里混合：纯文本 + 加粗目标，编号递增',
  '{a|1} 中间 {**b**|2}',
  '<p><span class="note-word">a</span><sup data-note="1">1</sup> 中间 <span class="note-word"><strong>b</strong></span><sup data-note="2">2</sup></p>',
);

await check(
  '目标前有正文文字（同文本节点内）',
  'abc{a|b}def',
  '<p>abc<span class="note-word">a</span><sup data-note="b">1</sup>def</p>',
);

await check(
  '空注释 {a|}',
  '{a|}',
  '<p><span class="note-word">a</span><sup data-note="">1</sup></p>',
);

await check(
  '无竖线不是注释，原样保留',
  '普通 {a} 文本',
  '<p>普通 {a} 文本</p>',
);

await check(
  '标题里的花括号不处理（只处理段落）',
  '## {a|b}',
  '<h2>{a|b}</h2>',
);

await check(
  '引用块段落里正常处理',
  '> {a|b}',
  '<blockquote>\n<p><span class="note-word">a</span><sup data-note="b">1</sup></p>\n</blockquote>',
);

await check(
  '目标区嵌套加粗+斜体 {**a *b* c**|note}',
  '{**a *b* c**|note}',
  '<p><span class="note-word"><strong>a <em>b</em> c</strong></span><sup data-note="note">1</sup></p>',
);

await check(
  '整句注释（含标点）',
  '{这里整句话都需要补充背景。|这句话的背景说明……}',
  '<p><span class="note-word">这里整句话都需要补充背景。</span><sup data-note="这句话的背景说明……">1</sup></p>',
);

await check(
  '全文多处注释编号跨段落递增',
  '{a|x}\n\n{**b**|y}',
  '<p><span class="note-word">a</span><sup data-note="x">1</sup></p>\n<p><span class="note-word"><strong>b</strong></span><sup data-note="y">2</sup></p>',
);

// ── renderInlineMd ─────────────────────────────────────────────────
const eq = (name, input, expected) => {
  const got = renderInlineMd(input);
  if (got === expected) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}`);
    console.log(`  input:    ${input}`);
    console.log(`  expected: ${expected}`);
    console.log(`  got:      ${got}`);
  }
};

eq('加粗', '**加粗**', '<strong>加粗</strong>');
eq('斜体', '*斜体*', '<em>斜体</em>');
eq('行内代码', '`code <x>`', '<code>code &lt;x&gt;</code>');
eq('删除线', '~~删除~~', '<s>删除</s>');
eq('链接', '[链接](https://example.com)', '<a href="https://example.com" target="_blank" rel="noopener">链接</a>');
eq('原始 HTML 被转义', '<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;');
eq('加粗内含斜体', '**a *b* c**', '<strong>a <em>b</em> c</strong>');
eq('混合标记', '**a** 和 *b* 与 `c`', '<strong>a</strong> 和 <em>b</em> 与 <code>c</code>');
eq('普通文本不变', 'check，sync rui，materials', 'check，sync rui，materials');
eq('不配对的星号保留', '2**3 运算', '2**3 运算');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

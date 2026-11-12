import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { addAttachment, checkAttachments, destinations, inventory, repairAttachments } from './attachments.mjs';

const notePath = 'src/content/blog/public/文章.md';
async function fixture(t, body = '') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openlink-attachments-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  async function write(name, content) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
    return file;
  }
  await write(notePath, body);
  return { root, write, read: (name) => fs.readFile(path.join(root, name), 'utf8') };
}

test('ingestion creates the article folder, preserves source, reuses bytes and protects collisions', async (t) => {
  const { root, write, read } = await fixture(t, '---\ntitle: 不同标题\n---\n正文');
  await write('temp/a.png', 'image A');
  const first = await addAttachment(root, notePath, 'temp/a.png', '照片 (1)#.png');
  assert.equal(first.file, 'src/content/attachment/文章/照片 (1)#.png');
  assert.equal(first.markdown, '![](../../attachment/文章/照片%20%281%29%23.png)');
  assert.equal(await read('temp/a.png'), 'image A');
  const again = await addAttachment(root, notePath, 'temp/a.png', 'different.png');
  assert.equal(again.file, first.file);
  await write('temp/b.png', 'image B');
  const collision = await addAttachment(root, notePath, 'temp/b.png', '照片 (1)#.png');
  assert.match(collision.file, /-2\.png$/);
  assert.equal(await read(first.file), 'image A');
  assert.equal(await read(collision.file), 'image B');
  assert.match(await read(notePath), /正文$/);
});

test('empty input, unsafe name, format rename and duplicate note names fail before import', async (t) => {
  const { root, write } = await fixture(t);
  await write('temp/a.png', '');
  await assert.rejects(addAttachment(root, notePath, 'temp/a.png'), /empty/);
  await write('temp/a.png', 'A');
  await assert.rejects(addAttachment(root, notePath, 'temp/a.png', '../a.png'), /filename/);
  await assert.rejects(addAttachment(root, notePath, 'temp/a.png', 'CON.png'), /filename/);
  await assert.rejects(addAttachment(root, notePath, 'temp/a.png', 'a.jpg'), /extension/);
  await write('src/content/projects/文章.md', '');
  await assert.rejects(addAttachment(root, notePath, 'temp/a.png'), /Duplicate/);
});

test('repair handles URI filenames, fragments, titles, CRLF and preserves code examples', async (t) => {
  const body = '---\r\ncoverImage: "../../attachment/a%20%231.png"\r\n---\r\n正文\r\n![说明](../../attachment/a%20%231.png#detail "标题")\r\n`![](../../attachment/a%20%231.png)`\r\n```markdown\r\n![](../../attachment/a%20%231.png)\r\n```\r\n';
  const { root, write, read } = await fixture(t, body);
  await write('src/content/attachment/a #1.png', 'original bytes');
  assert.equal((await repairAttachments(root, notePath)).length, 1);
  assert.equal(await read(notePath), body);
  const result = await repairAttachments(root, notePath, true);
  assert.equal(result[0].status, 'moved');
  const updated = await read(notePath);
  assert.equal(updated, body.replace('coverImage: "../../attachment/', 'coverImage: "../../attachment/文章/').replace('![说明](../../attachment/', '![说明](../../attachment/文章/'));
  assert.equal(await read('src/content/attachment/文章/a #1.png'), 'original bytes');
  assert.equal(await fs.stat(path.join(root, 'src/content/attachment/a #1.png')).catch(() => null), null);
  assert.deepEqual((await checkAttachments(root, notePath)).errors, []);
  assert.deepEqual(await repairAttachments(root, notePath, true), []);
});

test('whole-vault ownership protects shared media even when another note uses a shortest wikilink', async (t) => {
  const { root, write, read } = await fixture(t, '![](../../attachment/a.png)');
  await write('src/content/blog/private/另一篇.md', '![[a.png|300]]');
  await write('src/content/attachment/a.png', 'A');
  const result = await repairAttachments(root, notePath, true);
  assert.equal(result[0].status, 'shared-skipped');
  assert.equal(result[0].owners.length, 2);
  assert.equal(await read('src/content/attachment/a.png'), 'A');
  assert.equal(await read(notePath), '![](../../attachment/a.png)');
});

test('repair disambiguates a collision without overwriting the existing article attachment', async (t) => {
  const { root, write, read } = await fixture(t, '![](../../attachment/a.png)');
  await write('src/content/attachment/a.png', 'new');
  await write('src/content/attachment/文章/a.png', 'old');
  await repairAttachments(root, notePath, true);
  assert.equal(await read(notePath), '![](../../attachment/文章/a-2.png)');
  assert.equal(await read('src/content/attachment/文章/a.png'), 'old');
  assert.equal(await read('src/content/attachment/文章/a-2.png'), 'new');
});

test('checker understands covers, reference definitions, HTML, galleries and wiki media', async (t) => {
  const body = `---
coverImage: "../../attachment/文章/a.png" # cover
---
![图][photo]
[photo]: <../../attachment/文章/a.png> "caption"
<img src="../../attachment/文章/a.png">
![[a.png|200]]
~~~gallery
![](../../attachment/文章/a.png)
../../attachment/文章/a.png
~~~
<!-- ![](../../attachment/missing.png) -->
<!--
![](../../attachment/missing.png)
-->
\`![](../../attachment/missing.png)\`
\`\`\`markdown
![](../../attachment/missing.png)
\`\`\`
![](https://example.com/remote.png)
`;
  const { root, write } = await fixture(t, body);
  await write('src/content/attachment/文章/a.png', 'A');
  const report = await checkAttachments(root, notePath);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(report.references, 6);
  assert.ok(destinations(body).every((r) => body.slice(r.start, r.end) === r.raw));
});

test('checker reports missing, ambiguous and misplaced media; unused files are retained warnings', async (t) => {
  const { root, write, read } = await fixture(t, '![](../../attachment/missing.png)\n![[a.png]]\n![](../../attachment/另一篇/b.png)');
  await write('src/content/attachment/文章/a.png', 'A');
  await write('src/content/attachment/另一篇/a.png', 'B');
  await write('src/content/attachment/另一篇/b.png', 'C');
  await write('src/content/attachment/文章/unused.png', 'D');
  await write('src/content/attachment/unowned.png', 'E');
  const report = await checkAttachments(root, notePath);
  assert.ok(report.errors.some((e) => e.includes('missing')));
  assert.ok(report.errors.some((e) => e.includes('ambiguous')));
  assert.ok(report.errors.some((e) => e.includes('expected attachment/文章/')));
  assert.ok(report.warnings.some((e) => e.includes('unused.png')));
  assert.ok((await checkAttachments(root)).errors.some((e) => e.includes('loose root')));
  assert.equal(await read('src/content/attachment/unowned.png'), 'E');
});

test('explicit relative Markdown paths stay strict while vault-relative wiki paths resolve', async (t) => {
  const { root, write } = await fixture(t, '![](../../../attachment/文章/a.png)\n![[attachment/文章/a.png]]');
  await write('src/content/attachment/文章/a.png', 'A');
  const state = await inventory(root);
  const refs = state.notes.find((n) => n.name === '文章').refs;
  assert.equal(refs[0].matches.length, 0);
  assert.equal(refs[1].matches.length, 1);
});

test('import refuses an attachment directory symlink escaping the content tree', async (t) => {
  const { root, write } = await fixture(t);
  await write('outside/keep.txt', 'safe');
  await write('temp/a.png', 'A');
  await fs.mkdir(path.join(root, 'src/content/attachment'), { recursive: true });
  try { await fs.symlink(path.join(root, 'outside'), path.join(root, 'src/content/attachment/文章'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Symlinks unavailable'); return; } throw error; }
  await assert.rejects(addAttachment(root, notePath, 'temp/a.png'), /outside/);
  assert.equal(await fs.stat(path.join(root, 'outside/a.png')).catch(() => null), null);
});

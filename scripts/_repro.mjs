// 临时复现：用真实插件处理 gallery 块，打印容器输出
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { remarkGalleryPlugin, remarkObsidianImages } from './remark-obsidian-media.mjs';

const filePath = 'D:/03-开合/OpenLink/src/content/projects/Hainan-TouristStation/海南驿站.md';
const md = [
  '```gallery',
  '![](1.jpg)',
  '![](13.jpg)',
  '![](16.jpg)',
  '```',
].join('\n');

const processor = unified().use(remarkParse).use(remarkObsidianImages).use(remarkGalleryPlugin);
const tree = await processor.run(processor.parse(md), { path: filePath });

for (const child of tree.children) {
  if (child.type === 'html') console.log('HTML:', child.value.slice(0, 1200));
  else console.log(child.type);
}

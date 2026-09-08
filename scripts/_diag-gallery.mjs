// 临时诊断脚本：检查各项目 gallery 图片的比例读取情况
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const PUBLIC_IMAGES_ROOT = path.join(ROOT, 'public', 'project-images');

async function check(publicUrl) {
  if (!publicUrl || publicUrl.startsWith('http') || publicUrl.startsWith('data:')) {
    return 'EXTERNAL';
  }
  const relative = decodeURIComponent(publicUrl).replace(/^\/project-images\//, '');
  const filePath = path.join(PUBLIC_IMAGES_ROOT, relative);
  if (!existsSync(filePath)) return 'MISSING: ' + relative;
  const meta = await sharp(filePath, { limitInputPixels: false }).metadata();
  return meta.width + 'x' + meta.height;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function inspectProject(relDir, mdFile) {
  const md = readFileSync(mdFile, 'utf8');
  const blocks = [...md.matchAll(/```gallery\n([\s\S]*?)```/g)];
  console.log(`\n=== ${relDir} : ${blocks.length} blocks ===`);
  for (const b of blocks) {
    const imgs = [...b[1].matchAll(/!\[\]\((.*?)\)/g)].map((x) => x[1]);
    console.log(`--- block ${imgs.length} imgs ---`);
    for (const raw of imgs) {
      const decoded = decodeURIComponent(raw).split('/').pop();
      if (!decoded) { console.log(raw, '-> NULL'); continue; }
      const base = decoded.replace(/\.[^.]+$/, '');
      const abs = path.join(PUBLIC_IMAGES_ROOT, relDir, 'images');
      const entries = existsSync(abs) ? readdirSync(abs) : [];
      const variants = entries
        .filter((n) => n.match(new RegExp('^' + escapeRegExp(base) + '-(\\d+)w\\.webp$')))
        .sort((a, b) => parseInt(a.match(/(\d+)w/)[1], 10) - parseInt(b.match(/(\d+)w/)[1], 10));
      const src = variants.length
        ? `/project-images/${relDir}/images/${encodeURIComponent(variants[variants.length - 1])}`
        : `/project-images/${relDir}/images/${encodeURIComponent(decoded)}`;
      console.log(' ', decoded, '->', await check(src));
    }
  }
}

const jobs = [
  ['Hainan-TouristStation', 'src/content/projects/Hainan-TouristStation/海南驿站.md'],
  ['NanXin-Factory', 'src/content/projects/NanXin-Factory/南星厂房外立面改造.md'],
  ['Xinjiang_Museum', 'src/content/projects/Xinjiang_Museum/新疆丝绸之路陶瓷博物馆.md'],
  ['', 'src/content/blog/地产项目配合随记.md'],
];

for (const [rel, md] of jobs) await inspectProject(rel, md);
console.log('\ndone');

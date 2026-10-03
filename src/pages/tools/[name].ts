import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * /tools/[name] — 原样返回 src/content/tool/ 下的 HTML 小工具
 *
 * 静态生成：每个工具输出一个纯静态 HTML 页面（内容在构建时读取内联），
 * 不依赖运行时文件系统，部署后可直接访问。
 * 新增工具只需把 .html 文件放进 src/content/tool/ 目录。
 *
 * 路径用 process.cwd() 锚定项目根：dev 与 build（含 Netlify/双机）cwd 都是项目根，
 * 避免 import.meta.url 在 build 时被解析到 dist/content/tool。
 */

const TOOL_DIR = join(process.cwd(), 'src/content/tool');

export function getStaticPaths() {
  const files = readdirSync(TOOL_DIR).filter((f) => f.endsWith('.html'));
  return files.map((file) => ({
    params: { name: file.replace(/\.html$/i, '') },
    props: { file },
  }));
}

export async function GET({ props }: { props: { file: string } }) {
  const html = readFileSync(join(TOOL_DIR, props.file), 'utf-8');
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

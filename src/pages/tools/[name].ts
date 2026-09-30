import { readFileSync, readdirSync } from 'node:fs';

/**
 * /tools/[name] — 原样返回 src/content/tool/ 下的 HTML 小工具
 *
 * 静态生成：每个工具输出一个纯静态 HTML 页面（内容在构建时内联），
 * 不依赖运行时文件系统，部署后可直接访问。
 * 新增工具只需把 .html 文件放进 src/content/tool/ 目录。
 */

const TOOL_DIR = new URL('../../content/tool/', import.meta.url);

export function getStaticPaths() {
  const files = readdirSync(TOOL_DIR).filter((f) => f.endsWith('.html'));
  return files.map((file) => ({
    params: { name: file.replace(/\.html$/i, '') },
    props: { file },
  }));
}

export async function GET({ props }: { props: { file: string } }) {
  const html = readFileSync(new URL(props.file, TOOL_DIR), 'utf-8');
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
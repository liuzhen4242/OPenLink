# OpenLink

建筑与设计作品集 / 博客站点，基于 Astro 静态生成，内容直接来自 Obsidian Markdown。

## 常用命令

```sh
npm install     # 安装依赖（需 Node ≥ 22.12）
npm run dev     # 本地预览（先同步图片/媒体到 public/project-images）
npm run build   # 生产构建
npm run preview # 本地预览构建产物
```

## 内容结构

`src/content/` 同时是 Obsidian vault 与 Astro content collections 的数据源：

- `blog/*.md` — 博客文章（frontmatter 支持 `status: public | private | hidden`）
- `projects/<项目>/<项目>.md` — 项目详情
- `blog/images/`、`projects/<项目>/images/` — 图片与视频附件

附件会在 `npm run dev` / `npm run build` 时由 `scripts/sync-project-images.mjs`
压缩成响应式 webp；视频等文件原样拷贝到 `public/project-images/`。

## 媒体说明

- Markdown 图片 `![](images/xxx.png)` 会自动改写为 `/project-images/...` 响应式图。
- Markdown 视频 `![](images/xxx.mp4)` 会输出为 `<video controls>`，
  宽度铺满、高度按视频真实比例自适应（无黑边）。
- Obsidian 端通过 `src/content/.obsidian/snippets/video-embed-fix.css`
  （需在 设置 → 外观 → CSS 片段 中开启）保持同样的显示效果。

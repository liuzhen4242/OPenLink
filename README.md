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

- `blog/<分类>/*.md` — 博客文章（frontmatter 支持 `status: public | private | hidden`）
- `projects/*.md` — 项目详情
- `attachment/<Markdown 文件名>/` — 每篇文章自己的图片与视频附件

附件会在 `npm run dev` / `npm run build` 时由 `scripts/sync-project-images.mjs`
压缩成响应式 webp；视频等文件原样拷贝到 `public/project-images/`。

## 媒体说明

- Markdown 图片 `![](../../attachment/文章名/xxx.png)` 会自动改写为 `/project-images/...` 响应式图（相对层级取决于文章位置）。
- Markdown 视频 `![](../../attachment/文章名/xxx.mp4)` 会输出为 `<video controls>`，
  宽度铺满、高度按视频真实比例自适应（无黑边）。
- Obsidian 端通过 `src/content/.obsidian/snippets/video-embed-fix.css`
  （需在 设置 → 外观 → CSS 片段 中开启）保持同样的显示效果。

## AI / 外部工具添加附件

在仓库根目录运行：

```sh
npm run attachments:add -- --note "src/content/blog/public/空置房研究.md" --file "临时目录/图片.png"
npm run attachments:check -- --note "src/content/blog/public/空置房研究.md"
```

入库命令按 Markdown 文件名创建附件目录，复制图片并输出可插入正文的 `markdown` 链接；可用 `--name` 指定文件名。原输入保留，重复内容复用，同名不同内容增加后缀。正文的插入位置由编辑者选择。

检查支持 Markdown 媒体链接、引用定义、Obsidian 嵌入、HTML 的 src/href、单行封面字段，以及 gallery/gallery2 中的媒体；忽略普通代码块、行内代码及 HTML 注释。外链不入库。找不到的附件、错误归档位置和歧义引用返回非零退出码，未引用素材仅警告并保留。多行 YAML 媒体列表等复杂写法需人工核对。省略 `--note` 可检查整个内容库；定向检查只报告该文章的问题，不受其他文章的历史问题影响。

修复某篇文章引用的根目录散图：

```sh
npm run attachments:fix -- --note "src/content/blog/public/空置房研究.md"
npm run attachments:fix -- --note "src/content/blog/public/空置房研究.md" --apply
```

默认只显示计划；`--apply` 才执行。工具扫描全库引用，跳过共用附件，复制验证后原子更新文章，最后移除已无引用的根目录原文件。保留未引用素材，不猜测其他目录中的错误路径。修复后再次执行定向检查。构建过程不会自动整理源文件。

`npm run test:attachments` 验证入库、冲突保护、引用解析及修复流程。

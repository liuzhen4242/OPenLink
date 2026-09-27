---
title: "OpenLink 博客写作指南"
titleEn: "OpenLink Blog Writing Guide"
date: "2026-09-12"
description: "OpenLink 博客写作速查模板：frontmatter、文件夹结构、注释、gallery 轮播、视频嵌入、文章互链。所有元素都是本站真实支持的能力，照着写即可。本文会随网页优化持续更新。"
author: "zhenliu"
category:
  - 日志
  - 学习
status: "public"
---

这篇是 OpenLink 的写作指南模板，目标是"想写任何东西都能照抄结构"。每个元素都经过本站渲染代码实测：**frontmatter 字段、文件夹结构、注释语法、gallery 轮播、视频、文章互链**。随网页优化不断更新，遇到新能力就加一节。

---

## 1. 文件与 frontmatter

### - 文件夹结构（和项目一致）

每篇博客文章一个独立文件夹，放在 `src/content/blog/public/` 下：

```
src/content/blog/
  public/
    我的文章/
      images/              ← 这篇文章的图片、视频都放这里
        封面.png
        图1.jpg
      我的文章.md           ← 文章本体
    另一篇文章/
      images/
      另一篇文章.md
  draft/                   ← 草稿（线上不显示）
```

- 新建文章：在 `public/` 下建一个**和文章同名的文件夹**，里面建 `images/` 子文件夹，再把 `.md` 文件放进去
- Obsidian 粘贴图片时，自动存入当前文章的 `images/` 文件夹（Obsidian 设置：附件 → 当前文件夹下 → images）
- 网址 = 文件夹名，例如 `public/我的文章/我的文章.md` → `/blog/我的文章/`

### - frontmatter 模板

```markdown
// src/content/blog/public/示例文章/示例文章.md —— frontmatter 模板
---
title: 文章中文标题             # 必填：主标题，SEO 用；H1 用这个（不再有 name）
titleEn: Article English Title  # 可选：英文标题，目录顶部优先显示
date: 2026-09-12              # 可选：一律 "YYYY-MM-DD"；不写则取文件修改日期
description: 一句话摘要         # 可选
author: 
  - zhenliu                # 可选，默认 zhenliu；单作者写字符串，多作者写数组
category:
  - 学习                         # 可选，可多个；任意字符串
status: public                 # public/private/hidden/draft，默认 public
update: 2026-09-13             # 可选：不写则自动识别文件修改日期（upd YYMMDD）
notes:                           # 可选：右栏引注（旧式写法，推荐用花括号语法见第 3 节）
  - 第一条引注
---
```

**字段说明**：
- `title` 必填，中文主标题，页面 H1 与 SEO 都用它（**已去掉 `name` 字段**，旧文章的 name 已并入 title）
- `titleEn` 可选，英文标题，左侧目录顶部显示（项目文章同理：中文 title + 英文 titleEn）
- `date` 可选，带引号或不带引号都可以，一律 `YYYY-MM-DD`
- `update` 可选，不写自动取文件最后修改日期
- 引号可用可不用：`title: 文章中文标题` 与 `title: "文章中文标题"` 等效

### - 可见性 status

| status | 效果 |
|---|---|
| `public` | 正常公开，放 `public/` 文件夹 |
| `private` | 线上列表隐藏，独立页走 `/blog/private/` 密码路径 |
| `hidden` | 线上彻底不生成页面，仅本地 dev 可见 |
| `draft` | 草稿，放 `draft/` 文件夹，线上列表隐藏 |

---

## 2. 标题与目录

- 正文**不要再写 `#`**：H1 由 frontmatter 的 `title` 自动生成
- 章节用 `##`，子章节用 `###`——两者自动进入左侧标题树（`###` 自动缩进折叠）
- 标题层级连续递进，不要从 `####` 起步

```markdown
## 项目背景

### 场地条件
```

---

## 3. 注释：`{范围|注释}` 一个语法搞定

想注释什么就写进花括号，竖线后是注释内容。范围完全由你决定：词、短语、整句都可以，下划线只画在包裹范围下面。

```markdown
所谓{参数化|用参数驱动形态生成}设计，核心是……

要达到{庖丁解牛|出自《庄子》，指技艺纯熟}的境界，需要反复练习。

{这里整句话都需要补充背景。|这句话的背景说明……}
```

规则三条：

- `{被注释的文字|注释内容}`：花括号内是范围，竖线后是注释
- 序号（1、2、3…）**自动生成**，注释自动进右栏
- 点击带下划线的词，正文词和右栏注释同时灰底高亮，1.8 秒后消退

**兼容旧写法**：frontmatter `notes:` 数组仍能显示；新文章推荐花括号语法。不要用 Markdown 脚注 `[^1]:`，本站不渲染。

---

## 4. 图片与 gallery 轮播

### - 单张图片

```markdown
![建筑渲染图](images/渲染图.png)
```

图片放当前文章文件夹的 `images/` 里，正文写相对路径 `images/文件名`。图片自动响应式压缩 + 点击全屏灯箱。

### - 多图轮播 gallery

把多张图包进 ```gallery 代码块，自动变成轮播 + 灯箱：

````markdown
```gallery
![](images/方案一.png)
![](images/方案二.png)
![](images/方案三.png)
```
````

- 多图自动轮播（每张 1 秒，悬停暂停），点击进全屏灯箱
- 容器比例构建期自动按"最瘦图"内联，加载不跳动

#### 修改轮播速度

轮播间隔在 `src/components/MediaGallery.astro`：

```js
// 1000ms = 每张停留 1 秒，改这里调整轮播速度
window.setTimeout(tick, 1000);
```

---

## 5. 视频

### - 本地视频文件（mp4 等）

直接放进当前文章的 `images/` 文件夹，用图片语法引用：

```markdown
![](images/方案动画.mp4)
```

### - 外链视频（B 站 / YouTube 等）

直接嵌 HTML iframe：

```html
<div class="relative w-full aspect-video rounded-xl overflow-hidden border my-6">
  <iframe src="https://player.bilibili.com/player.html?bvid=xxxx&page=1"
    class="absolute top-0 left-0 w-full h-full border-0" allowfullscreen></iframe>
</div>
```

---

## 6. 文章之间相互引用

用**标准 Markdown 链接**（不要用 Obsidian 的 `[[]]` 双链，网页不渲染）。

### - 引用另一篇博客文章

```markdown
完整工作流见[Turtle 插件开发要点](/blog/Turtle%20插件开发要点)。
```

链接路径 = `/blog/` + 文章文件夹名（空格用 `%20`）。

### - 引用项目

```markdown
材料用法的完整总结见[海南游客驿站](/projects/Hainan-TouristStation)。
```

---

## 7. 写作检查清单

写完后逐条核对：

- [ ] 文章放在 `public/` 下，有同名文件夹和 `images/` 子文件夹
- [ ] frontmatter 必填 `title`（已无 `name` 字段，H1 直接用 title）
- [ ] 正文没有 `#` 一级标题，章节从 `##` 起步
- [ ] 注释用 `{范围|注释}`，没写 Markdown 脚注
- [ ] gallery 用 ```gallery 代码块包多图
- [ ] 图片放当前文章的 `images/`，正文写 `images/文件名`
- [ ] 本地视频用 `![](xxx.mp4)`，外链视频用 iframe
- [ ] 文章互链用 `/blog/...` 与 `/projects/...` 标准链接

---

## 8. 版本更新

本文随网页优化持续更新。

### 2026-09-22 (v2.1)

- **frontmatter 统一头部（去掉 `name`）**：所有文章（博客 + 项目）frontmatter 对齐统一模板，删除 `name` 字段；`title` 为中文主标题（H1/SEO），`titleEn` 为英文副标题。项目文章原 `title`（英文）→ `titleEn`，原 `name`（中文）→ `title`；博客文章原 `name` 直接并入 `title`
- 同步修改 `src/content.config.ts`（projects 集合去掉必填 `name`、新增可选 `titleEn`）与页面布局（项目 H1 / 上下篇 / 列表卡片 / 首页 Recent 改用 `title`，标题树顶部英文优先用 `titleEn`）
- `date` / `update` 引号可用可不用；`update:` 空值会被 schema 拒绝，不写或写日期均可

### 2026-09-20 (v2.0)

- **文件夹结构改版**：每篇文章一个独立文件夹（`public/文章名/images/`），和项目结构一致；图片不再集中放 `blog/images/`，而是各放各的
- **`name` 改为可选**：不写自动用 `title` 作 H1，两者重复时只写 `title` 即可
- glob pattern：`src/content.config.ts` blog 集合匹配 `*/*.md` 和 `*/*/*.md`（兼容 draft 单层和 public 双层）
- slug 取路径第二段（文件夹名），URL 保持 `/blog/文章名/` 单层

### 2026-09-12 (v1.0)

- 初版：覆盖 frontmatter、标题层级、注释、图片/gallery、视频、项目信息、文章互链、检查清单。

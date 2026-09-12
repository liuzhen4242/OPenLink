---
title: "OpenLink 博客写作指南"
titleEn: "OpenLink Blog Writing Guide"
name: "OpenLink 博客写作指南"
date: "2026-09-12"
description: "OpenLink 博客写作速查模板：frontmatter、注释、gallery 轮播、视频嵌入、项目信息、文章互链引用。所有元素都是本站真实支持的能力，照着写即可。本文会随网页优化持续更新。"
author: "zhenliu"
category:
  - 日志
  - 学习
status: "public"
---

这篇是 OpenLink 的写作指南模板，目标是"想写任何东西都能照抄结构"。每个元素都经过本站渲染代码实测：**frontmatter 字段、注释语法、gallery 轮播、视频、项目信息、文章互链**。随网页优化不断更新，遇到新能力就加一节。

---

## 1. 文件与 frontmatter

一篇新文章 = 在 `src/content/blog/` 下新建一个 `.md` 文件（扁平目录，**不要建子文件夹**）。文件名会成为网址（slug）。

头部与 Hershel 一致：`title` 写中文主标题、`titleEn` 写英文标题（目录顶部优先显示，缺省回退 title），`name` 写页面 H1 大标题（一般同中文标题）。

```markdown
// src/content/blog/示例文章.md —— frontmatter 模板
---
title: "文章中文标题"             # 必填：中文主标题，SEO 用
titleEn: "Article English Title"  # 可选：英文标题，目录顶部优先显示；不写回退 title
name: "文章中文标题"              # 必填：中文标题，页面 H1 大标题
date: "2026-09-12"               # 可选：一律 "YYYY-MM-DD"；不写则取文件修改日期
description: "一句话摘要"         # 可选
author: "zhenliu"                # 可选，默认 zhenliu；多作者写数组 ["a","b"]
category:
  - 学习                        # 可选，可多个；任意字符串，参考：学习/工厂/设计
status: "public"                 # public/private/hidden/draft，默认 public
update: "2026-09-13"             # 可选：不写则自动识别文件修改日期（upd YYMMDD）
notes:                           # 可选：右栏引注（新文章推荐用 {花括号} 语法，见第 3 节）
  - "引注一"
  - "引注二"
---
```

**与 Hershel 的差异**：Hershel 用 `title`（中文）+ `titleEn`（英文）两个字段，H1 显示 `title`；OpenLink 多一个 `name` 字段作 H1（兼容旧文章），`title`/`titleEn` 显示在目录顶部与 SEO。头部效果一致：中文大标题 + 英文目录顶。

### - 可见性 status

| status | 效果 |
|---|---|
| `public` | 正常公开 |
| `private` | 线上列表隐藏，独立页走 `/blog/private/` 密码路径 |
| `hidden` | 线上彻底不生成页面，仅本地 dev 可见 |
| `draft` | 草稿，线上列表隐藏 |

---

## 2. 标题与目录

- 正文**不要再写 `#`**：H1 由 frontmatter 的 `name` 自动生成，目录顶部显示 `title`。
- 章节用 `##`，子章节用 `###`——两者自动进入左侧标题树（`###` 自动缩进折叠）。
- 标题层级连续递进，不要从 `####` 起步。

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

- `{被注释的文字|注释内容}`：花括号内是范围，竖线后是注释；
- 序号（1、2、3…）**自动生成**，注释自动进右栏，悬停上标可看解释；
- 屏幕不够宽时，注释自动落到文章末尾。

### - 实际效果演示

下面是真实渲染的注释效果（不是代码块），把鼠标悬停在带下划线的词上，或看右栏 1: 2: 3: 引注：

所谓{参数化|用参数驱动形态生成}设计，核心是……

要达到{庖丁解牛|出自《庄子》，指技艺纯熟}的境界，需要反复练习。

{这段整句都需要补充背景。|整句注释：花括号包住完整句子，下划线覆盖整个范围}

**兼容旧写法**：早期文章用的 frontmatter `notes:` + `<sup>编号</sup>` 仍能正常显示；新文章推荐花括号语法。不要用 Markdown 脚注 `[^1]:`，本站不渲染。

---

## 4. 图片与 gallery 轮播

### - 单张图片

```markdown
![建筑渲染图](images/渲染图.png)
```

图片会自动做响应式压缩（srcset）+ 点击全屏灯箱（PhotoSwipe）。**图片放哪**：博客文章图片放 `src/content/blog/images/`，正文里写相对路径 `images/文件名`。

### - 多图轮播 gallery

把多张图包进 ```gallery 代码块，自动变成轮播 + 灯箱（把示例路径换成真实图片）：

````markdown
```gallery
![](images/方案一.png)
![](images/方案二.png)
![](images/方案三.png)
```
````

- 多图自动轮播（每张 1s，悬停暂停），点击进全屏灯箱；单图只显示不轮播。
- 容器比例构建期自动按"最瘦图"内联，加载不跳动。

#### 真实轮播演示

下面这个轮播是**真实渲染效果**（用的本站 blog/images 里的图，可直接点击进灯箱看大图）：

```gallery
![](images/商业效果图02.jpg)
![](images/商业效果图03.jpg)
![](images/商业效果图04.jpg)
```

#### 修改轮播速度

轮播间隔在 `src/components/MediaGallery.astro`：

- 第 51、55 行 `window.setTimeout(tick, 1000)`：**1000 = 每张停留 1 秒**，改大放慢、改小加快；
- 第 44 行 `new Promise((resolve) => window.setTimeout(resolve, 8000))`：慢图等待上限 8s，防止图片加载慢时轮播卡死（一般不用改）。

```js
// src/components/MediaGallery.astro 第 51 行 —— 轮播节奏
window.setTimeout(tick, 1000);   // ← 1000ms = 每张停留 1 秒，改这里调整轮播速度
```

### - 项目文章（projects）的图片路径

项目文章在 `src/content/projects/<项目名>/` 子目录下，图片放同目录 `images/`，正文写 `images/文件名`（带 URL 编码如 `Pasted%20image...` 也行）。

```markdown
// src/content/projects/某项目/某项目.md
![](images/照片1.jpg)
```

---

## 5. 视频

两种方式，按场景选：

### - 本地视频文件（mp4 等）

直接把视频文件放进文章图片目录，用图片语法引用，构建期自动转成 `<video controls>`：

```markdown
![](images/方案动画.mp4)
```

### - 外链视频（B 站 / YouTube 等）

直接嵌 HTML iframe，Tailwind 工具类同样生效：

```html
<div class="relative w-full aspect-video rounded-xl overflow-hidden border my-6">
  <iframe src="https://player.bilibili.com/player.html?bvid=xxxx&page=1"
    class="absolute top-0 left-0 w-full h-full border-0" allowfullscreen></iframe>
</div>
```

---

## 6. 项目信息（projects 集合）

项目是独立的内容集合：`src/content/projects/<项目名>/<项目名>.md`，**封面缩略图/小视频是项目列表页才有的能力**（博客列表页目前不显示缩略图）。

### - 项目 frontmatter

```markdown
// src/content/projects/某项目/某项目.md —— frontmatter 模板
---
title: "Project English Title"     # 必填：英文标题
name: "中文项目名"                  # 必填：中文标题
category:
  - 设计                           # 必填：分类
coverImage: "./images/封面图.png"   # 封面缩略图（列表页卡片用）
coverMedia: "./images/封面.mp4"     # 封面小视频，与 coverImage 二选一、优先；mp4/gif 均可
description: "一句话摘要"
date: "2025-02-16"
status: "public"
notes:
  - "引注"
---
```

**封面小视频**：想要项目卡片上是动图效果，用 `coverMedia` 指到 `images/` 下的 mp4，列表页自动"进视口播放、滚出暂停"。

### - 项目信息怎么写

正文底部用 `#### 项目信息` 小节列关键数据，中英对照：

```markdown
#### 项目信息
- 项目类型：厂房 / Project Type: Factory Building
- 完成年份：2025 / Completion Year: 2025
- 建筑面积：139455 m² / Project Area: 139455 m²
- 主要材料：耐候钢、碲化镉光伏 / Materials: Weathering Steel, CdTe PV
```

---

## 7. 文章之间相互引用

用**标准 Markdown 链接**（不要用 Obsidian 的 `[[]]` 双链，网页不渲染）。

### - 引用另一篇博客文章

```markdown
完整工作流见[Turtle 插件开发要点](/blog/Turtle%20插件开发要点)。
```

链接路径 = `/blog/` + 文件名（去 `.md`，空格用 `%20`）。

### - 引用项目

```markdown
材料用法的完整总结见[新疆丝绸之路陶瓷博物馆](/projects/Xinjiang_Museum)。
```

### - 材料单独成文 + 互相引用的推荐模式

项目信息里出现的材料，**单独写一篇材料用法文章**，项目页和材料页互相引用：

```markdown
// 材料用法文章（放 src/content/blog/）
---
title: "Material Notes: CdTe PV"
name: "碲化镉光伏组件材料笔记"
---

本文总结{碲化镉光伏|CdTe 薄膜光伏组件，弱光性能好}的构造与用法……

实际应用案例见[新疆丝绸之路陶瓷博物馆](/projects/Xinjiang_Museum)。
```

```markdown
// 项目页里引用材料文章
- 主要材料：耐热钢、碲化镉光伏 / Materials: ...
  用法详见[碲化镉光伏组件材料笔记](/blog/碲化镉光伏组件材料笔记)。
```

这样：项目页给"案例上下文"，材料页给"可复用知识"，两篇互为入口，读者不会迷路。

---

## 8. 写作检查清单

写完后逐条核对：

- [ ] frontmatter 只有本站字段（title/titleEn/name/category/description/status/notes/author/update/date）
- [ ] title 写中文、titleEn 写英文（可选）、name 写中文 H1
- [ ] 正文没有 `#` 一级标题，章节从 `##` 起步
- [ ] 注释用 `{范围|注释}`，没写 Markdown 脚注
- [ ] gallery 用 ```gallery 代码块包多图，不用普通多张 `![]()` 堆叠（除非想要单图效果）
- [ ] 本地视频用 `![](xxx.mp4)`，外链视频用 iframe
- [ ] 文章互链用 `/blog/...` 与 `/projects/...` 标准链接
- [ ] 图片路径存在，空格用 `%20` 或直接保留（构建期会自动修空格）

---

## 9. 版本更新

本文随网页优化持续更新，每次新增/变更能力在此记录。

### 2026-09-12 (v1.0)

- 初版：覆盖 frontmatter、标题层级、注释、图片/gallery、视频、项目信息、文章互链、检查清单。
- 依据：`src/content.config.ts`（schema）、`src/pages/blog/[...slug].astro`（三栏渲染）、`scripts/remark-obsidian-media.mjs`（gallery/图片/视频插件）、`src/pages/projects/index.astro`（封面缩略图/小视频）。

### 2026-09-12 (v1.1)

- **头部与 Hershel 一致**：frontmatter 支持 `titleEn` 英文标题（目录顶部优先显示、SEO 用，缺省回退 title）；`name` 仍是页面 H1。同步改了 `src/content.config.ts`（schema 加 titleEn）与 `src/pages/blog/[...slug].astro`（渲染 headerTitle）。
- 注释章节新增**真实效果演示**（悬停下划线词 / 右栏引注）。
- gallery 章节新增**真实轮播演示**（用 `src/content/blog/images/商业效果图*.jpg`），并写明轮播速度修改位置（`src/components/MediaGallery.astro` 第 51/55 行 `setTimeout(tick, 1000)`）。

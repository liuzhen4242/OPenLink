---
title: Web Development Log
name: Web 开发日志
category:
  - web
  - test
  - 张三
description: web开发中的问题记录
date: 2026-09-04
status: public
---

### 媒体加载优化
#### 视频自适应
```html
<!-- 视频嵌入：宽度100%自适应，高度按比例自动计算，无黑边 -->
<video class="w-full h-auto" controls muted loop>
  <source src="/videos/xxx.mp4" type="video/mp4">
</video>
```
- 用 `w-full h-auto` 替代固定高度，宽度撑满容器，高度自动按视频比例计算，不会出现上下黑边。
- 长视频用对象存储外链嵌入，不打包进站点，加快首屏加载。

#### Gallery 图片加载
```astro
// src/components/MediaGallery.astro：图片懒加载与多尺寸适配
<img
  src={img.src}
  srcset={img.srcset}
  sizes="(max-width: 1280px) 100vw, 1280px"
  loading="lazy"
  decoding="async"
/>
```
- 构建期自动生成 480/768/1280/1920 四档响应式图片，浏览器按屏幕宽度选最合适的尺寸加载。
- `loading="lazy"` 滚动到可视区才加载，避免首屏一次性请求所有大图。
- 容器内联 `aspect-ratio` 固定高度，切换图片零布局抖动（CLS=0）。
- {坑|改完 remark 图片插件后必做}：删除 `node_modules/.astro/data-store.json` 缓存再重新 build，否则旧图片路径不更新。

#### Gallery 轮播速度调整
```js
// src/components/MediaGallery.astro 第51、55行：轮播切换间隔
window.setTimeout(tick, 3000);
```
- 数字单位是毫秒，当前 3000 = 3秒切换一张图
- 想加快播放就改小，比如 `2000`（2秒一张）
- 想放慢就改大，比如 `5000`（5秒一张）
- 鼠标悬停在轮播上自动暂停，移开后继续播放。




### 排版相关
#### 三栏骨架与宽度调整
参考 Herschel 博客三栏结构，调整要点如下：

**整体最大宽度**

```css
// src/layouts/BaseLayout.astro 第73行：全局内容区最大宽度
--max-w: 1280px;
```
- 控制整个页面内容区最大宽度，数值越大页面越宽，超出后自动居中。

**三栏列宽比例**

```js
// src/pages/projects/[...slug].astro 第83行：三栏 grid 列定义
const gridCols = 'lg:grid-cols-[min(220px,20vw)_1fr_200px]';
```
- 三列依次为：
  - `220px`：左目录栏宽度，调小正文自动变宽
  - `1fr`：中间正文栏，自动占满剩余空间
  - `200px`：右注释栏宽度，调小正文自动变宽
- {坑|正文不跟随列宽变宽的常见问题}：中间 `<article>` 之前自带 `max-w-2xl`（固定672px），会锁死正文宽度，需要改成：

```html
<!-- src/pages/projects/[...slug].astro 第198行：正文容器 -->
<article class="w-full min-w-0">
```

**栏间距**

```html
<!-- src/pages/projects/[...slug].astro 第87行：grid 容器 gap -->
<div class="grid ... lg:gap-12">
```
- 同时控制左右两个栏间距，Tailwind 单位：`gap-6`=24px，`gap-8`=32px，`gap-12`=48px。

**左右视觉对称**
```html
<!-- src/pages/projects/[...slug].astro 第141行：左目录栏内边距 -->
<aside class="... pr-4 border-r ...">
```
```html
<!-- src/pages/projects/[...slug].astro 第231行：右注释栏内边距 -->
<aside class="... pl-4 ...">
```
- 左目录栏右内边距 `pr-4`、右注释栏左内边距 `pl-4`，两个值保持一致，视觉间隙才对称；之前右边是 `pl-6` 比左边宽8px，导致不对称。

#### 顶部导航与下划线
```css
// src/components/Navbar.astro：OPENLINK 对齐正文的左偏移
.nav-inner {
  padding-left: calc(原避让值 + 220px + 3rem);
}
```
- 桌面端 OPENLINK 右移，刚好对齐中间正文栏标题左边界。

```css
// src/components/Navbar.astro：导航白色背景，左边留空不遮挡主题按钮
nav {
  background: linear-gradient(to right,
    transparent 0,
    transparent calc(正文左偏移值),
    var(--c-bg) calc(正文左偏移值),
    var(--c-bg) 100%
  );
}
```
- 左边目录栏上方透明，黑白按钮滚动时不被导航白色块遮挡。

```css
// src/components/Navbar.astro：顶部下划线宽度，和正文头部分隔线同宽
.nav-rule {
  margin-left: calc(居中边距 + 220px + 3rem);
  margin-right: calc(居中边距 + 200px + 3rem);
}
```
- 下划线左右收窄，刚好和正文里"分类、日期"下面的分隔线左右对齐。

**主题切换按钮位置**
```html
<!-- src/pages/projects/[...slug].astro 第89行：左栏吸顶位置 -->
<div class="... sticky top-[3.5rem] ...">
```
- `top-[3.5rem]` 控制黑白按钮滚动时停留位置，调整数值让它和 OPENLINK 水平对齐。

#### 目录折叠与高亮
```html
<!-- 侧边导航箭头：有子项才显示，无任何子项不显示 -->
.toc-parent::before { content: '▾'; }
.toc-parent:not([data-toc-parent])::before { display: none; }
```
- 折叠时箭头旋转90度变向右，展开时向下。

```js
// IntersectionObserver 滚动高亮当前章节
new IntersectionObserver(callback, {
  rootMargin: '-80px 0px -70% 0px'
});
```
- 当前章节导航项自动变黑色，顶部标题同步变灰；页面回顶时清除高亮，顶部标题变黑。
- 点击导航项立刻高亮，不等平滑滚动结束。

### 文章可见性控制
```yaml
# frontmatter 中 status 字段控制文章可见性
status: public  # 公开：所有人可见，列表页正常展示
# status: private  # 私密：线上列表页隐藏，通过密码保护的 /blog/private/ 路径访问
# status: hidden   # 隐藏：线上完全不生成页面，仅本地 dev 可见
# status: draft    # 草稿：仅本地编辑，不发布
```
- 本地 dev 环境默认显示所有状态文章，方便自己编辑预览。
- 线上 build 时自动按 status 过滤：hidden 不生成页面，private 走密码保护路径。
- 新增文章默认 `public`，不需要手动写。

### 文章 Frontmatter 模板
所有博客文章开头统一使用以下模板：

```yaml
---
title: English Title        # 英文标题：SEO、副标题、侧边导航用
name: 中文标题               # 中文标题：页面大标题、列表页显示
category:
  - web                     # 分类标签，可写多个
  - 设计
description: 一句话描述文章内容  # 列表页摘要、SEO 描述
date: 2026-09-10            # 发布日期
status: public              # 可见状态
coverImage: ./images/xxx.png # 可选：封面图
---
```

- 中文名 `name` 是页面显示的大标题，英文 `title` 是文章副标题和 URL slug。
- 分类标签自由添加，列表页自动汇总筛选，不需要在代码里注册。





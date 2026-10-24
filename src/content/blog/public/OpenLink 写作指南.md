---
title: OpenLink 写作指南
titleEn: OpenLink Blog Writing Guide
date: 2026-09-12
update: 2026-10-24
description: OpenLink 博客写作速查模板：frontmatter、文件夹结构、注释、gallery 轮播、视频嵌入、文章互链。所有元素都是本站真实支持的能力，照着写即可。本文会随网页优化持续更新。
author:
  - zhenliu
category:
  - 日志
status: public
---

这篇是 OpenLink 的写作指南模板，目标是"想写任何东西都能照抄结构"。每个元素都经过本站渲染代码实测：**frontmatter 字段、文件夹结构、注释语法、gallery 轮播、视频、文章互链**。随网页优化不断更新，遇到新能力就加一节。

---

## 1. 文件与 frontmatter

### 附件逻辑（和项目一致）

文章文件与{附件|Obsidian 粘贴图片时，Custom Attachment Location 自动存入库根 `attachment/{{noteFileName}}/`}分离管理，所有文章直接放在对应内容库根目录：

```
content/
	attachment/              ← 所有文章的统一附件根目录
		我的文章/
		    封面.png
		    图1.jpg
	projects/
		项目文章.md             ← 项目文章直接放在 projects/ 根目录
	blog/
		public/
			公开文章.md           ← 公开文章直接放在 public/ 根目录
		private/
			私密文章.md
		softDevelop/
			软件文章.md
```

### 自动模版
- 在 `blog/` 或 `projects/` 中新建文章时，Templater 自动应用 `temple/frontmatter.md`；OpenLink Frontmatter Sync 随后维护标题与日期字段




### - frontmatter 模板

```markdown

---
title:                  # 自动更新，可手动修改
titleEn:                # 自动更新，中文文章可手动填写英文标题
date:                   # 自动使用文件创建日期；可手动修改
update:                 # 自动更新为当天日期
description:
author: 
  - zhenliu
category: 
  - 未分类
status: "public"        # 可选 private hidden draft
# 项目文章可选：填写时取消注释并修改路径
# coverImage: ../attachment/{{noteFileName}}/封面图.png 
# coverMedia: ../attachment/{{noteFileName}}/项目概念动画.mp4 
---
```

**字段说明**：
- 中文文件名自动写入 `title`；英文文件名自动写入 `titleEn`
- 新建文章时自动写入 `date`（创建日期）、`update`（当天）、`author`、`category` 与 `status`
- 每次修改文章时，`update` 会自动更新为当天；文章改名时，自动生成的标题会同步改名，手动改写过的标题不会被覆盖
- `description`、`coverImage`、`coverMedia`、`notes` 都按需手动填写
- 引号可用可不用：`title: 文章中文标题` 与 `title: "文章中文标题"` 等效



### - Obsidian 自动化

- 启用社区插件 **Templater** 与 **OpenLink Frontmatter Sync**；首次启用 Templater 时，在其设置中确认允许“新建文件时触发模板”
- 新建位置限定为 `blog/` 与 `projects/`，不会影响 `attachment/`、`temple/` 或其他笔记
- 已有文章不会在启用时被批量改写；如需补齐已有文章，在命令面板运行 `OpenLink: Sync all article frontmatter`

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

## 3. 排版规范

OpenLink 的文章排版以“层级清楚、灰度克制、图片优先、滚动稳定”为原则。写作时只控制 Markdown 结构，字体、间距和交互由页面统一处理。

### - 标题与字重

- `frontmatter.title` 是页面主标题，正文不要再写 `#` 一级标题。
- 章节使用 `##`，子章节使用 `###`；标题层级连续递进，不要跳级。
- 正文、导航、英文标题和项目信息统一使用系统无衬线字体，中文不使用宋体。
- OpenLink 特别标题字样保留专用字体，不要改成正文黑体。
- 正文使用较轻字重和浅灰色；二级、三级标题使用更深颜色和略高字重，形成层级差异。
- 左侧章节导航、右侧主导航的未激活状态保持浅灰色，激活后加深并适度提升字重。

### - 段落与留白

- 段落之间保持紧凑但不拥挤的稳定间距，不要连续堆叠大量空行。
- 图片与图片之间保留克制的呼吸感；图片说明应紧跟图片。
- 正文图片、视频、Gallery、代码块和表格统一使用圆角风格，不要额外添加冲突的边框或背景。
- 三栏页面的正文列和侧栏由页面统一控制，不要通过文章内容人为改变列宽。

### - 项目信息表格

- 项目信息使用固定字段顺序，中文与英文分为左右两个表格。
- 中英文表格逐行对应，行高和下划线保持水平对齐。
- 标签列与内容列保持紧凑间距，整体随屏幕宽度自适应。
- 信息文字使用较小字号、浅灰色和较轻字重，不额外添加“中文 / English”表头。

### - 导航与索引

- 项目详情页底部只保留上一篇、下一篇两个箭头，不添加文字说明。
- 左侧章节导航和右侧注释索引支持双向定位：点击索引后正文高亮，滚动正文时索引同步激活。
- 不要在正文里手动模拟导航、下划线或激活状态，统一交给页面组件处理。

---

## 4. 注释：`{范围|注释}` 一个语法搞定

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

**注释里也能用 Markdown**：范围里写 `**加粗词**` 会正常加粗显示；注释内容同样支持 **加粗**、*斜体*、`行内代码`、~~删除线~~、[链接](url)，右栏按格式渲染。

```markdown
{**本地仓同步**|check，sync rui，materials，script}   ← 范围加粗
{参数化|**用参数驱动形态生成**，详见[Turtle 插件](/blog/Turtle%20插件开发要点)}   ← 注释里加粗 + 链接
```

**兼容旧写法**：frontmatter `notes:` 数组仍能显示；新文章推荐花括号语法。不要用 Markdown 脚注 `[^1]:`，本站不渲染。

---

## 4. 图片与 gallery 相册

图片可以直接写在正文中，也可以把多张图包进一个 `gallery` 代码块。`gallery` 同时支持轮播和四种静态相册排版，projects 与 blog 页面规则一致。

### - 默认轮播（兼容旧写法）

````markdown
```gallery
![](images/方案一.png)
![](images/方案二.png)
![](images/方案三.png)
```
````

- 默认每张 1 秒，悬停暂停；点击进入全屏灯箱
- 容器比例构建期自动按“最瘦图”内联，加载不跳动

### - 标题与轮播速度

相册标题可有可无；`s` 表示每张照片停留的秒数，最小 0.25 秒，最大 60 秒：

````markdown
```gallery
"施工过程"
"play" s=1.5
![](images/方案一.png)
![](images/方案二.png)
```
````

也可以只在顶部写速度，自动使用 `play`：

````markdown
```gallery
s=2
![](images/方案一.png)
![](images/方案二.png)
```
````

### - 静态相册排版

静态相册使用同一个 `gallery`，模式可选 `iphone`、`archdaily`、`grid`、`photoWall`：

````markdown
```gallery
"Apr 2026"
"archdaily"
![](images/现场一.png)
![](images/现场二.png)
![](images/现场三.png)
```
````

四种排版共用 16:9 画布、间距、圆角、黑白主题和 PhotoSwipe 灯箱。照片较少时会自动适配；超过当前排版容量时不强行压缩，最后一张显示 `+N`，但隐藏照片仍可在点击放大后继续浏览。

`gallery2` 仍作为兼容别名保留，新内容统一使用 `gallery`。标题和模式都可省略：没有模式时默认使用 `play`；旧式只有图片的写法无需修改。

---



## 5. 附件规则
 ### 一、存放规则（Custom Attachment Location）

表格

| 项     | 规则                                                          |
| ----- | ----------------------------------------------------------- |
| 附件目录  | 统一放在库根 `content/attachment/` |
| 子文件夹  | 按**文章名**自动建：`attachment/文章名/` |
| 示例    | 文章《惠州的海》→ 图片存到 `attachment/惠州的海/xxx.png` |
| 自动建目录 | 粘贴 / 拖入图片时自动创建该子文件夹                                         |
| 图片命名  | 保留原文件名（`attachmentRenameMode = None`，不自动改名）                 |
 ### 二、重命名规则（Advanced Rename and Delete Handler）

表格

|触发|行为|
|---|---|
|文章改名 / 移动|同步把 `attachment/旧名/` 改名为 `attachment/新名/`|
|链接更新|自动更新文档里所有图片链接，**不断链**|

### 三、删除 / 清理规则（配套插件）

表格

|触发|行为|
|---|---|
|删除文章|删除它专属的附件|
|清空文件夹|删除后自动清掉空的 `attachment/子文件夹`（`emptyFolderBehavior = Delete`）|
|共享附件|被多篇引用的图不会因删一篇而误删|

> 注意：单独从文档里删掉一张图片**不会**自动删对应文件（避免误删），需要用命令手动清理孤儿图片。


一句话概括：**所有文章直接放在各自内容库根目录，图片统一归档到库根 `attachment/文章名/`；文章改名附件跟着改、链接自动更新；删文章自动清理空文件夹；网站构建会自动找到并转换这些媒体。**



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

- [ ] 文章直接放在 `projects/`、`blog/public/`、`blog/private/` 或 `blog/softDevelop/` 根目录
- [ ] frontmatter 必填 `title`（已无 `name` 字段，H1 直接用 title）
- [ ] 正文没有 `#` 一级标题，章节从 `##` 起步
- [ ] 注释用 `{范围|注释}`，没写 Markdown 脚注
- [ ] gallery 用 ```gallery 代码块包多图
- [ ] 图片放 `attachment/文章名/`，正文使用 Obsidian 自动生成的相对链接
- [ ] 本地视频用 `![](xxx.mp4)`，外链视频用 iframe
- [ ] 文章互链用 `/blog/...` 与 `/projects/...` 标准链接

---

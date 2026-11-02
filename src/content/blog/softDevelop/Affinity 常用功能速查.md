---
title: Affinity 常用功能速查
titleEn: Affinity Quick Tips
date: 2026-10-23
description: 建筑设计工作中高频使用的 Affinity Photo / Publisher 操作速查字典，按工具类 / 显示类 / 布局类分类，直接查询即可。
author:
  - zhenliu
category:
  - soft
  - affinity
status: public
update: 2026-11-02
---

# Affinity 常用功能速查

> 按分类查询，适用于 Affinity Photo / Publisher / Designer V2 / V3 版本。

---

## 工具类

### 污点修复工具（J 工具组）

| 工具名称 | 英文 | 用途 |
|---|---|---|
| 瑕疵去除工具 | Blemish Removal Tool | 一键去除小污点、杂点，最接近 PS 污点修复 |
| 修复画笔 | Healing Brush Tool | Alt 手动采样修复 |
| 图像填充修复笔刷 | Inpainting Brush Tool | 涂抹移除大面积物体，AI 智能填充 |
| 修补工具 | Patch Tool | 圈选区域做替换修复 |

- 仅 Affinity Photo 的 Pixel Persona（像素工作区）可用
- 效果图修脏点优先用 Blemish Removal Tool

### 描边宽度工具

- 名称：**Stroke Width Tool**
- 交互式调整矢量线条粗细，类似 AI 宽度工具

### 布尔运算（Geometry）

| 运算 | 英文 | 作用 |
|---|---|---|
| 相加 | Add | 合并图形，重叠自动融合 |
| 相减 | Subtract | 上层挖掉下层 |
| 交集 | Intersect | 保留相交部分 |
| 异或 | Xor | 保留不重叠，重叠挖空 |
| 分割 | Divide | 按相交线切成小块 |

- 合并两图成一体：`Layer → Geometry → Add`
- 破坏性合并：直接 Add；保留原图可编辑：**按住 Alt 再点 Add**
- 快速交互合并：**Shape Builder Tool**（适合建筑草图）

---

## 显示类

### 描边（Stroke 属性）

- 非独立工具，是右侧 **Stroke 面板**参数
- 可设：粗细、颜色、线端（Stroke Cap）、转角（Stroke Join）
- 线条转实体面：`Layer → Expand Stroke`

---


### 参考线 / 网格显示（预览辅助）

| 显示项 | Windows | Mac |
|---|---|---|
| 边距 Margins | Ctrl + Shift + ; | Cmd + Shift + ; |
| 网格 Grid | Ctrl + ' | Cmd + ' |
| 基线网格 Baseline Grid | Ctrl + Shift + ' | Cmd + Shift + ' |
| 参考线 Guides | Ctrl + ; | Cmd + ; |

- 菜单：View → Show Margins / Show Grid / Show Baseline Grid

## 布局类

### 工具栏自定义

- 打开：**View → Customize Tools**
- 添加：拖拽工具图标到左侧 Toolbox（拖到图标间=放中间，拖到图标上=折叠进组）
- 移除：把图标拖出工具栏外
- 定位：顶部 Search 输入英文名

### 重置左侧工具箱

- 菜单：**View → Customize Tools → Reset Tools**
- 强制：关闭软件后按住 Ctrl 打开，弹窗勾选 Clear User Defaults
- ⚠️ 每个 Persona 独立保存，需分别重置

### 重置右侧面板（Studio）

- 菜单：**Window → Studio → Reset Studio**
- 强制（菜单找不到时）：关闭后按住 Ctrl 打开，弹窗只勾选 Reset Studio

| 操作 | 作用范围 |
|---|---|
| Reset Tools | 左侧工具箱图标 |
| Reset Studio | 右侧所有面板布局 |

- 按 **Tab** 一键隐藏/显示全部 UI

---

## 快捷键速查

| 操作 | 快捷键 |
|---|---|
| 显示/隐藏全部 UI | Tab |
| 切换 Persona | 左上角点击 |
| 修复工具组 | J |
| 钢笔工具 | P |

---

> 持续更新。
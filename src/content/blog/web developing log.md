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

### key world
滚动高亮逻辑
- 滚动高亮逻辑
- 



### 开发进程中的问题待解决


#### 视频自适应问题（ob端）

视频现在有黑边存在，问题是上传的视频不能适配默认比例，高度固定后，宽度就会有黑边，
需求：宽度适配不变，高度自适应，这样就不会有黑边

#### 视频在astro显示问题

1- 目前视频不能在astro显示，因为ob格式的识别问题
2- 视频是否需要进行压缩
3- 长视频如何嵌入

#### gallery适配问题
1- 图片自适应问题：高度不一致时，上下文加载会抖动，
需求：gallery能固定高度，上下文不用每次都重新渲染，只单独更新gallery
- 构建期内联 aspect-ratio（取轮播最瘦图比例）固定容器，切换零重排（无 CLS）
- 图宽度撑满、贴底对齐、背景透明（留白露页面底色，无灰边）
- 
2- web加载图片与 图片上传压缩导致页面打开速度慢问题
- 加载优化：gallery 加 srcset 五档 + sizes + loading=lazy
- 坑：改 remark 插件后须删 node_modules/.astro/data-store.json 再 build

**已解决（2026-09-08）**




### 排版相关
#### 文字排版与页面布局
#### 目录折叠优化

### 私密性测试

### ob 模版
#### 前置元数据模版





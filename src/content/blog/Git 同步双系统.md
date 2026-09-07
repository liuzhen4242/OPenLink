---
title: Git 同步双系统
category:
  - web
description: 手把手教你把 Astro 博客项目用 Git 在 Windows 和 Mac 之间同步：首次推送、克隆、日常提交、拉取、冲突处理与常见问题。
date: 2026-09-01
---

## 主要问题

开合网页项目，可同时在 Windows和Mac 修改可能出现的问题：

- `node_modules` 里带原生编译的组件（图片处理库等），Windows 和 Mac 不通用，拷过去经常跑不起来；
- 拷贝容易混进 `.DS_Store`、`._` 开头的隐藏垃圾文件；


用 Git 同步可天然跨平台。

## 准备工作



```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

4. **Node 版本保持一致**：本项目要求 Node 22.12 以上，推荐用 nvm（Mac）/ nvm-windows 管理，两台都装同一个版本，减少意外。

### 第一步：在 Windows 上把项目首次推送到 GitHub

> 初始化 Git、关联过 GitHub 仓库（origin），身份配好。

### 1. 直接mac拷贝中出现的无效文件

`._` 开头的是 Mac 系统产生的隐藏垃圾文件，从 Mac 拷贝过来时混进了项目里。加一行可以让 Git 永远忽略它们，避免误提交。

```gitignore
# macOS 垃圾文件
._*
```

> 如果不想让 Obsidian 的工作区状态（`src/content/projects/.obsidian/workspace.json`）每次改动都出现在提交列表里，可以再加一行 `.obsidian/workspace.json`。

### 2. 查看当前改动

```bash
git status
```

### 3. 加入暂存区

```bash
git add -A
```

`-A` 表示"新增、修改、删除都算上"。

### 4. 提交（打一个快照）

```bash
git commit -m "提交说明，例如：更新深圳南园项目内容"
```

提交说明用中文或英文都可以，重点是**写清楚这次改了什么**。

### 5. 推送到 GitHub

```bash
git push -u origin main
```

第一次推送会弹出 GitHub 登录窗口，浏览器里授权即可（如果提示用令牌，按 GitHub 给的说明生成一个 Personal Access Token，把令牌当密码粘贴进去）。

推完之后，刷新 GitHub 网页仓库，就能看到你的代码了。

## 第二步：在 Mac 上同步


### 2. 克隆项目

```bash
git clone https://github.com/liuzhen4242/OPenLink.git
```

### 3. 进入项目并安装依赖

```bash
cd OPenLink
npm install
```

> 这一步会自动下载 Mac 对应的原生组件版本，所以完全不用担心跨平台问题。

### 4. 启动本地预览

```bash
npm run dev
```

浏览器打开 `http://localhost:4321` 即可。

## 第三步：日常同步

**在 A 电脑改完代码后：**

```bash
git add -A
git commit -m "说明这次改了什么"
git push
```

**嫌三行麻烦？一条命令搞定（日常最常用）：**

```powershell
git add -A; git commit -m "sync"; git push
```

- Windows 的 PowerShell / Git Bash 都能直接跑；Mac 终端把 `;` 换成 `&&` 即可：`git add -A && git commit -m "sync" && git push`。
- `git add -A` 自动带上新增、修改、删除（`.gitignore` 里的垃圾文件自动跳过）；`"sync"` 是提交说明，想写清楚就换成自己的话。
- 没有任何改动时 `git commit` 会提示 "nothing to commit"，后面的 `git push` 仍会执行并显示 up to date，属正常现象，不用管。

**终极加速：配一次别名，以后只敲两个字符**

```bash
git config --global alias.qq '!git add -A && git commit -m "sync" && git push'
```

配好之后，每次推送只需：

```bash
git qq
```

**在 B 电脑开工前：**

```bash
git pull
```




## 换电脑的恢复流程

任何一台电脑坏了、丢了、重装了，都不用担心：

```bash
git clone https://github.com/liuzhen4242/OPenLink.git
cd OPenLink
npm install
npm run dev
```



## 常用命令速查表

| 查看当前改动 | `git status` |
| 把改动加入暂存 | `git add -A` |
| 提交改动 | `git commit -m "说明"` |
| 推送到 GitHub | `git push` |
| 拉取最新代码 | `git pull` |
| 查看提交历史 | `git log --oneline` |
| 放弃某个文件的修改 | `git checkout -- 文件名` |
| 撤销最近一次提交（保留改动） | `git reset --soft HEAD~1` |

## 常见问题（FAQ）

**Q：推送时提示认证失败？**

GitHub 已不支持密码认证。两种解决办法：推送时弹出的浏览器授权窗口直接登录；或者按 [GitHub 官方文档](https://docs.github.com/zh/authentication) 生成 Personal Access Token，推送时用户名填你的 GitHub 名字，密码填令牌。


**Q：从 Mac 拷到 Windows 后图片全部不显示？**

这是路径兼容问题：项目配置里识别图片目录的代码原本只认 Mac 的路径写法。把 `astro.config.mjs` 里 `getRelativeProjectDir` 函数的开头改成先统一路径分隔符即可（把 `filePath` 里的反斜杠替换成斜杠再查找），改完 Windows 和 Mac 都能正常显示。

## 不公开文档

文章默认公开。不想公开时，在它的 frontmatter 里加一行 `status: xxx`，有三种状态：

| status | 效果 |
|---|---|
| `public`（默认，可省略） | 公开，正常发布 |
| `private` | 网上列表隐藏，独立页移到 `/blog/private/文章名`，访问需密码（浏览器弹登录框） |
| `hidden` | 网上彻底不可见（不生成页面，谁也访问不到），仅本地 `npm run dev` 可见 |

本地 `npm run dev` 时三种状态都能看到，方便自己查看。

**改密码**：编辑项目根目录 `public/_headers` 里的 `Basic-Auth: 用户名:密码`，可写多个账号 `user1:pass1 user2:pass2`。注意密码会随 Git 提交进仓库历史，别用重要密码。

改完 `npm run dev` 本地预览确认，再 `git push` 让 Netlify 自动部署。

> 旧方法参考：把 .md 移进 blog 子文件夹、或文件名加 `_` 前缀，也能让文章不发布，但无法"密码可见"，一般用 `status` 即可。




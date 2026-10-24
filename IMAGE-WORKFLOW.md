# Obsidian 图片与原图

日常继续向 Obsidian 粘贴、拖入图片，附件位置不变：`src/content/attachment/文章名/`。

## 首次使用（每台电脑）

1. 使用项目要求的 Node.js，在网站根目录运行 `npm ci`。
2. Obsidian 打开 `src/content` 文件库，重新加载插件或重启 Obsidian。
3. 在第三方插件中确认 **Local Image Library** 已启用。
4. Mac 从桌面启动 Obsidian 时，插件会尝试 `/usr/local/bin/node`、`/opt/homebrew/bin/node`。如果找不到 Node，在插件设置指定本机 Node 路径。Windows 通常是 `C:\Program Files\nodejs\node.exe`。

在本机 Obsidian 编辑器中粘贴或拖入图片，附件稳定 5 秒后自动处理。插件用本机导入动作的内容指纹识别新图片，**NAS 同步到达的图片不会触发压缩**，避免处理记录尚未同步完成时重复编码。直接从文件管理器复制进附件目录、已有附件、外部软件修改后的图片，可用下方命令补整理。单次任务串行执行；失败会提示，不会静默吞掉图片。

## 文件放在哪里

- `src/content/attachment/文章名/`：文章正式使用的图片，参与 Git。
- `src/content/_originals/attachment/文章名/`：校验过的原图，文件名带内容指纹。**整个 `_originals/` 被 Git 忽略，但请保留极空间同步。** 同名新原图会另存，不覆盖旧原图。
- `src/content/.image-library/`：很小的处理记录，参与 Git，**也请保留极空间同步**。用于识别压缩结果，避免换电脑或 NAS 同步后反复压缩。删除图片不会自动删除原图。

JPEG/PNG/WebP/AVIF 保留文件名和链接。JPEG/WebP 质量 85；PNG 不做有损调色板压缩，保留透明度。按长边 2560 像素缩小，不放大；结果更大时保留原文件。GIF、SVG、动画保持原样，也归档原始文件。PDF、视频、Office 附件不处理。0 字节的空附件保持原样，等待有效内容写入后可重试。

HEIC/HEIF/TIFF 转为 `原文件名.webp`（例如 `IMG_1234.heic.webp`），自动更新真实文章的 Markdown、Obsidian 图片引用、封面和 gallery 内链接；普通代码示例不改。转换使用跨平台 Node 依赖。2560 是入库母版尺寸，网站仍按原有管线生成展示尺寸。

`npm run dev` / `npm run build` 会检查附件变更并刷新 Markdown 图片缓存，避免文件名不变时，页面仍引用旧的图片尺寸或已删除的响应式版本。开发服务已运行时，整理大量附件后重启一次开发服务。

## 整理已有附件

先运行 `npm run images:check`：只计算压缩结果，不写任何文件。

执行 `npm run images:prepare`：归档、压缩、核对并更新需要改名的图片链接。也可以使用 Obsidian 命令 **Local Image Library: 归档原图并整理全部附件**。处理已完成的附件会跳过。迁移时暂停 NAS 双向同步，另一台电脑关闭对应 Obsidian 文件库；完成后再恢复同步，避免两台同时转换。

## Git 与 NAS

本机代码、文章、网站用图、插件代码和处理记录仍通过 Git 保存。原图只在本机/NAS 保存。忽略规则不会删除已经进入 Git 历史的旧原图；当前附件替换压缩版本后，旧版本仍在历史中，历史清理另做。

极空间只同步 content 时，保持 `_originals/` 和 `.image-library/`，排除本机的 `.obsidian/workspace*.json` 和 `plugins/local-image-library/data.json`（若客户端支持按文件过滤）。不要把 `.git`、node_modules、dist、.astro 在两台电脑之间同步。

换电脑先等内容同步完成，再检查 Git 状态。Git 拉取/切换分支/恢复历史时暂停内容同步，操作结束后再恢复。不要两台同时修改同一张图片。

## 恢复

从处理记录可以找到原图位置及 SHA-256。需要重新调整质量时先取出原图，避免基于压缩图再压缩。原图必须在 NAS 确认同步成功后才有远端副本；本机归档成功不代表 NAS 上传已经结束。

意外中断后如提示任务锁占用，确认没有图片任务正在运行，再移除 `.git/image-library.lock` 并重试。

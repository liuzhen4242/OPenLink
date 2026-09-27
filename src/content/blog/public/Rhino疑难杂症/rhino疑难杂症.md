---
title: "Rhino 疑难杂症"
titleEn: "Rhino Troubleshooting"
date: 2026-09-12
description: "Rhino 8 插件与工具列疑难杂症排查笔记：pOd 组件主标签不显示的根因（WireGuard 虚拟网卡无 MAC）、color-material-turtle 工具列图标不显示的根因（Mac 加载位错误）与解决办法。"
author: "zhenliu"
category:
  - 学习
status: "public"
---


## rhino工具列

### color-material-turtle 图标不显示（默认蓝/文字）

**问题**：`color-material-turtle` 工具列 31 个按钮图标长期显示"默认蓝 → 文字"，反复重做图标无效。

**排查结论**：不是图标数据问题，是 **Mac 上 Rhino 加载的 rui 文件根本不是一直在改的那份**。

**原因**：

- Mac Rhino 通过 yak 包加载 rui，**真正加载位是 packages 目录**：
  `~/Library/Application Support/McNeel/Rhinoceros/packages/8.0/turtle/1.0.0/Turtle.rui`
- 一直在改的 4 处（UI / MacPlugIns×2 / git 源 Resources）内容一致、含 275 个 icon，**Rhino 根本不读**。
- yak 安装位里的 rui 是旧版（仅 244 个 icon），`color-material-turtle` 的 31 个新图标 guid 全都不存在 → `bitmap_id` 悬空 → 按钮显示文字；而 `color-turtle` 正常是因为旧版里本来就有它的白圆图标。

**解决**：把新版 rui 覆盖到 packages 加载位（先备份 `.bak-yakold`），5 处 md5 全部一致后重启 Rhino 即正常。

**图标格式（Mac Rhino 可渲染）**：

```xml
<!-- ✅ 单张 32x32 PNG，name 为 "guid.png"（参考 color-turtle 白圆 837c614b） -->
<icon guid="837c614b-c763-41b8-98d4-dda7ffd07f3c" name="837c614b-c763-41b8-98d4-dda7ffd07f3c.png">
  <png>iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0…</png>
</icon>

<!-- ❌ 不可渲染：Windows 风格 <light><svg><rect/>，Mac 上显示文字 -->
```

- 纯色方块 PNG：PIL 生成 32x32 RGB（无 alpha），base64 约 152 字符即可被 Rhino 渲染；A120 半透明项用 RGBA + 黑描边。
- 图标 guid 必须与 `macro_item bitmap_id` 一致，name 建议用 `guid.png`。

**必踩的坑**：

1. 改 rui 前必须完全退出 Rhino（进程名 `Rhinoceros`，`kill <pid>` / `kill -9 <pid>`，pkill 受系统限制）。
2. 工具栏 dock 位置在 `settings/Scheme__Default/containers.xml`（`dock_location`/`float_point`/`visible`），删覆盖层会丢浮动位置 → "勾选可见但找不到"。
3. 覆盖层 `settings/Scheme__Default/OpenLink_7338352c-….xml`（guid 7338352c=Turtle 库）内含旧图标 override，启动时覆盖新 rui → 症状"重启又变旧"。
4. 按钮显示文字 = `bitmap_id` 悬空 或 icon 不被加载（Rhino 找不到图标就显示 `<button_text>`）。
5. GUI 验证：命令行 `_-Toolbar` 库名必须输 **Turtle**（输 color-material-turtle 会报 not found）→ Show → color-material-turtle → Yes；或 Window → Containers 勾选。
6. AX 操作：菜单卡住用多次 esc 或点击其它菜单项；元素索引每次观察后重排；屏幕锁定报 MAC_GUI_ERROR_7_0，等解锁再操作。

**完整排查记录**见 [Turtle development log](../Turtle%20development%20log/Turtle%20development%20log.md) 的「Toolbar 图标修复记录（2026-09-27）」章节。

### 删除旧工具列后 Toolbars 面板空白 / 工具栏不显示（2026-09-27）

**症状**：脚本从 rui 删除 4 个旧工具列（ColorOL-CO / material-co / Material-ma / Mouse-mo）后，重启 Rhino，**Toolbars 面板空白/变灰**，4 个新工具列（Turtle 主 / color-turtle / color-material-turtle / material-turtle）一个都不显示。

**排查结论**：库本身加载完全正常（`_-Toolbar` → Library → List 能看到 4 个工具列名齐全），缺失的只是**工具列的显示状态**——根因在 rui / 覆盖层 / containers.xml 三处残留。

**根因（三层，按排查顺序）**：

1. **rui 的 `tool_bar_groups` 残留**：删除脚本只清了 `tool_bars` / `tool_bar_reference` / 孤儿宏图标，但 `tool_bar_groups` 里仍留着 4 个**引用已删工具列的空 `<item>`**（无 `tool_bar_reference`），且 4 个新工具列**从未在组中** → 重启后默认不显示。这是最终根因。
2. **覆盖层残留旧引用**：`settings/Scheme__Default/Turtle_7338352c-….xml` 被 Rhino 重写后仍引用已删工具列（`<tool_bar source_guid=… modified="True">`、deleted_items、已删宏的 right_macro）→ 备份后删除整个覆盖层，图标恢复读 rui，dock 可能重置。
3. **containers.xml 残留旧 dock_bar**：已删工具列的 dock_bar 浮动记录仍在 → 备份后清理引用已删 guid 的 dock_bar 块。

**修复（按序）**：备份 → 删覆盖层 → 清理 containers.xml 旧 dock_bar → **重写 rui 的 `tool_bar_groups`**：清空残留 `<item>`，4 个工具列全部写 `<tool_bar_reference guid="…"><dock_bar_info visible="1" dock_location="top"/></tool_bar_reference>` → 同步 5 处 → 重启验证。

**GUI 恢复显示（已验证可用）**：`_-Toolbar` → Library → 输入 `Turtle` → List（确认库路径 packages/8.0/turtle/1.0.0/Turtle.rui）→ Toolbar → Show → 输入工具列名 → Yes。
**坑**：在「Choose toolbar option:」对话框直接输入+回车会把文字送进命令行报 `Unknown command`；正确顺序：填入 → 点 Show 按钮 → 对话框变「Toolbar name:」→ 再填入 + 回车 → 出现「Show toolbar "xxx"?」→ 点 Yes。

**验证持久化**：Show 后状态写入 `containers.xml`（每个工具列一个 `<dock_bar><tabs selected_item=工具列guid><tool_bar guid=… file=7338352c…/></tabs>` 块，`visible="True"`），重启后保持；**Show 不会重新生成覆盖层**。检查 containers.xml 是否含 4 个工具列 dock_bar 即可确认。


## pOd 插件排查笔记

问题：pOd

- Rhino 8 中 pOd 只剩 Animation 标签，主标签（Component）不显示，也不报错。
    

原因

- 该模块加载时会读网卡 MAC 做硬件校验。
    
- 你机器上有 WireGuard 虚拟网卡：没有 MAC 地址，却是启用状态。
    
- 插件取到它 → 取值异常 → 决定"不加载自己"（PriorityLoad 返回 Abort）。
    
- Grasshopper 于是静默跳过整个文件，不注册组件、不显示标签。
    

已排除的可能

- 插件文件与同事完全一致（MD5 相同）
    
- Rhino 版本、.NET 版本、系统版本都一致
    
- 文件未被 Windows 阻止、依赖齐全、杀毒软件无关、GH 设置相同
    

解决办法

- 退出 WireGuard，或禁用那块隧道网卡，然后重启 Rhino。
    
- 管理员 PowerShell 命令：  
    Disable-NetAdapter -InterfaceDescription "WireGuard Tunnel" -Confirm:$false
    

顺带建议

- 这是插件自身的 bug（扫描网卡时没跳过空 MAC），可以反馈给作者。
    

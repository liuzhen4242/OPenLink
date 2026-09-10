---
title: "Rhino 工作站一键安装指南"
name: "Rhino 工作站一键安装指南"
titleEn: "Rhino Workspace One-Click Setup Guide"
date: "2026-09-10"
description: "把整个 Rhino 工作环境（脚本、工具栏、模板、别名）打包成一个文件夹，U 盘拷到同事电脑，跑一次脚本全部生效。本文讲清它的用法、原理，并按功能给出术语索引。"
author: "zhenliu"
category:
  - 学习
status: "public"
---

每个设计师都有自己的 {Rhino 工作站|把个人 Rhino 工作环境（脚本、工具栏、模板、别名等）集中管理、可整体迁移的文件夹}：常用脚本、自定义工具栏、默认模板、快捷键别名。过去在新电脑或同事电脑复刻这套环境靠手工搬文件，经常漏项，路径还容易失效。本文介绍的做法是：把所有内容收敛到一个目录，用一套脚本统一分发——{一键安装|在目标电脑上运行一次脚本，完成全部文件同步与配置注册}。

正文中带下划线的词是引注，悬停可看到解释，点击会在右侧栏高亮对应注释；文末附按功能分类的术语索引。

---

## 1. 整体架构

整个方案由三部分组成：{workspace|存放"要被同步的内容"的目录}、{manager|安装器代码目录，负责把 workspace 内容安装到目标机器}、{Sync_Windows.bat|Windows 一键安装入口脚本，双击运行即可}。

```text
// 项目根目录结构（RhinoWorkspace/）
RhinoWorkspace/
├── workspace/          # 被同步的内容目录
│   ├── scripts/        # Python / RhinoScript 脚本
│   ├── toolbar/        # OpenLink.rui 工具栏库
│   ├── resources/
│   │   └── templates/  # 默认模板 OpenLink03.3dm
│   ├── aliases/        # 命令别名
│   ├── displaymodes/   # 显示模式
│   └── grasshopper/    # GH 相关文件
├── manager/            # 安装器
│   ├── installer.py    # 主控，按任务清单执行
│   └── modules/        # 各模块（脚本/工具栏/模板/别名…）
└── Sync_Windows.bat    # 一键安装入口
```

### - 内容目录与安装器分工

- {workspace|见上：被同步内容} 只存放"文件本身"，不关心装到哪里；{manager|见上：安装器} 负责"装到哪、怎么注册"。
- 这种分工让同一份内容目录可以在任意电脑复用——换机器只需重新跑安装器。
- 安装器按模块执行，每个模块负责一类内容：

```python
# manager/installer.py：任务清单（共 9 项）
tasks = [
    aliases,      # 别名
    displaymodes, # 显示模式
    grasshopper,  # GH 插件文件
    resources,    # 资源文件
    scripts,      # 脚本（*.py / *.rvb）
    startup,      # 启动脚本
    templates,    # 模板文件
    rui_link,     # 工具栏注册（RUI Link）
    # …
]
```

- {installer.py|安装器主控脚本，顺序执行任务清单并输出日志} 每个模块独立、可重复执行，重复运行不产生副作用（{幂等|同一操作执行多次结果一致，不会重复叠加}）。

---

## 2. 使用流程

### - 第一步：U 盘拷贝

把整个 `RhinoWorkspace/` 目录拷贝到同事电脑的任意位置。不依赖联网，也不需要 {git|分布式版本控制系统，本方案刻意不用}。

### - 第二步：运行 Sync_Windows.bat

双击 {Sync_Windows.bat|见上：一键安装入口}，等待日志输出 `Install Finished (9/9 ok)` 即完成。脚本会做：

1. 同步全部脚本、模板、别名等文件到 Rhino 对应位置；
2. 注册 {OpenLink.rui|Rhino 的工具栏库文件，内含 OpenLink 工具栏集合与 Mouse-mo 中键菜单}；
3. 写入中键与默认模板设置。

### - 第三步：重启 Rhino 验证

重启后检查三点：

- 工具栏集合中出现 **OpenLink**（Rhino 启动自动加载）；
- 按住鼠标中键弹出 **Mouse-mo** 菜单；
- 启动模板为 **OpenLink03.3dm**。

---

## 3. 关键技术原理

### - 工具栏如何做到"启动自动加载"

{RUI 文件|Rhino 的工具栏库文件（.rui），一个文件可含多个工具栏集合} 本身不会随 Rhino 启动自动打开，需要注册。Rhino 8 中打开它的正确方式不是旧命令，而是 {ToolbarFiles.Open|Rhino 8 打开 RUI 工具栏库的官方 API，参数为 .rui 文件路径}。

注册的落点：Rhino 会把"已打开的 RUI 文件"记录在 {workspace XML|Rhino 保存窗口布局、工具栏状态的文件（%APPDATA%\McNeel\Rhinoceros\8.0\settings\Scheme__Default\workspaces\*.xml）} 的 {files 段|workspace XML 中记录已打开 RUI 文件的段落，Rhino 启动时按此自动加载} 里：

```xml
<!-- workspace XML 的 files 段：记录要自动加载的 RUI -->
<!--Open RUI files-->
<files>
  <file_name guid="7338352c-…" source="File">C:\…\OpenLink.rui</file_name>
</files>
```

安装器把这一条写进目标机器的所有 workspace XML，Rhino 启动即自动打开 OpenLink——这就是"不需要手动加载工具栏"的原理。

### - 中键菜单设置

{MiddleMouseToolbarName|Rhino 设置中键弹出哪个工具栏的配置项} 写入 {settings XML|Rhino 全局设置文件（%APPDATA%\McNeel\Rhinoceros\8.0\settings\settings-Scheme__Default.xml）} 的 General 段：

```xml
<!-- settings XML General 段 -->
<entry key="MiddleMouseToolbarName">OpenLink.Mouse-mo</entry>
```

### - 默认模板设置

{DefaultTemplateFile|Rhino 启动时使用的默认模板文件配置项} 指向模板文件。模板文件本身同步到 Rhino 模板目录：

```text
%APPDATA%\McNeel\Rhinoceros\8.0\Localization\zh-CN\Template Files\OpenLink03.3dm
```

设置项写入可移植路径（%APPDATA% 自动展开，每台电脑都存在）：

```xml
<!-- settings XML FileSettings 段 -->
<entry key="TemplateFiles">%APPDATA%\…\Localization\zh-CN\Template Files</entry>
<entry key="DefaultTemplateFile">%APPDATA%\…\Template Files\OpenLink03.3dm</entry>
```

### - 路径为什么可移植

{绝对路径|带盘符与完整目录的路径，如 D:\00-素材\…，换电脑即失效} 是同步框架的大忌；配置与脚本一律写入 {相对路径|相对某个基准位置（如 %APPDATA%、脚本所在目录）的路径，可随环境整体迁移} 或占位符。脚本内的路径用 {占位符|如 RHINO_SCRIPTS，安装时替换为实际脚本目录} 定位，避免写死。

### - 兼容性处理

- {IronPython 2.7|Rhino 内置的 Python 运行环境版本} 不支持 {pathlib|Python 3 的路径处理库，IronPython 2.7 没有}、{f-string|Python 3.6+ 的格式化字符串语法，IronPython 2.7 没有}——脚本须用 {os.path|Python 标准库的路径处理模块，IronPython 2.7 可用} 等兼容写法。
- bat 脚本避免中文字符：{GBK 编码|Windows 中文系统默认代码页，bat 含中文在部分系统会乱码闪退}，脚本保持纯 ASCII。
- 修改 Rhino 配置文件前先 {备份|把原始文件复制到 backup 目录再改动，出错可回滚}。

---

## 4. 术语索引

> 正文中被引注的术语按出现顺序生成编号并在右侧栏列出解释；下表按功能分类速查。

### - 核心概念

| 术语 | 解释 |
|---|---|
| Rhino 工作站 | 集中管理个人 Rhino 工作环境、可整体迁移的文件夹 |
| 一键安装 | 运行一次脚本完成全部文件同步与配置注册 |
| U 盘分发 | 通过 U 盘拷贝目录部署，不依赖网络与 git |
| 幂等 | 同一操作重复执行多次结果一致，不会重复叠加 |

### - 目录与文件

| 术语 | 解释 |
|---|---|
| workspace | 被同步的内容目录（脚本/工具栏/模板/别名…） |
| manager | 安装器代码目录 |
| installer.py | 安装器主控脚本 |
| Sync_Windows.bat | 一键安装入口脚本 |
| OpenLink.rui | 工具栏库文件（OpenLink 集合 + Mouse-mo 中键） |
| workspace XML | Rhino 保存窗口布局与工具栏状态的文件 |
| settings XML | Rhino 全局设置文件 |

### - 配置与机制

| 术语 | 解释 |
|---|---|
| RUI 文件 | Rhino 的工具栏库文件（.rui） |
| ToolbarFiles.Open | Rhino 8 打开 RUI 工具栏库的官方 API |
| files 段 | workspace XML 中记录"已打开 RUI 文件"的段落，启动自动加载 |
| MiddleMouseToolbarName | 中键弹出工具栏名称配置项 |
| DefaultTemplateFile | 默认模板文件配置项 |
| 绝对路径 / 相对路径 | 带盘符的写死路径 / 可随环境迁移的基准路径 |
| 占位符 | 如 {RHINO_SCRIPTS}，安装时替换为实际目录 |

### - 兼容性技术点

| 术语 | 解释 |
|---|---|
| IronPython 2.7 | Rhino 内置的 Python 运行环境版本 |
| pathlib / f-string | Python 3 语法，IronPython 2.7 不支持 |
| os.path | Python 标准库路径模块（IronPython 2.7 可用） |
| GBK 编码 | Windows 中文默认代码页，bat 脚本应避免中文 |
| 备份 | 修改配置前复制原文件，出错可回滚 |

---

以上便是 Rhino 工作站一键安装的全部内容。想动手：先按第 2 节跑一遍流程，再按第 3 节理解原理；术语拿不准时，回看右侧栏或本页索引即可。

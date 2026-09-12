---
title: "Turtle Plugin Development Guide"
name: "Turtle 插件开发要点"
date: "2026-09-12"
description: "Turtle Rhino 8 插件开发要点：插件骨架、命令与 Python 脚本的路径机制、Grasshopper 工具集（视觉合并方案）、ghuser 集成与版本校验、资源归类原则。每段代码块顶部标注文件路径，可调参数见文末速查索引。"
author: "zhenliu"
category:
  - 工厂
status: "public"
---

本文记录 {Turtle|Rhino 8 跨平台插件，含 C# 命令、嵌入式 Python 脚本、Grasshopper 工具集与用户对象} 插件的开发要点。结构按"文件放在哪、代码怎么调、参数怎么改"组织：代码块顶部用注释标注**文件路径**，正文带下划线的词是引注（悬停看解释），文末附**可调参数索引**，后续随开发不断补充。

---

## 1. 插件骨架

Turtle 是一个 {net7.0|.NET 7 目标框架，Rhino 8 跨平台（Win+Mac）插件标准} 的 Rhino 8 插件，整体结构如下：

```text
// 项目根目录结构（rhinoPluging/）
rhinoPluging/
├── Turtle.sln / Turtle.csproj      # 工程文件（net7.0，跨平台）
├── TurtlePlugin.cs                 # 插件入口：解压脚本 + 释放 ghuser（带版本校验）
├── Commands/                       # C# 命令类
│   ├── TurtleHello.cs              # 测试命令
│   ├── TurtleRun.cs                # 调 Python 脚本的命令模板
│   ├── TurtleBlockToSu.cs          # exportToSu（调 BlockToSU.py）
│   ├── TurtleOutline.cs            # 轮廓线（调 Outline.py）
│   └── TurtleClean.cs              # 清理释放的 ghuser
├── Scripts/                        # 嵌入 .rhp 的 Python 脚本
├── Grasshopper/                    # GH 组件 C# + 分发用 ghuser
├── Resources/                      # 随插件分发的独立文件（rui / ini / 材质）
├── assets/                         # 原始素材存档（不参与构建、不分发）
├── tools/patch_ghuser.py           # ghuser 属性补丁工具
├── build.ps1 / build.command       # Win / Mac 一键编译
└── README.md
```

### - 编译与产物

```bash
# build.command / build.ps1：一键编译（dotnet build -c Release）
cd rhinoPluging && dotnet build Turtle.csproj -c Release
# 产物：bin/Release/net7.0/Turtle.rhp
```

- 编译后 csproj 的 `MakeRhp` 目标自动把 `Turtle.dll` 复制为 `Turtle.rhp`。
- {MakeRhp|csproj 里的 MSBuild Target，编译后复制 dll 为 rhp 后缀，Rhino 才能识别为插件} 定义在 {Turtle.csproj|项目文件} 底部。

---

## 2. 命令与 Python 脚本

工具栏按钮、命令行命令与 Python 脚本的关系是：**宏只负责"点一下调 C# 命令"，脚本路径由 C# 在运行时拼接**——彻底摆脱绝对路径。

### - 脚本分发机制

```csharp
// TurtlePlugin.cs：插件入口，OnLoad 时把嵌入的 .py 解压到本地缓存
protected override LoadReturnCode OnLoad(ref string errorMessage)
{
    ExtractEmbeddedScripts();   // 解压 .py 到缓存目录
    InstallUserObjects();       // 释放 ghuser 到 GH 用户对象目录
    return LoadReturnCode.Success;
}
```

- 嵌入方式：`Turtle.csproj` 里 `<EmbeddedResource Include="Scripts\**\*.py" />`，所有 `Scripts/` 下的 .py 自动进 .rhp。
- 解压目标：`ScriptDir = %APPDATA%/Turtle/Scripts`（Win）/ `~/.config/Turtle/Scripts`（Mac），**已存在则跳过**——方便直接改缓存里的脚本调试。
- 脚本按 `Assembly.GetManifestResourceStream()` 读取资源流，资源名 `Turtle.Scripts.xxx.py`，去掉 `Scripts/` 前缀平铺到缓存目录。

### - 命令模板

```csharp
// Commands/TurtleRun.cs：调用 Python 脚本的命令模板
public override string EnglishName => "TurtleRun";

protected override Result RunCommand(RhinoDoc doc, RunMode mode)
{
    string script = Path.Combine(TurtlePlugin.ScriptDir, "BlockTools.py");
    // RhinoApp.RunScript($"_RunPythonScript \"{script}\"", ...)
    return Result.Success;
}
```

- 命令类继承 `Rhino.Commands.Command`，`EnglishName` 是命令行里的命令名。
- 所有命令统一用 `Path.Combine(TurtlePlugin.ScriptDir, "xxx.py")` 拼路径，**不写死绝对路径**。
- 需要新命令：复制 `TurtleRun.cs`，改类名 + `EnglishName` + 脚本名。

### - 工具栏宏与命令的对应

{rui|Rhino 工具栏文件，XML 格式，定义按钮与宏} 里按钮的宏只需要写 `!_TurtleXxx`：

```xml
<!-- Resources/Turtle.rui：按钮宏示例（macro/script 节点） -->
<script>!_TurtleBlockToSu</script>
```

- `!` = 静默执行（不显示命令回显）；`_` = 强制英文命令名（避免本地化歧义）；后段 = C# 命令的 `EnglishName`。
- 命令名**不固定**：改类名/EnglishName 后同步改 rui 里的宏即可，两者一一对应。

---

## 3. Grasshopper 工具集（视觉合并方案）

GH 电池由两部分组成，**统一使用 `Category = "Turtle"`**（大写），在 GH 面板合并成同一个 Turtle 标签页：

| 来源 | 示例 | 分类 |
|---|---|---|
| 代码内 GH 组件（随 .rhp 加载） | TurtleHelloComponent | `Turtle`（TurtleInfo.Category 常量） |
| 释放的 ghuser 用户对象 | arrows（画箭头 cluster） | 文件内 Category 字段 = `Turtle` |

### - GH 组件骨架

```csharp
// Grasshopper/TurtleInfo.cs：统一分类常量（改分类只改这里）
public const string Category = "Turtle";     // ← 可调参数：GH 面板标签页名
public const string SubCategory = "箭头";    // ← 可调参数：GH 面板子分类名
```

```csharp
// Grasshopper/TurtleHelloComponent.cs：GH 组件写法（继承 GH_Component）
public TurtleHelloComponent()
    : base("TurtleHello", "THello", "描述", TurtleInfo.Category, "测试")
{ }
public override Guid ComponentGuid => new Guid("B7E2C4A1-...");   // 必须唯一
protected override Bitmap Icon => CreateIcon();                   // GH 8: Icon 是 protected
```

- GH 8 中 `Icon` 是 **protected 成员**，`public override` 会报 CS0507，必须写 `protected override`。
- `ComponentGuid` 每个组件必须唯一，新组件换新 GUID。
- GH 工具集不建独立 .gha，直接在 Turtle 程序集内嵌 GH 组件，加载 .rhp 时 GH 自动扫描注册。

### - ghuser 集成（保留炸开编辑）

ghuser 本质是 {cluster|Grasshopper 组件集群，把多个电池打包成一个，可右键炸开编辑内部参数}，所以"炸开后改内部电池参数"的特性天然保留——这与原来方案 B 完全一致。

```csharp
// TurtlePlugin.cs：InstallUserObjects() —— 释放 ghuser 到 GH 用户对象目录
string ghDir = global::Grasshopper.Folders.DefaultUserObjectFolder;  // 注意 global:: 前缀
string dest = Path.Combine(ghDir, "Arrows.ghuser");
InstalledGhUserPath = dest;
if (File.Exists(dest) && HashEquals(File.ReadAllBytes(dest), embedded))
    return;    // 版本校验：哈希一致则不动
File.WriteAllBytes(dest, embedded);
```

- 释放位置：`Grasshopper.Folders.DefaultUserObjectFolder`（Win: `%APPDATA%\Grasshopper\UserObjects`；Mac: `~/Library/Application Support/Grasshopper/UserObjects`）。
- **版本校验**：SHA-256 对比嵌入资源与已安装文件，内容不一致才覆盖——插件升级后旧 ghuser 自动更新，一致则不写盘。
- `global::Grasshopper` 前缀**必须有**：项目里已有 `Turtle.Grasshopper` 命名空间，直接写 `Grasshopper.Folders` 会被误解析（CS0234）。
- 安装后**需重启 Grasshopper** 才会扫描到新用户对象（GH 启动时才读用户对象目录）。

### - 修改 ghuser 属性（Category 等）

ghuser 是 {raw-deflate|zlib 的 raw deflate 流（wbits=-15），非 zip 容器} 压缩的 GH_IO 序列化流，字段明文可改。字段格式：`字段名 + \xff\xff\xff\xff + \x0a\x00\x00\x00 + 长度 + UTF8值`。

```python
# tools/patch_ghuser.py：修改 ghuser 内 Category / SubCategory 字段
# 用法：python3 tools/patch_ghuser.py <输入.ghuser> <输出.ghuser> [Category] [SubCategory]
def patch_str(data: bytes, name: bytes, new_val: str):
    marker = name + b'\xff\xff\xff\xff\x0a\x00\x00\x00'
    idx = data.find(marker)
    vs = idx + len(marker)
    old_len = data[vs]
    nb = new_val.encode('utf-8')
    return data[:vs] + bytes([len(nb)]) + nb + data[vs + old_len + 1:]
```

- 改了原始 ghuser（`assets/ghuser/arrows.ghuser`）后，必须重新跑 patch 把 Category 改成 `Turtle`，**覆盖到 `Grasshopper/Arrows.ghuser`**（这才是嵌入分发的那份）。
- 属性窗口（GH 里 File > Create User Object）填的 Category 决定电池进哪个标签页——视觉合并方案的核心。

### - 清理逻辑

Rhino 8 插件**没有卸载回调**（只有 OnLoad / OnShutdown），所以清理用命令实现：

```csharp
// Commands/TurtleClean.cs：删除释放的 ghuser（命令行输入 _TurtleClean）
File.Delete(TurtlePlugin.InstalledGhUserPath);
```

- 只要插件还在加载，下次启动会重新释放 ghuser；彻底移除 = 先卸载插件，再跑 `_TurtleClean`。

---

## 4. 资源归类原则

| 文件 | 放哪里 | 原因 |
|---|---|---|
| 插件要用的 `.py` | `Scripts/` | csproj 自动嵌入 .rhp |
| 分发用的 `.ghuser` | `Grasshopper/` | 嵌入 + 启动时释放到 GH |
| 分发用的 `.rui` / `.ini` / 材质 | `Resources/`（或子目录） | 随插件独立分发，不嵌入 |
| 原始素材 / 旧版本 | `assets/` | 只存档，不参与构建、不随插件分发 |

- `Resources/DisplayStyles/`：ini 显示样式；`Resources/Materials/`：材质文件——都随插件包一起发布。
- `assets/` 里的文件**不会**进 .rhp，只做版本存档；改 ghuser 的原件放这里，patch 后再覆盖到 `Grasshopper/`。
- 发布时打包：`bin/Release/net7.0/Turtle.rhp` + `Resources/` 整个文件夹 = 完整插件包。

---

## 5. 可调参数索引

> 想改任何参数：先按定位找文件，改完重新编译（`dotnet build -c Release`）。代码内改动需重编译；ghuser/rui 文件改动需重启 Rhino/Grasshopper 生效。

| 参数 | 位置 | 说明 |
|---|---|---|
| GH 面板标签页名 `Category` | Grasshopper/TurtleInfo.cs 第 11 行 | 统一分类，GHA 组件与 ghuser 必须一致 |
| GH 面板子分类 `SubCategory` | Grasshopper/TurtleInfo.cs 第 14 行 | ghuser 用 patch 工具同步改 |
| ghuser 内 Category / SubCategory | tools/patch_ghuser.py 命令行参数 | 改完覆盖到 Grasshopper/Arrows.ghuser |
| 脚本缓存目录 `ScriptDir` | TurtlePlugin.cs `ExtractEmbeddedScripts()` | 默认 `%APPDATA%/Turtle/Scripts` |
| 嵌入脚本范围 | Turtle.csproj `<EmbeddedResource Include="Scripts\**\*.py" />` | 新脚本放进 Scripts/ 即自动嵌入 |
| ghuser 释放文件名 | TurtlePlugin.cs `InstallUserObjects()` 的 `"Arrows.ghuser"` | 对应 GH 面板显示名 |
| 清理命令名 | Commands/TurtleClean.cs `EnglishName` | 命令行输入 `_TurtleClean` |
| 工具栏宏 | Resources/Turtle.rui `<script>` 节点 | 格式 `!_命令EnglishName` |
| 组件 GUID | 各 GH 组件 `ComponentGuid` | 每个组件必须唯一 |
| 版本校验 | TurtlePlugin.cs `HashEquals()` | SHA-256，内容变才覆盖 |

---

## 6. 版本更新

### 2026-09-12 (v0.3)

- 资源归类：分发文件进 `Resources/`（rui / DisplayStyles / Materials），原始素材进 `assets/` 存档；删除无用的 RhinoWorkspace startup 脚本。
- 新增 `_TurtleClean` 命令：删除释放到 GH 的 ghuser（卸载/清理逻辑）。
- ghuser 集成（视觉合并方案）：`Category=turtle` 小写 → 后统一为大写 `Turtle`；插件启动时 SHA-256 校验、旧文件自动覆盖。
- 新增 `tools/patch_ghuser.py`：ghuser 属性补丁工具。
- git 远程配置完成，已 push 到 `github.com/liuzhen4242/Turtle.git`。

### 2026-09-11 (v0.2)

- 插件整体改名为 turtle：`Turtle.csproj/sln/TurtlePlugin.cs/Turtle.rui` 全量替换；缓存目录变 `~/.config/Turtle/Scripts`。
- OpenLink.rui 三个宏改为 `!_TurtleBlockToSu` / `!_TurtleOutline`，摆脱硬编码绝对路径。
- GH 工具集骨架：TurtleInfo / TurtleAssemblyPriority / TurtleHelloComponent（踩坑：GH 8 Icon 需 protected override）。

### 2026-09-09 (v0.1)

- 按 README 搭建 Rhino 8 跨平台插件骨架（net7.0，Mac+Windows）。
- 修复 MyToolsPlugin.cs 缺 `using System.Runtime.InteropServices` 导致的 CS0616。
- 命令 + 嵌入式 Python 脚本 + 工具栏基础链路打通。

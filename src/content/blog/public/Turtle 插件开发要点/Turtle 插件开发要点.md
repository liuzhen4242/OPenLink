---
title: "Turtle 插件开发要点"
titleEn: "Turtle Plugin Development Guide"
date: "2026-09-22"
description: "Turtle Rhino 8 插件开发要点：插件骨架、命令与 Python 脚本的路径机制、Grasshopper 工具集（视觉合并方案）、ghuser 集成与版本校验、资源归类原则与文件添加规范、常用工具脚本（材质/立面/线条）。每段代码块顶部标注文件路径，可调参数见文末速查索引。"
author: "zhenliu"
category:
  - 工厂
status: "public"
---

本文记录 {Turtle|Rhino 8 跨平台插件，含 C# 命令、嵌入式 Python 脚本、Grasshopper 工具集与用户对象} 插件的开发要点。结构按"文件放在哪、代码怎么调、参数怎么改"组织：代码块顶部用注释标注**文件路径**，正文带下划线的词是引注（悬停看解释），文末附**可调参数索引**，后续随开发不断补充。

---


## 初始设置
### 自动导入
- toolbar(include python script)
- aliases
- ini view
### 手动导入
- 鼠标中键
- 3dm模版文件
- 材质库
- 原生的view
- 空间布局
- package里的插件包
  ```path
  
  ```
### 布局设置
- page 的颜色，
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

### - 文件添加规范（2026-09-15 整理）

新增 Rhino 相关文件时，按"嵌入 / 分发 / 存档"三类归位，一句话：**能嵌入的进 `Scripts/` 或 `Grasshopper/`，随插件分发的进 `Resources/`，只存档案的进 `assets/`**。

三条去向：

| 去向 | 含义 | 目录 | 安装后到哪 |
|---|---|---|---|
| 嵌入 .rhp | 编译时打包进 Turtle.rhp，随插件走 | `Scripts/`（.py）、`Grasshopper/`（.ghuser） | 插件启动时解压/释放到本地 |
| 随插件分发 | 不嵌入，和 .rhp 一起发布 | `Resources/`（及其子目录） | 和 Turtle.rhp 放同一文件夹 |
| 只存档 | 不参与编译、不分发，留底备查 | `assets/` | 永远不进用户电脑 |

**加入新 GH 电池（三步，缺一不可）**：

```text
// Grasshopper/ 目录 —— 新电池放这里
Grasshopper/
├── 新电池.ghuser        ← ① 文件放这里
├── Arrows.ghuser
└── ...
```

1. **放文件**：`.ghuser` 放进 `Grasshopper/` 目录；
2. **登记 csproj**（最容易漏）：打开 `Turtle.csproj`，在 `<ItemGroup>` 里补一行：

```xml
<!-- Turtle.csproj：登记新电池（通配符不覆盖 ghuser，必须手动补） -->
<EmbeddedResource Include="Grasshopper\新电池.ghuser" />
```

3. **Category 填 `Turtle`**：制作电池时（`File > Create User Object` 属性窗口），Category 填 `Turtle`，SubCategory 填想显示的子分类名，和 GHA 组件合并进同一标签页。

三个坑：

| 坑 | 后果 | 怎么避 |
|---|---|---|
| 忘了登记 csproj | 电池不被分发，别人装插件看不到 | 放文件后立刻补 csproj 行 |
| Category 写了别的（如 toto） | 电池出现在 GH 面板别的分类 | 属性窗口统一填 `Turtle` |
| 改名后 Name 字段没同步 | 显示名和文件名不一致 | 属性窗口一并核对 Name |

> （`.py` 脚本不同：放进 `Scripts/` 即可，csproj 通配符自动覆盖，不用登记。）

**文件去向总表**：

| 文件类型 | 放哪里 | 机制 | 备注 |
|---|---|---|---|
| Python 脚本 `.py` | `Scripts/` | csproj 通配符 `Scripts\**\*.py` 自动嵌入 | 新脚本放进来即嵌入，无需改工程 |
| GH 用户对象 `.ghuser` | `Grasshopper/` | 嵌入 + 启动时释放到 GH 用户对象目录 | **新增需在 csproj 补一行 EmbeddedResource** |
| GH 组件源码 `.cs` | `Grasshopper/` | 编译进 .rhp，GH 自动注册 | Category 统一用 TurtleInfo.Category |
| 工具栏 `.rui` | `Resources/` | 随插件分发 | 与 .rhp 同文件夹 |
| 显示样式 `.ini` | `Resources/DisplayStyles/` | 随插件分发 | 子目录按需建 |
| 材质 `.rmtl` | `Resources/Materials/` | 随插件分发 | 子目录按需建 |
| 其他独立资源 `.3dm` 等 | `Resources/<子目录>/` | 随插件分发 | 建语义化子目录 |
| 原始素材 / 历史版本 | `assets/<类型>/` | 只存档 | 不进 .rhp、不分发 |
| 工具脚本 | `tools/` | 开发期工具 | 如 patch_ghuser.py |
| 命令源码 `.cs` | `Commands/` | 编译进 .rhp | 复制 TurtleRun.cs 模板改名 |

**分发脚本（只维护 assets/，一键同步）**：

建议工作流：**新文件只放进 `assets/`，跑一次 `distribute.ps1` 自动同步到 `Resources/`**，不用手动双份维护。

```powershell
// Turtle/distribute.ps1 —— 资源分发脚本（assets → Resources，只复制不移动）
# 用法：右键 -> 使用 PowerShell 运行，或终端里 .\distribute.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# 1. ini 显示样式：assets/ini -> Resources/DisplayStyles
$srcIni = Join-Path $root "assets\ini"
$dstIni = Join-Path $root "Resources\DisplayStyles"
if (Test-Path $srcIni) {
    New-Item -ItemType Directory -Path $dstIni -Force | Out-Null
    $iniCount = @(Get-ChildItem (Join-Path $srcIni "*.ini")).Count
    Copy-Item (Join-Path $srcIni "*.ini") $dstIni -Force
    Write-Host "  [ini] $iniCount 个显示样式 -> Resources\DisplayStyles" -ForegroundColor Green
}

# 2. 材质：assets/materials -> Resources/Materials
$srcMat = Join-Path $root "assets\materials"
$dstMat = Join-Path $root "Resources\Materials"
if (Test-Path $srcMat) {
    New-Item -ItemType Directory -Path $dstMat -Force | Out-Null
    $matCount = @(Get-ChildItem (Join-Path $srcMat "*.rmtl")).Count
    Copy-Item (Join-Path $srcMat "*.rmtl") $dstMat -Force
    Write-Host "  [材质] $matCount 个材质 -> Resources\Materials" -ForegroundColor Green
}

# 3. 工具栏：assets/rui -> Resources
$srcRui = Join-Path $root "assets\rui"
$dstRui = Join-Path $root "Resources"
if (Test-Path $srcRui) {
    Copy-Item (Join-Path $srcRui "*.rui") $dstRui -Force
    Write-Host "  [rui] assets\rui -> Resources\" -ForegroundColor Green
}
Write-Host "分发完成。ghuser 需手动 patch 后放 Grasshopper\，脚本不自动处理。" -ForegroundColor Yellow
```

> 注意：脚本文件需保存为 **UTF-8 with BOM**，否则 Windows PowerShell 5.1 按 GBK 解析中文注释会报 "Missing closing '}'"。

2026-09-15 分发结果：`Resources/` = `Turtle.rui` + `DisplayStyles/`（6 个 .ini：Arctic / ArcticBlack / ArcticWhite / OutLine / Shaded / Wireframe）+ `Materials/`（79 个 .rmtl）。完整规范文档见 `Turtle/docs/文件添加规范.md`。

---

## 5. 工具脚本与组件

> 随开发积累的可用脚本与 GH 组件存档（合并自"turtle 插件开发日志"）。代码内注释已含输入/输出与参数说明，需要旧版（0.1 等）见 git 历史。

### - 材质工具：颜色一键转材质

**0.2 版（推荐）**——将对象颜色一键转换为材质（RenderMaterial 版，防重复）：

- 读取每个对象的{实际显示颜色|若图层颜色继承，也会正确取到}
- 相同颜色的对象自动共用同一个材质，不会重复创建
- 创建新材质前会先检查文档里是否已存在{同名材质|比如之前跑过一次本脚本、或者之前手动建过}，有就直接复用，不会再新建重复的一份——反复运行也不会产生重复材质
- 材质使用 Rhino.Render.RenderMaterial（Basic Material），材质库同款机制：无论从"材质面板"改材质球，还是从"属性面板"改选中物体的材质，其他共用该材质的物体都会联动

```python
# 用法：
#   1. 在 Rhino 命令行输入 EditPythonScript (Rhino 6/7) 或 ScriptEditor (Rhino 8)
#   2. 粘贴本脚本并运行 (F5)
#   3. 若有选中的对象，只处理选中对象；若没有选中任何对象，则处理场景中所有对象

import rhinoscriptsyntax as rs
import scriptcontext as sc
import Rhino


def find_existing_render_material(doc, name):
    """在文档已有的 RenderMaterial 里查找同名材质，找到就返回它，找不到返回 None"""
    for mat in doc.RenderMaterials:
        if mat.Name == name:
            return mat
    return None


def color_to_material():
    doc = sc.doc

    # 优先使用选中对象，没有选中则处理全部对象
    selected = rs.SelectedObjects()
    obj_ids = selected if selected else rs.AllObjects()

    if not obj_ids:
        print("场景中没有找到任何对象。")
        return

    color_material_map = {}  # {(R,G,B): RenderMaterial}
    count = 0
    created_count = 0
    reused_count = 0

    for obj_id in obj_ids:
        rhobj = rs.coercerhinoobject(obj_id)
        if rhobj is None:
            continue

        # 获取对象的实际显示颜色（若按图层显示颜色，会自动取图层颜色）
        color = rhobj.Attributes.DrawColor(doc)
        key = (color.R, color.G, color.B)

        if key in color_material_map:
            mat = color_material_map[key]
        else:
            mat_name = "Color_{}_{}_{}".format(color.R, color.G, color.B)

            # 先看文档里有没有同名材质，有就直接复用，不新建
            existing_mat = find_existing_render_material(doc, mat_name)

            if existing_mat is not None:
                mat = existing_mat
                reused_count += 1
            else:
                # 创建 Basic Material（材质库同款的 RenderContent 对象）
                mat = Rhino.Render.RenderContentType.NewContentFromTypeId(
                    Rhino.Render.ContentUuids.BasicMaterialType, doc)
                mat.BeginChange(Rhino.Render.RenderContent.ChangeContexts.Program)
                mat.Fields.Set("diffuse", color)
                mat.EndChange()
                mat.Name = mat_name

                doc.RenderMaterials.Add(mat)
                created_count += 1

            color_material_map[key] = mat

        # 赋值给物体（RenderMaterial 属性走的是渲染内容系统，天然支持联动）
        rhobj.RenderMaterial = mat
        rhobj.CommitChanges()
        count += 1

    doc.Views.Redraw()
    print("完成：共处理 {} 个对象，涉及 {} 种颜色（新建 {} 个材质，复用已有 {} 个材质）。".format(
        count, len(color_material_map), created_count, reused_count))


color_to_material()
```

**0.1 版差异**：0.1 只在"本次运行内"合并相同颜色，**不查文档已有同名材质**——反复运行会重复创建材质；且行内调用时注意 {`_-RunPythonScript`|嵌入式 Python 脚本命令} 后面**必须要有空格**再跟脚本内容或路径，否则 Rhino 无法正确解析。

### - 立面工具：Random UV Grid + Extrude（facad RandomLine）

Grasshopper "C# Script" 组件：Random UV Grid + Extrude（限制相邻剔除 + 区分 U/V 挤出面）。

- 硬性规则：被剔除的线段最多只能连续相邻 1 对（最多 2 根连续消失，绝不会 3 根以上连续消失）。
- `adjacentRatio`（0~1）：控制被剔除线段里"成对相邻消失" vs "孤立单根消失"的占比，严格执行、绝不为了凑数破坏比例。
- 输出 `uSrf` / `vSrf` 分别对应 U/V 方向线段挤出后的面，方便单独处理横向/竖向翅片。

```csharp
// C# 脚本组件代码 —— Random UV Grid + Extrude（限制相邻剔除 + 区分U/V挤出面）
// 适用环境：Rhino Grasshopper "C# Script" 组件
//
// === 组件设置方法 ===
// 1. 在 Grasshopper 里拖一个 "C# Script" 组件
// 2. 右键组件 -> 依次添加/重命名输入端为：
//      srf, nU, nV, reduceU, reduceV, seed, extrudeDist, adjacentRatio
// 3. 右键组件 -> 依次添加/重命名输出端为：uCrv, vCrv, uSrf, vSrf
// 4. 每个输入端右键设置类型提示（Type hint）：
//      srf           -> Surface,  Access: Item
//      nU            -> int,      Access: Item
//      nV            -> int,      Access: Item
//      reduceU       -> int,      Access: Item
//      reduceV       -> int,      Access: Item
//      seed          -> int,      Access: Item
//      extrudeDist   -> double,   Access: Item
//      adjacentRatio -> double,   Access: Item   (0~1，超出范围会自动clamp)
// 5. 双击组件左上角小箭头展开代码编辑区，把下面全部代码粘贴进去，
//    完整替换编辑区里原有内容
//
// === 输入说明 ===
// srf           : 目标曲面
// nU            : U方向总分格数（每条"U方向"线会被切成 nU 段）
// nV            : V方向总分格数（每条"V方向"线会被切成 nV 段）
// reduceU       : 从"U方向内部线段"里随机剔除的段数（不含首尾边界行）
// reduceV       : 从"V方向内部线段"里随机剔除的段数（不含首尾边界列）
// seed          : 随机种子/随机影响因子
// extrudeDist   : 每根线段沿曲面法线方向的挤出距离
// adjacentRatio : 0~1，剔除线段中"相邻成对"相对于"孤立单根"的占比
//
// === 输出说明 ===
// uCrv : 剔除后剩余的"U方向"打断线段（List access）
// vCrv : 剔除后剩余的"V方向"打断线段（List access）
// uSrf : uCrv逐段沿法线挤出得到的面（List access, Brep）
// vSrf : vCrv逐段沿法线挤出得到的面（List access, Brep）
using System;
using System.Collections.Generic;
using System.Linq;
using Rhino;
using Rhino.Geometry;
using Grasshopper;
using Grasshopper.Kernel;
using Grasshopper.Kernel.Data;
using Grasshopper.Kernel.Types;
public class Script_Instance : GH_ScriptInstance
{
  private void RunScript(
        Surface srf,
        int nU,
        int nV,
        int reduceU,
        int reduceV,
        int seed,
        Interval extrudeDist,
        double adjacentRatio,
        ref object uCrv,
        ref object vCrv,
        ref object uSrf,
        ref object vSrf)
  {
    if (srf == null)
    {
      uCrv = new List<Curve>();
      vCrv = new List<Curve>();
      uSrf = new List<Brep>();
      vSrf = new List<Brep>();
      return;
    }
    int safeNU = Math.Max(nU, 1);
    int safeNV = Math.Max(nV, 1);
    int safeReduceU = Math.Max(reduceU, 0);
    int safeReduceV = Math.Max(reduceV, 0);
    double safeRatio = Clamp01(adjacentRatio);
    Random rnd = new Random(seed);
    Interval domU = srf.Domain(0);
    Interval domV = srf.Domain(1);
    List<double> uParams = new List<double>();
    for (int i = 0; i <= safeNU; i++)
      uParams.Add(domU.ParameterAt((double)i / safeNU));
    List<double> vParams = new List<double>();
    for (int i = 0; i <= safeNV; i++)
      vParams.Add(domV.ParameterAt((double)i / safeNV));
    List<double> uInterior = uParams.Skip(1).Take(uParams.Count - 2).ToList();
    List<double> vInterior = vParams.Skip(1).Take(vParams.Count - 2).ToList();
    // U方向线（按行）：常数V、沿U延伸的等参线，切成 nU 段
    List<List<Curve>> uRows = new List<List<Curve>>();
    foreach (double v in vParams)
    {
      Curve fullCurve = srf.IsoCurve(0, v);
      uRows.Add(SplitCurve(fullCurve, uInterior));
    }
    // V方向线（按列）：常数U、沿V延伸的等参线，切成 nV 段
    List<List<Curve>> vCols = new List<List<Curve>>();
    foreach (double u in uParams)
    {
      Curve fullCurve = srf.IsoCurve(1, u);
      vCols.Add(SplitCurve(fullCurve, vInterior));
    }
    // --- 保护边界：第一行/最后一行、第一列/最后一列始终保留 ---
    List<Curve> uBoundary = new List<Curve>();
    uBoundary.AddRange(uRows[0]);
    uBoundary.AddRange(uRows[uRows.Count - 1]);
    List<List<Curve>> uInteriorRows = uRows.Skip(1).Take(uRows.Count - 2).ToList();
    List<Curve> vBoundary = new List<Curve>();
    vBoundary.AddRange(vCols[0]);
    vBoundary.AddRange(vCols[vCols.Count - 1]);
    List<List<Curve>> vInteriorCols = vCols.Skip(1).Take(vCols.Count - 2).ToList();
    // --- 保护边界结束 ---
    // 关键修复：V方向不能直接按"列"分组做相邻判断（那样只会检查同一列内部
    // 上下堆叠的nV小段是否相邻，检查不到"左右相邻的两根柱子是否同时消失"）。
    // 这里把按列存储"转置"成按V向层级存储：同一层级里的元素按U方向顺序排列，
    // 这样相邻判断的就是"左右相邻的柱子"，跟U方向的逻辑保持对称。
    List<List<Curve>> vBandRows = new List<List<Curve>>();
    for (int j = 0; j < safeNV; j++)
    {
      List<Curve> band = new List<Curve>();
      foreach (List<Curve> col in vInteriorCols)
      {
        if (j < col.Count) band.Add(col[j]);
      }
      vBandRows.Add(band);
    }
    // 逐段随机剔除，且限制"最多连续2根相邻消失"，按adjacentRatio控制成对/孤立比例
    List<Curve> uInteriorKept = RandomRemoveLimitedAdjacency(uInteriorRows, safeReduceU, safeRatio, rnd);
    List<Curve> vInteriorKept = RandomRemoveLimitedAdjacency(vBandRows, safeReduceV, safeRatio, rnd);
    List<Curve> uOut = new List<Curve>();
    uOut.AddRange(uBoundary);
    uOut.AddRange(uInteriorKept);
    List<Curve> vOut = new List<Curve>();
    vOut.AddRange(vBoundary);
    vOut.AddRange(vInteriorKept);
    // 分别对U方向、V方向线段沿曲面法线挤出成面
    List<Brep> uPanels = new List<Brep>();
    foreach (Curve seg in uOut)
    {
      Brep panel = ExtrudeAlongNormal(seg, srf, extrudeDist);
      if (panel != null) uPanels.Add(panel);
    }
    List<Brep> vPanels = new List<Brep>();
    foreach (Curve seg in vOut)
    {
      Brep panel = ExtrudeAlongNormal(seg, srf, extrudeDist);
      if (panel != null) vPanels.Add(panel);
    }
    uCrv = uOut;
    vCrv = vOut;
    uSrf = uPanels;
    vSrf = vPanels;
  }
  private double Clamp01(double x)
  {
    return Math.Max(0.0, Math.Min(1.0, x));
  }
  // 核心：在rows（每行/列是一组按顺序排列的线段）里随机剔除removeCount根，
  // 保证同一行/列内不会出现3根或以上连续被剔除，并按adjacentRatio控制
  // "成对相邻消失" vs "孤立单根消失"的比例
  private List<Curve> RandomRemoveLimitedAdjacency(List<List<Curve>> rows, int removeCount, double adjacentRatio, Random rnd)
  {
    // 展平，同时记录每个元素属于哪一行、行内偏移，方便做相邻性判断
    List<Curve> flat = new List<Curve>();
    List<int> rowStart = new List<int>();
    List<int> rowLength = new List<int>();
    foreach (List<Curve> row in rows)
    {
      rowStart.Add(flat.Count);
      rowLength.Add(row.Count);
      flat.AddRange(row);
    }
    int n = flat.Count;
    if (n == 0 || removeCount <= 0)
      return new List<Curve>(flat);
    removeCount = Math.Min(removeCount, n);
    bool[] removed = new bool[n];
    Func<int, int, int> GlobalIndex = (r, local) =>
    {
      if (local < 0 || local >= rowLength[r]) return -1;
      return rowStart[r] + local;
    };
    // 目标：pairSegTarget根线段以"成对"的形式消失（凑成偶数），其余为孤立单根
    // ratio>=1时特殊处理：全部必须成对，若removeCount是奇数，宁可少去一根也不留孤立单根
    int pairSegTarget;
    int singlesTarget;
    if (adjacentRatio >= 1.0)
    {
      pairSegTarget = removeCount - (removeCount % 2);
      singlesTarget = 0;
    }
    else
    {
      pairSegTarget = (int)Math.Round(removeCount * adjacentRatio);
      if (pairSegTarget % 2 != 0) pairSegTarget -= 1;
      if (pairSegTarget < 0) pairSegTarget = 0;
      singlesTarget = removeCount - pairSegTarget;
    }
    int pairGroupsTarget = pairSegTarget / 2;
    int placedPairSeg = 0;
    int placedSingle = 0;
    int maxAttempts = Math.Max(500, n * 40);
    int attempts = 0;
    // 第一步：尝试放置"成对相邻"的剔除组合
    while (placedPairSeg < pairGroupsTarget * 2 && attempts < maxAttempts)
    {
      attempts++;
      int r = rnd.Next(rows.Count);
      int len = rowLength[r];
      if (len < 2) continue;
      int i = rnd.Next(len - 1); // 组合 (i, i+1)
      int gi = GlobalIndex(r, i);
      int gi1 = GlobalIndex(r, i + 1);
      if (removed[gi] || removed[gi1]) continue;
      // 避免拼接成3连：检查左右再外一格是否已被剔除
      int giPrev = GlobalIndex(r, i - 1);
      int giNext = GlobalIndex(r, i + 2);
      if (giPrev != -1 && removed[giPrev]) continue;
      if (giNext != -1 && removed[giNext]) continue;
      removed[gi] = true;
      removed[gi1] = true;
      placedPairSeg += 2;
    }
    // 第二步：尝试放置"孤立单根"的剔除（左右都不能是已剔除的）
    attempts = 0;
    while (placedSingle < singlesTarget && attempts < maxAttempts)
    {
      attempts++;
      int r = rnd.Next(rows.Count);
      int len = rowLength[r];
      if (len < 1) continue;
      int i = rnd.Next(len);
      int gi = GlobalIndex(r, i);
      if (removed[gi]) continue;
      int giPrev = GlobalIndex(r, i - 1);
      int giNext = GlobalIndex(r, i + 1);
      if (giPrev != -1 && removed[giPrev]) continue;
      if (giNext != -1 && removed[giNext]) continue;
      removed[gi] = true;
      placedSingle += 1;
    }
    // 注意：这里故意不做"兜底补齐"。如果因为密度太高，纯孤立/纯成对已经
    // 排不下目标数量，就宁可实际剔除数量比reduceU/reduceV设定值少，
    // 也绝不为了凑数而破坏adjacentRatio指定的比例（尤其是ratio=0时绝不
    // 允许出现任何相邻剔除）。如果发现实际剔除数量明显偏少，说明分格
    // 密度不够支撑你要的剔除量，请调大nU/nV或调小reduceU/reduceV。
    List<Curve> kept = new List<Curve>();
    for (int k = 0; k < n; k++)
    {
      if (!removed[k]) kept.Add(flat[k]);
    }
    return kept;
  }
  // 在线段中点处取曲面法线方向，把该线段沿法线挤出成面
  private Brep ExtrudeAlongNormal(Curve segment, Surface srf, Interval interval)
  {
    // 如果区间长度接近 0 则不生成面
    if (segment == null || Math.Abs(interval.Length) < 1e-9)
      return null;
    Point3d midPt = segment.PointAt(segment.Domain.Mid);
    double u, v;
    if (!srf.ClosestPoint(midPt, out u, out v))
      return null;
    Vector3d normal = srf.NormalAt(u, v);
    if (!normal.IsValid || normal.Length < 1e-9)
      return null;
    normal.Unitize();
    // ★ 核心逻辑 A：先把基准线沿法线平移到区间起点（T0）
    Curve baseCrv = segment.DuplicateCurve();
    if (Math.Abs(interval.T0) > 1e-9)
    {
      baseCrv.Translate(normal * interval.T0);
    }
    // ★ 核心逻辑 B：沿法线挤出整个区间的总跨度（T1 - T0）
    Vector3d extrudeVec = normal * (interval.T1 - interval.T0);
    Surface extSrf = Surface.CreateExtrusion(baseCrv, extrudeVec);
    if (extSrf == null)
      return null;
    return extSrf.ToBrep();
  }
  // 在interiorParams处把curve切开，返回子曲线列表；没有内部参数则原样返回
  private List<Curve> SplitCurve(Curve curve, List<double> interiorParams)
  {
    if (curve == null)
      return new List<Curve>();
    if (interiorParams == null || interiorParams.Count == 0)
      return new List<Curve> { curve };
    Curve[] pieces = curve.Split(interiorParams);
    if (pieces == null || pieces.Length == 0)
      return new List<Curve> { curve };
    return pieces.ToList();
  }
}
```

### - 线条工具：曲线沿法线双向挤出（offset both side）

Grasshopper "C# Script" 组件：Extrude Along Normal (Domain)——曲线沿曲面法线方向**双向**挤出，两端距离独立可控（不必对称）。

- `distDomain` 用 Construct Domain 接入，如 `Domain(-100, 150)` = 往法线负方向挤 100、正方向挤 150。
- 输出 `srfOut` 数量与 `crv` 一一对应；`offsetCrv` 每条输入曲线产出 2 条（Min/Max 两端偏移曲线）。

```csharp
// C# 脚本组件代码 —— Extrude Along Normal (Domain)（曲线沿曲面法线方向双向挤出）
// 适用环境：Rhino Grasshopper "C# Script" 组件
//
// === 组件设置方法 ===
// 1. 在 Grasshopper 里拖一个 "C# Script" 组件
// 2. 右键组件 -> 依次添加/重命名输入端为：crv, srf, distDomain
// 3. 右键组件 -> 依次添加/重命名输出端为：srfOut, offsetCrv
// 4. 每个输入端右键设置类型提示（Type hint）：
//      crv        -> Curve,    Access: List   （支持一次传入多条曲线）
//      srf        -> Surface,  Access: Item
//      distDomain -> Interval, Access: Item   （用Construct Domain电池接入,
//                                              比如 Domain(-100, 150)）
// 5. 输出端 srfOut / offsetCrv 保持默认List access即可
// 6. 双击组件左上角小箭头展开代码编辑区，把下面全部代码粘贴进去，
//    完整替换编辑区里原有内容
//
// === 输入说明 ===
// crv        : 待挤出的曲线（一条或一组）
// srf        : 参考曲面，法线方向从这个曲面上取
// distDomain : 挤出距离区间，比如(-100,150)表示往法线负方向挤100，
//              往法线正方向挤150，两头独立可控，不必对称
//
// === 输出说明 ===
// srfOut    : 每条曲线挤出后得到的面（List access, Brep），
//             数量与crv输入数量一一对应；挤出失败的曲线会被跳过
// offsetCrv : 每条曲线在区间两端对应的偏移曲线（List access, Curve）
//             顺序规则：每条输入曲线依次产出2条——
//               第 2i   条 = 该曲线沿法线偏移 distDomain.Min 后的曲线（挤出面的一条边）
//               第 2i+1 条 = 该曲线沿法线偏移 distDomain.Max 后的曲线（挤出面的另一条边）
//             如果只想要"下边界"或"上边界"曲线，可以在GH里用
//             Partition List（每组2个）之后取索引0或索引1，
//             或者拆成crvMin/crvMax两个输出端。
//
// === 原理 ===
// 对每条曲线取中点，用 srf.ClosestPoint 找到曲面上最近点的u,v参数，
// 用 srf.NormalAt(u,v) 取该处法线方向；分别乘以distDomain.Min和
// distDomain.Max得到两个偏移向量，先把曲线沿这两个向量各自平移一份
// 得到offsetCrv的两条曲线，再用两条偏移曲线之间的向量差做
// Surface.CreateExtrusion生成挤出面，等价于从Min偏移曲线挤到Max偏移曲线。
using System;
using System.Collections.Generic;
using System.Linq;
using Rhino;
using Rhino.Geometry;
using Grasshopper;
using Grasshopper.Kernel;
using Grasshopper.Kernel.Data;
using Grasshopper.Kernel.Types;
public class Script_Instance : GH_ScriptInstance
{
  private void RunScript(
        List<Curve> crv,
        Surface srf,
        Interval distDomain,
        ref object srfOut,
        ref object offsetCrv)
  {
    List<Brep> srfResult = new List<Brep>();
    List<Curve> crvResult = new List<Curve>();
    if (crv == null || srf == null)
    {
      srfOut = srfResult;
      offsetCrv = crvResult;
      return;
    }
    foreach (Curve c in crv)
    {
      Curve crvMin, crvMax;
      Brep panel = ExtrudeAlongNormalDomain(c, srf, distDomain, out crvMin, out crvMax);
      if (panel != null)
        srfResult.Add(panel);
      // 即使挤出失败，只要偏移曲线本身算出来了，也照样加入输出，
      // 方便排查是哪一步出的问题
      if (crvMin != null) crvResult.Add(crvMin);
      if (crvMax != null) crvResult.Add(crvMax);
    }
    srfOut = srfResult;
    offsetCrv = crvResult;
  }
  // 沿法线方向按distDomain两端各自偏移出crvMin/crvMax，并用两者之间的
  // 向量差生成挤出面
  private Brep ExtrudeAlongNormalDomain(Curve curve, Surface srf, Interval distDomain,
    out Curve crvMin, out Curve crvMax)
  {
    crvMin = null;
    crvMax = null;
    if (curve == null)
      return null;
    Point3d midPt = curve.PointAt(curve.Domain.Mid);
    double u, v;
    if (!srf.ClosestPoint(midPt, out u, out v))
      return null;
    Vector3d normal = srf.NormalAt(u, v);
    if (!normal.IsValid || normal.Length < 1e-9)
      return null;
    normal.Unitize();
    Vector3d moveMin = normal * distDomain.Min;
    Vector3d moveMax = normal * distDomain.Max;
    Curve baseMin = curve.DuplicateCurve();
    Curve baseMax = curve.DuplicateCurve();
    if (!baseMin.Translate(moveMin)) return null;
    if (!baseMax.Translate(moveMax)) return null;
    crvMin = baseMin;
    crvMax = baseMax;
    // 两条偏移曲线之间的向量差，等于从Min挤到Max所需的挤出向量
    Vector3d extrudeVec = moveMax - moveMin;
    if (extrudeVec.Length < 1e-9)
      return null;
    Surface extSrf = Surface.CreateExtrusion(crvMin, extrudeVec);
    if (extSrf == null)
      return null;
    return extSrf.ToBrep();
  }
}
```

---

## 6. 可调参数索引

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

## 7. 版本更新

### 2026-09-27（补充合并）

- 新增 §8 功能规划笔记（显示模式 / 表皮 / 电池图形界面，合并自本地草稿）。
- 新增 §9 Toolbar 图标修复记录（Mac Rhino 经 yak 从 packages 目录加载 rui，修复 31 个按钮图标显示问题，合并自"Turtle development log"本地新增内容）。
- 新增 §10 Toolbars 面板空白与工具列固化（tool_bar_groups 残留空 item 根因、GUI 恢复流程、删除旧工具列并清理孤儿宏/图标）。
- "Turtle development log" 文章全部内容已并入本文档，日志文章下架删除。

### 2026-09-22（合并开发日志）

- 合并"turtle 插件开发日志"内容：新增 §5 工具脚本与组件（材质工具 0.2、facad RandomLine、线条双向挤出），扩充 §4 文件添加规范（三条去向、GH 电池三步、文件去向总表、distribute.ps1 分发脚本）；原日志文章删除，内容归档至此。

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


---

## 8. 功能规划笔记（2026-09-27）

（合并自本地"Turtle 插件开发要点"草稿，功能构思记录）

### 显示模式
白线模式
> 分析图时，以白色为显示模式，忽略材质  
> 以黑色为显示模式，局部进入白色模式中  
> 还原材质  

### 表皮
> 根据输入数字划分柜子
> 吊顶表皮类型
> 路径成矩的几种方式，等分，步长，
> 三角面生成与楼梯

### 电池图形界面
> graph map 外置于电池  
> 时间轴

---

## 9. Toolbar 图标修复记录（2026-09-27）

> 背景：`color-material-turtle` 工具列 31 个按钮图标长期显示"默认蓝 → 文字"，反复重做无效。最终根因是 **Mac 上 Rhino 加载的 rui 文件根本不是一直在改的那份**。以下是完整排查方法与结论，后续做 toolbar 直接照此流程。

### 问题现象

| 阶段 | 现象 | 原因 |
|---|---|---|
| 最初 | 31 个按钮全是默认蓝 | `macro_item` 的 `bitmap_id` 悬空（引用的 icon guid 在 rui 里不存在） |
| 插入 SVG+3PNG 后 | 蓝色消失、按钮变文字 | Mac Rhino 不渲染 Windows 风格 `<light><svg>` 图标 → 找不到图标就显示按钮文字 |
| 插入单 PNG 后 | 仍显示文字 | **真正根因：改的文件 Rhino 根本不读**，PNG 格式本身没问题 |
| 决定性测试（复制能渲染的白圆） | 仍显示文字 | 同样证实：不是图标数据问题，是加载文件不对 |

### 最终根因（重点）

**Mac Rhino 通过 yak 包加载 rui，加载位是 packages 目录，不是 UI 目录**：

```text
// 5 处 Turtle.rui 的 md5 对比结论（2026-09-27）
// 我一直在改的 4 处（内容一致，含 275 个 icon）：
~/Library/Application Support/McNeel/Rhinoceros/8.0/UI/Turtle.rui
~/Library/Application Support/McNeel/Rhinoceros/8.0/MacPlugIns/Turtle.rhp/Turtle.rui
~/Library/Application Support/McNeel/Rhinoceros/MacPlugIns/Turtle.rhp/Turtle.rui
~/study/coding/rhinoPluging/Resources/Turtle.rui（git 源）

// Rhino 实际加载的 yak 安装位（旧版，仅 244 个 icon，不含任何新增图标 guid）：
~/Library/Application Support/McNeel/Rhinoceros/packages/8.0/turtle/1.0.0/Turtle.rui   ← 真正加载位！
```

- `packages/8.0/turtle/1.0.0/` 是 yak 双击安装后落位，Rhino 启动时从这里读 rui。
- 旧版里 `color-turtle` 的白圆图标（guid `837c614b-…`）本来就有 → 显示正常；`color-material-turtle` 的 31 个新图标 guid 旧版里全都没有 → 悬空 → 文字。
- **修复动作**：把新版 rui 覆盖到 packages 加载位（先 `cp` 备份为 `.bak-yakold`），5 处 md5 全部一致后重启 Rhino 即正常。

### 可渲染 vs 不可渲染的图标格式（Mac Rhino）

```xml
<!-- ✅ 可渲染：单张 32x32 PNG，name 为 "guid.png"（参考 color-turtle 白圆 837c614b） -->
<icon guid="837c614b-c763-41b8-98d4-dda7ffd07f3c" name="837c614b-c763-41b8-98d4-dda7ffd07f3c.png">
  <png>iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0…</png>
</icon>

<!-- ✅ 可渲染：material-co 的 e8e6c9d1（name 以 .svg 结尾但无 light/svg，3 张 png 16/24/32） -->
<icon guid="e8e6c9d1-c715-4ce3-9473-f670f4adcb34" name="be6272d0-….svg">
  <png>16x16</png><png>24x24</png><png>32x32</png>
</icon>

<!-- ❌ 不可渲染：Windows 风格 <light><svg><rect/>，Mac 上显示文字（弃用模板 /tmp/turtle_icons.xml） -->
```

- **纯色方块 PNG 生成**：PIL 生成 32x32 RGB 纯色 PNG（无 alpha），`Image.new('RGB',(32,32),color)` → base64 约 152 字符即可被 Rhino 渲染。A120 半透明项用 RGBA + 黑描边。
- 图标 guid 必须与 `macro_item bitmap_id` 一致，且 name 建议用 `guid.png`。

### 其他必踩的坑（toolbar 开发速查）

1. **改 rui 前必须完全退出 Rhino**：Rhino 退出时会用自己状态覆盖 rui；进程名是 `Rhinoceros`（不是 "Rhino 8"），用 `kill <pid>` / `kill -9 <pid>`（pkill 受系统限制不可用）。用户可能正在用 Rhino，先确认再动手。
2. **工具栏 dock 位置在 `containers.xml`**：`~/Library/Application Support/McNeel/Rhinoceros/8.0/settings/Scheme__Default/containers.xml` 定义每个 dock_bar 的 `dock_location`/`float_point`/`visible`。删了它会丢浮动位置 → "勾选可见但找不到"。
3. **覆盖层会覆盖新 rui**：`settings/Scheme__Default/OpenLink_7338352c-….xml`（guid 7338352c=Turtle 库）内含旧图标 `light_svg` override 与 toolbar 布局修改，启动时覆盖新 rui → 症状"重启又变旧"。删它 → 图标恢复读 rui，但工具栏 dock 可能重置。
4. **按钮显示文字 = bitmap_id 悬空 或 icon 不被加载**：Rhino 找不到图标就显示 `<button_text>`。
5. **GUI 验证流程**：命令行 `_-Toolbar` 库名必须输 **Turtle**（输 color-material-turtle 会报 not found）→ Show → color-material-turtle → Yes；或 Window → Containers 勾选。
6. **AX 操作**：菜单卡住（AXCancel）用多次 esc 或点击其它菜单项切换；元素索引每次观察后重排，不可跨观察复用；屏幕锁定时报 MAC_GUI_ERROR_7_0，等解锁再操作。

### 关键位置索引

| 项 | 位置 | 说明 |
|---|---|---|
| 加载位 rui | `packages/8.0/turtle/1.0.0/Turtle.rui` | **改图标必同步这里**，否则 Mac 不生效 |
| 插件内置 rui | `8.0/MacPlugIns/Turtle.rhp/Turtle.rui`、`MacPlugIns/Turtle.rhp/Turtle.rui` | 同步项 |
| UI 目录 rui | `8.0/UI/Turtle.rui` | 同步项（Rhino 可能不读，但仍保持同步） |
| git 源 rui | `rhinoPluging/Resources/Turtle.rui` | 同步项 |
| 工具栏 dock | `settings/Scheme__Default/containers.xml` | 浮动位置/可见性 |
| 覆盖层（旧图标 override） | `settings/Scheme__Default/OpenLink_7338352c-….xml` | 症状"重启变旧"时检查/删除 |
| 插件加载日志 | `~/.config/Turtle/onload.log` | 确认插件加载与"Mac 跳过 ToolbarFiles API" |
| 31 色映射 | 索引 0–30，24–30 为 A120 半透明+黑描边 | 见 color-turtle 面板顺序 |


## 10. Toolbars 面板空白与工具列固化（2026-09-27）

### Toolbars 面板空白修复记录

**症状**：删除 4 个旧工具列（ColorOL-CO / material-co / Material-ma / Mouse-mo）后重启 Rhino，Toolbars 面板空白/变灰，4 个新工具列一个都不显示。

**结论**：库加载正常（`_-Toolbar` → Library → List 显示 4 工具列名齐全），缺失的是**显示状态**，根因在 rui / 覆盖层 / containers.xml 三处残留：

1. **rui 的 `tool_bar_groups` 残留空 `<item>`**（引用已删工具列，无 tool_bar_reference）＋ 新工具列未入组 → 重启后默认不显示。**最终根因**。
2. **覆盖层** `settings/Scheme__Default/Turtle_7338352c-….xml` 被 Rhino 重写后仍引用已删工具列 → 备份后删除。
3. **containers.xml** 残留已删工具列 dock_bar → 备份后清理。

**修复**：重写 rui 的 `tool_bar_groups`——清空残留 item，4 个工具列全部 `<tool_bar_reference guid="…"><dock_bar_info visible="1" dock_location="top"/></tool_bar_reference>` → 同步 5 处 → 重启。

**GUI 恢复显示（已验证）**：`_-Toolbar` → Library → 输入 `Turtle` → List → Toolbar → Show → 输入工具列名 → Yes。
**坑**：在「Choose toolbar option:」直接输入+回车会送进命令行报 `Unknown command`；正确顺序：填入 → 点 Show → 变「Toolbar name:」→ 再填入+回车 → 「Show toolbar "xxx"?」→ Yes。

**持久化验证**：Show 后状态写入 containers.xml（`<dock_bar><tabs selected_item=工具列guid><tool_bar guid=… file=7338352c…/></tabs>`，`visible="True"`），重启后保持；Show 不会重新生成覆盖层。

### 删除旧工具列与固化

- 保留 4 个新工具列：Turtle 主（`609e6fcc`）/ color-turtle（`c479780d`）/ color-material-turtle（`97eb5b7a`）/ material-turtle（`3cdefd34`）。
- 删除 4 个旧工具列 + 孤儿宏 238 + 孤儿图标 236；文件 1.27MB → 400KB；备份 `Resources/Turtle.rui.bak-del-old4`。
- rui 同步 5 处（Mac 真正加载位：`packages/8.0/turtle/1.0.0/Turtle.rui`）；两份 rui（Resources/assets）以时间最新为准统一 md5。
- git 提交链：`d9bf2cc`→`e1aa0d8`→`1ff067a`→`ea1ffa6`→`e187425`（删旧工具列）→`6161d2d`（tool_bar_groups 修复，已 push）。

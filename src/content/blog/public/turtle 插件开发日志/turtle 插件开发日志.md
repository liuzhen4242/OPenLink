---
title: Turtle Plugin Development Log
name: Turtle 插件开发日志
category:
  - 工厂
coverImage: ./images/Pasted image 20260714162102.png
description: soft
date: 2025-02-16
status: public
---
## rhino toolbar
### 材质
{颜色转换材质|可以实现属性面板里的材质球联动，但每次颜色转换材质时，材质球会重复创建时}：可以将颜色一键生成对应颜色的材质，命名为Color_r_g_b，
- 读取每个对象的{实际显示颜色|若图层颜色继承，也会正确取到}
- 相同颜色的对象自动共用同一个材质，不会重复创建
- 创建新材质前，会先检查文档里是否已存在{同名材质|比如之前跑过一次
    本脚本、或者之前手动建过}，有就直接复用，不会再新建重复的一份，
    这样反复运行本脚本也不会再产生重复材质
- 材质使用 Rhino.Render.RenderMaterial（Basic Material），
    也就是材质库同款机制：无论从"材质面板"改材质球，
    还是从"属性面板"改选中物体的材质，其他共用该材质的物体都会联动
  
0.2版本
```python
# -*- coding: utf-8 -*-
"""
Rhino 脚本：将对象颜色一键转换为材质（RenderMaterial 版，防重复）
用法：
  1. 在 Rhino 命令行输入 EditPythonScript (Rhino 6/7) 或 ScriptEditor (Rhino 8)
  2. 粘贴本脚本并运行 (F5)
  3. 若有选中的对象，只处理选中对象；若没有选中任何对象，则处理场景中所有对象

功能：
  - 读取每个对象的"实际显示颜色"（若图层颜色继承，也会正确取到）
  - 相同颜色的对象自动共用同一个材质，不会重复创建
  - 创建新材质前，会先检查文档里是否已存在同名材质（比如之前跑过一次
    本脚本、或者之前手动建过），有就直接复用，不会再新建重复的一份，
    这样反复运行本脚本也不会再产生重复材质
  - 材质使用 Rhino.Render.RenderMaterial（Basic Material），
    也就是材质库同款机制：无论从"材质面板"改材质球，
    还是从"属性面板"改选中物体的材质，其他共用该材质的物体都会联动
"""

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
0.1版本
```python
_-RunPythonScript (# -*- coding: utf-8 -*-
"""
Rhino 脚本：将对象颜色一键转换为材质（RenderMaterial 版）
用法：
  1. 在 Rhino 命令行输入 EditPythonScript (Rhino 6/7) 或 ScriptEditor (Rhino 8)
  2. 粘贴本脚本并运行 (F5)
  3. 若有选中的对象，只处理选中对象；若没有选中任何对象，则处理场景中所有对象

功能：
  - 读取每个对象的"实际显示颜色"（若图层颜色继承，也会正确取到）
  - 相同颜色的对象自动共用同一个材质，不会重复创建（仅本次运行内合并）
  - 材质使用 Rhino.Render.RenderMaterial（Basic Material），
    也就是材质库同款机制：无论从"材质面板"改材质球，
    还是从"属性面板"改选中物体的材质，其他共用该材质的物体都会联动
"""

import rhinoscriptsyntax as rs
import scriptcontext as sc
import Rhino


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
            # 创建 Basic Material（材质库同款的 RenderContent 对象）
            mat = Rhino.Render.RenderContentType.NewContentFromTypeId(
                Rhino.Render.ContentUuids.BasicMaterialType, doc)
            mat.BeginChange(Rhino.Render.RenderContent.ChangeContexts.Program)
            mat.Fields.Set("diffuse", color)
            mat.EndChange()
            mat.Name = "Color_{}_{}_{}".format(color.R, color.G, color.B)

            doc.RenderMaterials.Add(mat)
            color_material_map[key] = mat

        # 赋值给物体（RenderMaterial 属性走的是渲染内容系统，天然支持联动）
        rhobj.RenderMaterial = mat
        rhobj.CommitChanges()
        count += 1

    doc.Views.Redraw()
    print("完成：共处理 {} 个对象，生成 {} 个材质（相同颜色已合并）。".format(
        count, len(color_material_map)))


color_to_material()
)
```

### 
## facad
#### radomLine
```c#
// C# 脚本组件代码 —— Random UV Grid + Extrude（限制相邻剔除 + 区分U/V挤出面）
// 适用环境：Rhino Grasshopper "C# Script" 组件
//
// === 组件设置方法 ===
// 1. 在 Grasshopper 里拖一个 "C# Script" 组件
// 2. 右键组件 -> 依次添加/重命名输入端为：
//      srf, nU, nV, reduceU, reduceV, seed, extrudeDist, adjacentRatio
// 3. 右键组件 -> 依次添加/重命名输出端为：uCrv, vCrv, uSrf, vSrf
// 4. 每个输入端右键设置类型提示（Type hint）：
//      srf           -> Surface,  Access: Item
//      nU            -> int,      Access: Item
//      nV            -> int,      Access: Item
//      reduceU       -> int,      Access: Item
//      reduceV       -> int,      Access: Item
//      seed          -> int,      Access: Item
//      extrudeDist   -> double,   Access: Item
//      adjacentRatio -> double,   Access: Item   (0~1，超出范围会自动clamp)
// 5. 双击组件左上角小箭头展开代码编辑区，把下面全部代码粘贴进去，
//    完整替换编辑区里原有内容
//
// === 与上一版的区别 ===
// 1. 硬性规则：被剔除的线段最多只能连续相邻1对（也就是最多2根连续消失，
//    绝不会出现3根或以上连续消失的情况），不管adjacentRatio给多少都不会破例。
// 2. 新增 adjacentRatio（0~1）：控制被剔除的线段里，"成对相邻消失"的
//    占比 vs "孤立单根消失"的占比。
//      0   -> 100%孤立单根消失，绝对不允许出现任何相邻剔除
//      0.5 -> 大约一半线段以相邻成对的形式消失，另一半孤立消失
//      1   -> 100%以相邻成对的形式消失（若reduceU/reduceV是奇数，
//             宁可少剔除1根，也不会留下不成对的孤立单根）
//    重要：这个比例是严格执行的，绝不会为了凑够reduceU/reduceV设定的
//    数量而破坏比例（比如adjacentRatio=0时绝对不会出现相邻剔除）。
//    如果分格密度不够、排不下你要求的剔除数量，脚本会让实际剔除数量
//    比设定值少，而不是牺牲比例去硬凑——这是有意为之的行为。
// 3. 输出端由原来合并的 srfOut 拆分成 uSrf 和 vSrf，分别对应U方向线段和
//    V方向线段挤出后的面，方便你后续单独处理横向/竖向的翅片。
//
// === 输入说明 ===
// srf           : 目标曲面
// nU            : U方向总分格数（每条"U方向"线会被切成 nU 段）
// nV            : V方向总分格数（每条"V方向"线会被切成 nV 段）
// reduceU       : 从"U方向内部线段"里随机剔除的段数（不含首尾边界行）
// reduceV       : 从"V方向内部线段"里随机剔除的段数（不含首尾边界列）
// seed          : 随机种子/随机影响因子
// extrudeDist   : 每根线段沿曲面法线方向的挤出距离
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

## Rhino to su
如何导出到su


## Line Tool
#### offset both side
``` c#
// C# 脚本组件代码 —— Extrude Along Normal (Domain)（曲线沿曲面法线方向双向挤出）
// 适用环境：Rhino Grasshopper "C# Script" 组件
//
// === 组件设置方法 ===
// 1. 在 Grasshopper 里拖一个 "C# Script" 组件
// 2. 右键组件 -> 依次添加/重命名输入端为：crv, srf, distDomain
// 3. 右键组件 -> 依次添加/重命名输出端为：srfOut, offsetCrv
// 4. 每个输入端右键设置类型提示（Type hint）：
//      crv        -> Curve,    Access: List   （支持一次传入多条曲线）
//      srf        -> Surface,  Access: Item
//      distDomain -> Interval, Access: Item   （用Construct Domain电池接入,
//                                               比如 Domain(-100, 150)）
// 5. 输出端 srfOut / offsetCrv 保持默认List access即可
// 6. 双击组件左上角小箭头展开代码编辑区，把下面全部代码粘贴进去，
//    完整替换编辑区里原有内容
//
// === 输入说明 ===
// crv        : 待挤出的曲线（一条或一组）
// srf        : 参考曲面，法线方向从这个曲面上取
// distDomain : 挤出距离区间，比如(-100,150)表示往法线负方向挤100，
//              往法线正方向挤150，两头独立可控，不必对称
//
// === 输出说明 ===
// srfOut    : 每条曲线挤出后得到的面（List access, Brep），
//             数量与crv输入数量一一对应；挤出失败的曲线会被跳过
// offsetCrv : 每条曲线在区间两端对应的偏移曲线（List access, Curve）
//             顺序规则：每条输入曲线依次产出2条——
//               第 2i   条 = 该曲线沿法线偏移 distDomain.Min 后的曲线（挤出面的一条边）
//               第 2i+1 条 = 该曲线沿法线偏移 distDomain.Max 后的曲线（挤出面的另一条边）
//             如果只想要"下边界"或"上边界"曲线，可以在GH里用
//             Partition List（每组2个）之后取索引0或索引1，
//             或者告诉我，我可以直接拆成crvMin/crvMax两个输出端。
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


## 文件添加规范（2026-09-15 整理）

新增 Rhino 相关文件时，按"嵌入 / 分发 / 存档"三类归位，一句话：**能嵌入的进 `Scripts/` 或 `Grasshopper/`，随插件分发的进 `Resources/`，只存档案的进 `assets/`**。

### 三条去向

| 去向 | 含义 | 目录 | 安装后到哪 |
|---|---|---|---|
| 嵌入 .rhp | 编译时打包进 Turtle.rhp，随插件走 | `Scripts/`（.py）、`Grasshopper/`（.ghuser） | 插件启动时解压/释放到本地 |
| 随插件分发 | 不嵌入，和 .rhp 一起发布 | `Resources/`（及其子目录） | 和 Turtle.rhp 放同一文件夹 |
| 只存档 | 不参与编译、不分发，留底备查 | `assets/` | 永远不进用户电脑 |

### 加入新 GH 电池（三步）

新打包的 GH 电池（`.ghuser`）放 `Grasshopper/` 目录，每次加入做三步：

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
<!-- Turtle.csproj 第 25 行附近：登记新电池 -->
<EmbeddedResource Include="Grasshopper\新电池.ghuser" />
```

3. **Category 填 `Turtle`**：制作电池时（`File > Create User Object` 属性窗口），
   Category 填 `Turtle`，SubCategory 填想显示的子分类名，和 GHA 组件合并进同一标签页。

三个坑：

| 坑 | 后果 | 怎么避 |
|---|---|---|
| 忘了登记 csproj | 电池不被分发，别人装插件看不到 | 放文件后立刻补 csproj 行 |
| Category 写了别的（如 toto） | 电池出现在 GH 面板别的分类 | 属性窗口统一填 `Turtle` |
| 改名后 Name 字段没同步 | 显示名和文件名不一致 | 属性窗口一并核对 Name |

> 一句话：**文件进 `Grasshopper/`，名字进 csproj，Category 填 `Turtle`——三步缺一不可。**
> （`.py` 脚本不同：放进 `Scripts/` 即可，csproj 通配符自动覆盖，不用登记。）

### 文件去向总表

| 文件类型 | 放哪里 | 机制 | 备注 |
|---|---|---|---|
| Python 脚本 `.py` | `Scripts/` | csproj 通配符 `Scripts\**\*.py` 自动嵌入 | 新脚本放进来即嵌入，无需改工程 |
| GH 用户对象 `.ghuser` | `Grasshopper/` | 嵌入 + 启动时释放到 GH 用户对象目录 | **新增需在 csproj 补一行 EmbeddedResource**（通配符不覆盖 ghuser） |
| GH 组件源码 `.cs` | `Grasshopper/` | 编译进 .rhp，GH 自动注册 | Category 统一用 TurtleInfo.Category |
| 工具栏 `.rui` | `Resources/` | 随插件分发 | 与 .rhp 同文件夹 |
| 显示样式 `.ini` | `Resources/DisplayStyles/` | 随插件分发 | 子目录按需建 |
| 材质 `.rmtl` | `Resources/Materials/` | 随插件分发 | 子目录按需建 |
| 其他独立资源 `.3dm` 等 | `Resources/<子目录>/` | 随插件分发 | 建语义化子目录 |
| 原始素材 / 历史版本 | `assets/<类型>/` | 只存档 | 不进 .rhp、不分发 |
| 工具脚本 | `tools/` | 开发期工具 | 如 patch_ghuser.py |
| 命令源码 `.cs` | `Commands/` | 编译进 .rhp | 复制 TurtleRun.cs 模板改名 |

### 分发脚本（只维护 assets/，一键同步）

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

### 本次分发结果（2026-09-15）

```
Resources/
├── Turtle.rui                    # 工具栏
├── DisplayStyles/ (6 个 .ini)    # Arctic / ArcticBlack / ArcticWhite / OutLine / Shaded / Wireframe
└── Materials/ (79 个 .rmtl)      # 全部材质
```

- 完整规范文档见 `Turtle/docs/文件添加规范.md`。
- 发布包 = `bin/Release/net7.0/Turtle.rhp` + `Resources/` 整个文件夹。

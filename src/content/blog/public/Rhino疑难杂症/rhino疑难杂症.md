---
title: 标Rhino疑难杂症题
titleEn: Rhino Troubleshooting
date: 2026-09-12
description: Rhino 8 插件疑难杂症排查笔记：pOd 组件主标签不显示的根因（WireGuard 虚拟网卡无 MAC）与解决办法
author: zhenliu
category:
  - 学习
status: public
---




pOd 插件排查笔记

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
    

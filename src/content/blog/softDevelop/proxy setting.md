---
title: 代理分流实践：让 Codex 在 Clash 与 teclub 之间切换
titleEn: Proxy Split Routing for Codex
date: 2026-10-22
update: 2026-10-24
description: Codex 桌面端与命令行的代理排查与线路切换实录：环境变量大小写优先级、Codex 0.163 不支持 SOCKS、DNS 污染、GUI 用登录 shell 重算环境、Chromium 只认 --proxy-server，以及用 codex-net + 状态文件在 Clash / teclub 之间一键切换。
author:
  - zhenliu
category:
  - soft
  - AI
status: public
---

## 一句话背景

本机日常走 ClashX Pro（`127.0.0.1:7890`），但 Clash 不稳定。另有一条 teclub 的 SOCKS 线路
（Chrome 用 `chrome-us` 别名走 `socks5://proxy.teclub.cn:7012`）。目标：**让 Codex 也走 teclub，且完全不依赖 Clash**。

结论：可行。这条路上踩了 6 个坑（其中 2 个是"看着配好了其实没生效"的隐形坑），
最后落成"两条线路 + 一个状态文件 + 一条切换命令"的形态 —— 因为 2026-10-24 teclub 全线故障，
又补了 `codex-net` 一键切回 Clash。

> 时间线：2026-10-22 排查并跑通 teclub → 2026-10-24 teclub 三条线全挂，加入线路切换。

---

## 一、环境基线（2026-10-22 / 10-24 两次实测）

| 项目 | 实测值 | 备注 |
| --- | --- | --- |
| ClashX Pro | 进程在跑，但**系统代理关闭**、**TUN 未开** | 默认路由仍走 `en0 → 192.168.31.1`，无 `0/1`+`128/1` 路由 |
| Clash 唯一入口 | `~/.zshrc` 第 10–17 行导出的 `http_proxy/https_proxy/all_proxy`（大小写各一套） | 系统代理是关的，所以"Clash 影响终端"全靠这些变量 |
| Clash 出口 IP | `81.28.13.79` | 与 teclub 是两条独立线路；10-24 仍可用 |
| teclub 入口 | `proxy.teclub.cn` = `sbot-dev.teclub.cn` 的别名 → `58.209.135.7` | 官方配置页 `https://sbot-dev.teclub.cn:7711/proxy.html` |
| teclub US | `socks5://proxy.teclub.cn:7012`，出口 `65.49.206.240` | 10-22 可用；**10-24 变 `Connection refused`** |
| teclub HK | `socks5://proxy.teclub.cn:7011`（对应 `st/proxy-hk.pac`） | 端口可连、SOCKS5 握手成功，**但出站数据被 reset，节点故障** |
| teclub JP | `7013`、旧地址 `dev.teclub.cn:5709/5707` | **全部下线** |
| Codex 命令行 | `~/.local/bin/codex` → `codex-cli 0.146.0` | 支持 SOCKS |
| Codex 桌面端 | `/Applications/ChatGPT.app`，内置 `CodexCLI` = `codex-cli 0.163.0-alpha.11` | **不支持 SOCKS** |
| 本机 DNS | `chatgpt.com` 解析成 `173.252.108.21` / `31.13.71.19` 等 | 典型的 DNS 污染（Facebook 网段），必须远端解析 |

---

## 二、最终方案

整体是「一个状态文件 + 两条线路 + 两个注入通道」：

```
            ~/.config/codex-net/current        ← 唯一真源（clash / teclub）
                        │
        ┌───────────────┴────────────────┐
        │                                │
   clash 线路                        teclub 线路
   127.0.0.1:7890                    127.0.0.1:18080（teclub-relay）
   （ClashX Pro）                    HTTP CONNECT → socks5://proxy.teclub.cn:7012
                                     （域名交给上游解析，绕开被污染的 DNS）
        │                                │
        └───────────────┬────────────────┘
                        │  codex-net 写入 / codex-app 读取并探活
                        ▼
┌──────────────── ChatGPT.app（桌面端）────────────────┐
│                                                      │
│  界面 (Chromium)                                     │
│     └─ 启动参数 --proxy-server=<当前线路的代理>        │
│        （Chromium **不读环境变量**，只认参数/系统代理）│
│                                                      │
│  codex app-server (Rust, 0.163+)                     │
│     └─ 环境变量 https_proxy=<当前线路的代理>           │
│        （由 .zshrc 的 "ChatGPT.app 例外段" 注入）      │
└──────────────────────────────────────────────────────┘
```

要点：

1. **两个通道必须分别配**：Rust 侧靠环境变量，Chromium 侧靠 `--proxy-server`；漏一个就会出现"一半好一半坏"。
2. **teclub 线路要多一个本地 HTTP 中转**：因为 Codex 0.163+ 只认 HTTP 代理、不认 SOCKS；顺带把"远端解析 DNS"固定下来。
   Clash 线路不需要中转（`7890` 本身就是 HTTP 代理）。
3. **用哪条线由状态文件决定**：`codex-net` 写、其余所有入口读，所以不会出现"界面走 A、模型走 B"；
   teclub 挂了可以一条命令切回 Clash（见第九节）。
4. **切到 teclub 时 Clash 完全不参与**：把 Clash 退出、换节点、挂掉都不影响 Codex。


---

## 三、踩到的 6 个坑

### 坑 1：`codex()` 包装函数写了却没效果 —— 小写环境变量优先级更高

**现象**：`.zshrc` 里早就写了

```zsh
codex() {
  HTTPS_PROXY=socks5h://proxy.teclub.cn:7012 command codex "$@"
}
```

但 `lsof` 看到 codex 仍然连 `127.0.0.1:7890`（Clash）。

**根因**：函数只覆盖了**大写**变量，而第 10–17 行导出的小写
`http_proxy/https_proxy/all_proxy` 依旧指向 Clash；绝大多数 HTTP 栈（curl、reqwest、rama）
**小写优先**。对照实验：

| 小写 | 大写 | 结果 | 说明 |
| --- | --- | --- | --- |
| 死端口 `127.0.0.1:1` | 可用的 socks | **失败** | 小写赢 |
| Clash（可用） | 死端口 | **成功** | 小写赢 |

**解决**：先把小写删掉，再统一设置。

```zsh
codex() {
  local p
  p=$(_codex_proxy)
  env -u http_proxy -u https_proxy -u all_proxy \
    HTTP_PROXY="$p" HTTPS_PROXY="$p" ALL_PROXY="$p" \
    NO_PROXY="$CODEX_NET_NO_PROXY" \
    command codex "$@"
}
```

**验证**：`zsh -c 'source ~/.zshrc; codex exec "reply OK"'` 能返回，且 `lsof` 看到目标变成 teclub / 中转端口。

---

### 坑 2：Codex 桌面端内置的 0.163 **不支持 SOCKS 出站**

**现象**：给桌面端配好 `socks5h://proxy.teclub.cn:7012` 后，界面报
`Couldn't load workspace settings`，日志里：

```
ERROR codex_models_manager::manager: failed to refresh available models: Connection failed: error sending request
ERROR rmcp::transport::worker: ... error sending request for url (https://chatgpt.com/backend-api/ps/mcp)
```

**根因**：命令行是 `codex-cli 0.146.0`（reqwest，支持 SOCKS），而 ChatGPT.app 内置的是
`codex-cli 0.163.0-alpha.11`（已换 rama 网络栈）。**同一个代理地址，0.146 能用、0.163 不能用。**

对照实验（同一个 binary，只换代理）：

| 代理 | 结果 |
| --- | --- |
| `http_proxy=http://127.0.0.1:7890`（Clash） | ✅ 正常 |
| `https_proxy=socks5h://proxy.teclub.cn:7012` | ❌ 失败 |
| `https_proxy=socks5://proxy.teclub.cn:7012` | ❌ 失败 |

**解决**：本地起一个 HTTP→SOCKS 中转（`teclub-relay`），让 Codex 用 HTTP 代理：

```sh
# 本质就这一件事：HTTP CONNECT 隧道 → 上游 SOCKS5（域名交给上游解析）
curl -s --noproxy '' -x http://127.0.0.1:18080 https://api.ipify.org
# → 65.49.206.240
```

**验证**：用 0.163 那个 binary 直接跑 `codex exec --skip-git-repo-check "reply with exactly OK"`，
`https_proxy=http://127.0.0.1:18080` 时输出 `OK`。

> 顺带记住：**版本升级会换网络栈**，以后再遇到"同样的代理配置突然不生效"，先对比两边的 `codex --version`。

---

### 坑 3：本机 DNS 被污染，`socks5://` 本地解析必挂

**现象**：`curl -x socks5://...` 访问 `chatgpt.com` 一直超时；`-x socks5h://...` 正常。

**根因**：本机解析被污染：

```sh
dscacheutil -q host -a name chatgpt.com
# ip_address: 173.252.108.21        ← Facebook 网段
# ipv6_address: 2a03:2880:f12d:83:face:b00c:0:25de
```

`socks5://` 表示"本地解析后把 IP 交给代理"，于是把假 IP 送过去 → 必然不通；
`socks5h://` 才是把**域名**交给代理解析。

**解决**：

- 命令行回退路径用 `socks5h://`；
- 中转里固定用 SOCKS5 的 `ATYP=0x03`（域名）方式发请求；
- Chrome 的 `--proxy-server='socks5://...'` 本身会把域名交给代理，所以 `chrome-us` 没问题。

**验证**：`curl -s -x socks5h://proxy.teclub.cn:7012 https://api.ipify.org` → `65.49.206.240`。


---

### 坑 4：桌面端会用**登录 shell 重算环境**，`open --env` / `launchctl setenv` 全部被覆盖

**现象**：用 `open --env https_proxy=...` 启动 ChatGPT.app，App 进程本身确实拿到了新变量，
但它拉起的 `codex app-server` 子进程里却是**旧的 Clash 变量**。

**关键证据**：

```sh
ps -o ppid= -p <app-server-pid>      # → 父进程就是 ChatGPT.app
ps eww -p <app-server-pid> | tr ' ' '\n' | grep CODEX_TECLUB
# → CODEX_TECLUB_PROXY=...    ← 这个变量只存在于 ~/.zshrc
```

也就是说：**App 是通过登录 shell 拉起 codex 的**，那个 shell 重新 `source ~/.zshrc`，
把我们注入的变量又覆盖回 Clash。判断依据：子进程的 `NO_PROXY` 是 `.zshrc` 里那串
含 `sbot-dev.teclub.cn` 的值，而不是 `--env` 注入的 `localhost,127.0.0.1,::1`。

**解决**：在 `.zshrc` 里按"祖先进程是不是 ChatGPT.app"做例外，而不是在外面注入。

```zsh
_ppid_is_chatgpt_app() {
  local p=$1 i
  for i in 1 2 3 4; do
    [ -z "$p" ] && return 1
    case "$(ps -o comm= -p "$p" 2>/dev/null)" in
      *ChatGPT.app*) return 0 ;;
    esac
    p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
  done
  return 1
}

if _ppid_is_chatgpt_app "${PPID:-0}"; then
  _p=$(_codex_proxy)
  export http_proxy="$_p" https_proxy="$_p" all_proxy="$_p"
  export HTTP_PROXY="$_p" HTTPS_PROXY="$_p" ALL_PROXY="$_p"
  export no_proxy='localhost,127.0.0.1,::1' NO_PROXY='localhost,127.0.0.1,::1'
  unset _p
fi
```

其它终端（VS Code、Terminal）祖先进程不是 ChatGPT.app，所以仍然用 `~/.zshrc` 里的默认代理
（现在是 Clash，除非你用 `codex-net teclub` 切过），互不影响。

> 排查小技巧：`ps -o comm=` 在 macOS 上会截断，例如 `/Applications/ChatGPT.app/Cont`，
> 所以匹配要用 `*ChatGPT.app*` 而不是全路径相等。

---

### 坑 5：界面侧 Chromium **完全不读环境变量** → `Couldn't load workspace settings`

**现象**：`.zshrc` 例外段生效、`codex app-server` 也走中转、`codex exec` 都正常，
但 App 界面一直提示：

```
Couldn't load workspace settings
Retry to continue chatting
```

点 Retry 没用（每次重试还是同一个直连失败）。

**诊断**：看 App 自己的桌面日志 `~/Library/Logs/com.openai.codex/<yyyy>/<mm>/<dd>/*-t0-*.log`：

```
Failed to check workspace startup settings errorMessage="Timed out waiting for MCP response to getAuthStatus"
{"code":-32603,"message":"workspace routing discovery timed out"}
sa_server_request_failed errorCode=ERR_CONNECTION_REFUSED url=/accounts/check/v4-2023-04-27
sa_server_request_failed errorCode=ERR_CONNECTION_REFUSED url=/wham/statsig/bootstrap
```

再用 `lsof` 对比就很清楚：`codex`（Rust）在连 `127.0.0.1:18080`，
而 `Codex (Service)`（Chromium 的网络进程）在**直连**外网 IP。

**根因**：Electron/Chromium 在 macOS 上只用**系统代理**或**启动参数**，
不认 `http_proxy` 环境变量。所以"Rust 侧能通"和"界面能通"是两件事。

**解决**：启动时加 Chromium 的开关：

```sh
# 以 teclub 线路为例；切换线路后，这里的地址要换成当前线路的代理
open -n -a /Applications/ChatGPT.app --args --proxy-server=http://127.0.0.1:18080
```

两个必须注意的点：

1. **`-n` 不能省** —— 否则 `open` 只是激活已有实例，`--args` 被静默丢弃；
2. **`--args` 必须放最后**，且不要画蛇添足加 `--proxy-bypass-list='<-loopback>'`，
   那会把本地 app-server 的 websocket 也塞进代理。

**验证**：

```sh
ps -o command= -p <app-pid> | tr ' ' '\n' | grep -- '--proxy-server'
lsof -nP -p <chromium-network-pid> | grep -c 18080     # 应该 > 0
```

界面恢复后，日志里 `sa_server_request_failed`、`app_server_connection.reconnect_failed` 都应为 **0**。

---

### 坑 6：`chrome-*` 别名里两个历史遗留错误

| 别名 | 原来的值 | 问题 | 改成 |
| --- | --- | --- | --- |
| `chrome-us` | `socks5://proxy.teclub.cn:7012` | 正确（出口 65.49.206.240） | 不变 |
| `chrome-hk` | `socks5://127.0.0.1:7890` | **其实指向本地 Clash**，不是 teclub 的 HK | `socks5://proxy.teclub.cn:7011` |
| `chrome-jp` | `socks5://proxy.teclub.cn:7013` | 节点已下线（connection refused） | 删除 |

补充：官方 `proxy.html` 给的是 PAC 形式
（`st/proxy-us-west.pac` / `st/proxy-hk.pac`），其中 HK 的 PAC 返回的就是
`SOCKS5 proxy.teclub.cn:7011`，所以直接用 socks 地址与 PAC 等价，但更直观。

⚠️ 实测 2026-10-22（四层逐级验证，可复现）：

| 层级 | 7011 (HK) | 7012 (US) | 7013 (JP) |
| --- | --- | --- | --- |
| TCP 连接 | ✅ | ✅ | ❌ `Connection refused`（3/3 次） |
| SOCKS5 握手 | ✅ `method=0x00` | ✅ | — |
| CONNECT 请求 | ✅ `rep=0x00`（成功） | ✅ | — |
| **数据面** | ❌ ~3.1s 后 `Connection reset by peer` | ✅ | — |
| 实测结果 | 明文/HTTPS 全挂 | `example.com` 0.34s、`google.com` 1.48s、`chatgpt.com` 0.95s，出口 `65.49.206.240` | — |

**HK 的关键特征：任何目标都一样被 reset**（`example.com:80`、`www.baidu.com:80`、
`www.google.com:443`、`chatgpt.com:443` 表现完全一致，都在 ~3s 后 RST），
说明**不是目标站问题、也不是 TLS 问题，而是节点出口侧的故障**。
给管理员报障时这样说最有用：*"SOCKS5 CONNECT 返回 success，但数据面 3 秒后被 RST，任意目标可复现"*。

**JP 的关键特征：端口根本没监听**（`7013` 三次全 refused），且 PAC 里注释的旧地址
`dev.teclub.cn:5707/5709` 也已关闭。注意 `st/proxy-jp.pac` 这个文件**仍然返回 200**、
内容也仍指向 `SOCKS5 proxy.teclub.cn:7013` —— 配置还在，是服务端没起服务。

顺手做的端口普查（2026-10-22）：

```text
proxy.teclub.cn  开放：7011(HK, 数据面挂)  7012(US, 正常)  7022(SSH，不是代理)
dev.teclub.cn    5700–5720 全关（PAC 注释里的老地址确实没了）
PAC 文件         proxy-us-west.pac → 7012 ；proxy-hk.pac → 7011 ；proxy-jp.pac → 7013
```

所以 2026-10-22 时**只有 US 一条可用**，HK/JP 暂时不用指望。

> **2026-10-24 复测**：US `7012` 也变成 `Connection refused` 了（中转直接返回 502），
> 三条线全挂 → 于是加了下面的 `codex-net` 切换器，可以一键在 Clash 和 teclub 之间切。
> 恢复后仍然把 `chrome-hk` 指回 `7011`、中转改 `TECLUB_UPSTREAM` 即可，其它配置不用动。


---

## 四、最终改动清单

| 文件 | 作用 |
| --- | --- |
| `~/.config/teclub-relay/teclub_relay.py` | 零依赖（Python3 标准库）HTTP→SOCKS 中转；`CONNECT` 隧道 + 普通 HTTP 都能转；始终用域名请求上游 |
| `~/Library/LaunchAgents/com.zhenliu.teclub-relay.plist` | 常驻中转，`RunAtLoad` + `KeepAlive`（`kill` 后自动拉起），监听 `127.0.0.1:18080` |
| `~/.zshrc` | `_codex_proxy()` 线路选择、ChatGPT.app 例外段（按祖先进程判定）、`codex()`、`codex-app`、`codex-app-env`、`codex-net`、`chrome-*` 修正 |
| `~/.config/codex-net/current` | 线路状态文件（`clash` / `teclub`），由 `codex-net` 写入，所有入口共用 |
| `~/Applications/ChatGPT (teclub).app` | Dock 启动器：**按状态文件选线路**（teclub 时先确保中转在跑），带 `--env` + `--args --proxy-server` 启动真正的 ChatGPT.app；已有坏实例会先退出 |
| `~/Library/Logs/teclub-relay.log` | 中转日志，每行 `CONNECT host:port`，出错是 `ERR ...` |

`.zshrc` 里最关键的 5 处（按文件顺序）：

```zsh
# 1) 线路状态：唯一真源（clash / teclub），非法或缺失时回落 clash
_codex_net_mode() {
  local m; m=$(cat "$CODEX_NET_FILE" 2>/dev/null)
  case "$m" in clash|teclub) print -r -- "$m" ;; *) print -r -- clash ;; esac
}

# 2) 模式 → 代理地址（teclub 优先本地中转；未监听时回退 SOCKS5 给命令行用）
_codex_net_url() {
  case "${1:-$(_codex_net_mode)}" in
    teclub)
      local i
      for i in 1 2 3 4; do
        if nc -z -w 1 127.0.0.1 18080 >/dev/null 2>&1; then
          print -r -- 'http://127.0.0.1:18080'; return 0
        fi
        sleep 0.5
      done
      print -r -- 'socks5h://proxy.teclub.cn:7012' ;;
    *) print -r -- 'http://127.0.0.1:7890' ;;
  esac
}
_codex_proxy() { _codex_net_url "$(_codex_net_mode)" }

# 3) 数据面探活：端口通 ≠ 能用（HK 就是 CONNECT 成功但数据被 RST）
_codex_probe() {
  local code
  code=$(curl -sS -m 5 --noproxy '' -x "$1" -o /dev/null -w '%{http_code}' https://api.ipify.org 2>/dev/null)
  [ "$code" = "200" ]
}

# 4) ChatGPT.app 例外段：它在登录 shell 里被 source，所以按祖先进程判定
if _ppid_is_chatgpt_app "${PPID:-0}"; then
  _codex_p=$(_codex_proxy)
  export http_proxy="$_codex_p" https_proxy="$_codex_p" all_proxy="$_codex_p"
  export HTTP_PROXY="$_codex_p" HTTPS_PROXY="$_codex_p" ALL_PROXY="$_codex_p"
  export no_proxy='localhost,127.0.0.1,::1' NO_PROXY='localhost,127.0.0.1,::1'
  unset _codex_p
fi

# 5) 桌面端启动：--env 给 Rust，--args --proxy-server 给 Chromium（-n 不能省）
codex-app() {
  local mode proxy
  mode=$(_codex_net_mode)
  proxy=$(_codex_net_url "$mode")
  _codex_probe "$proxy" || { ...自动切到另一条或报错退出... }
  open -n -a "$CODEX_APP_PATH" --env ... --args --proxy-server="$proxy"
}
```


---

## 五、自检 & 排障速查

一条命令看全貌：

```sh
codex-app-env
```

正常输出应同时满足（下面以 clash 线路为例）：

```
== ChatGPT.app pid=... / codex app-server pid=... ==
https_proxy=http://127.0.0.1:7890              ← Rust 侧，必须是当前线路
== 界面侧 (Chromium) 代理启动参数 ==
--proxy-server=http://127.0.0.1:7890  ✅       ← Chromium 侧，必须与上面同一条线
== 当前线路 ==
state: clash    代理: http://127.0.0.1:7890
== 两条线路的数据面检查 ==
  clash   ✅ 可用    http://127.0.0.1:7890
  teclub  ❌ 不可用  http://127.0.0.1:18080
== 中转 (com.zhenliu.teclub-relay) ==
LaunchAgent: 已加载
== 连接（18080 / 7012 / 7890）==
codex 67742 127.0.0.1:50123->127.0.0.1:7890
```

注意最后两行：`codex` 连的端口必须等于上面 `state` 那条线路的端口。

分症状定位：

| 症状 | 先查什么 | 常见原因 |
| --- | --- | --- |
| 终端 `codex` 还是走 Clash | `ps eww -p <pid>` 看有没有小写 Clash 变量 | 坑 1：没 `env -u` 小写 |
| 桌面端模型请求失败、`models/mcp` 报错 | app-server 的 `https_proxy` 是不是 `socks5h://` | 坑 2：0.163 不认 SOCKS |
| `chatgpt.com` 一直超时 | `dscacheutil -q host -a name chatgpt.com` | 坑 3：DNS 污染，用了 `socks5://` 本地解析 |
| `--env` 注入后没变化 | `ps -o ppid=` 看父进程、env 里有没有 `.zshrc` 独有变量 | 坑 4：登录 shell 重算环境 |
| 界面提示 `Couldn't load workspace settings` | 日志里搜 `sa_server_request_failed` / `ERR_CONNECTION_REFUSED` | 坑 5：Chromium 缺 `--proxy-server` |
| 切换线路后没变化 | `ps -o command= -p <app-pid>` 看 `--proxy-server` | 没重启 App（手改状态文件不会生效，要用 `codex-net`） |
| 模型通、界面不通（或反之） | `codex-app-env` 对比 Rust 的 env 和 Chromium 的参数 | 两条通道指了不同线路 |
| 两条线都不通 | `codex-net` | 上游全挂（如 2026-10-24 的 teclub）；先修网络 |
| Chrome 别名连不上 | `nc -z proxy.teclub.cn 7011/7012` | 7011 HK 节点故障、7013 JP 已下线 |

看 App 桌面日志（比猜有效得多）：

```sh
ls -t ~/Library/Logs/com.openai.codex/2026/10/22/*-t0-*.log | head -1
grep -E 'sa_server_request_failed|workspace routing|reconnect_failed' <上面的文件>
```

看中转日志：

```sh
tail -f ~/Library/Logs/teclub-relay.log      # 正常是连续 CONNECT chatgpt.com:443
grep -c '^ERR' ~/Library/Logs/teclub-relay.log
```

---

## 六、常用操作

```sh
# 线路：查看 / 切换 / 自动挑（切换会自动重启 App）
codex-net
codex-net clash
codex-net teclub
codex-net auto

# 重启桌面端（按当前线路注入全部代理参数）
codex-app

# 自检（当前线路 + 两条线可用性 + Rust env + Chromium 参数 + 连接）
codex-app-env

# 中转：状态 / 重启 / 停止
launchctl list | grep teclub-relay
launchctl kickstart -k gui/$(id -u)/com.zhenliu.teclub-relay
launchctl bootout    gui/$(id -u)/com.zhenliu.teclub-relay

# 中转验活（teclub 正常时出口为 65.49.206.240；挂掉会返回 502）
curl -s --noproxy '' -x http://127.0.0.1:18080 https://api.ipify.org; echo

# 换上游节点（例如 HK 恢复后）：改 plist 里的 TECLUB_UPSTREAM 后
launchctl kickstart -k gui/$(id -u)/com.zhenliu.teclub-relay

# 整体回滚
cp ~/.zshrc.bak-20261022 ~/.zshrc
launchctl bootout gui/$(id -u)/com.zhenliu.teclub-relay
rm -rf ~/Applications/'ChatGPT (teclub).app'
rm -rf ~/.config/codex-net
```

**VS Code 里的 Codex 扩展**（`openai.chatgpt`）是 VS Code 拉起的，不经过 `.zshrc`，
也不认 `~/.config/codex-net/current`。要让它也走代理：完全退出 VS Code 后

```sh
# 走 teclub 中转
open -a "Visual Studio Code" \
  --env http_proxy=http://127.0.0.1:18080 \
  --env https_proxy=http://127.0.0.1:18080 \
  --env all_proxy=http://127.0.0.1:18080 \
  --env no_proxy=localhost,127.0.0.1,::1

# 或者走 Clash
open -a "Visual Studio Code" \
  --env http_proxy=http://127.0.0.1:7890 \
  --env https_proxy=http://127.0.0.1:7890 \
  --env all_proxy=http://127.0.0.1:7890 \
  --env no_proxy=localhost,127.0.0.1,::1
```

---

## 七、这次能带走的方法

1. **先分清"谁在读代理"**：环境变量 / 系统代理 / 启动参数是三套完全不同的机制。
   Rust/CLI 多半读 env，Electron 的 Chromium 只读系统代理或 `--proxy-server`。
2. **大小写都要管**：`http_proxy` 与 `HTTP_PROXY` 同时存在时，小写通常优先；
   覆盖时用 `env -u` 直接删掉，比"再设一遍"可靠。
3. **代理生效 ≠ 域名能解析**：在 DNS 被污染的环境里，`socks5://` 与 `socks5h://` 是生死之别。
4. **"父进程是谁"经常决定环境**：GUI 应用可能用登录 shell 重算环境，
   在 `.zshrc` 里按祖先进程做例外，比在外面注入更可靠。
5. **用实测数据替代猜测**：`lsof` 看连的是哪个端口、`ps eww` 看真实环境、
   `dscacheutil` 看解析结果、`curl -w` 看 HTTP 码与耗时——这四样能把 90% 的"感觉不生效"变成确定结论。
6. **改动留痕**：改 `.zshrc` 前先 `cp` 备份；用 LaunchAgent 而不是"手动起个进程"，否则重启就回到原点。
7. **把"选择"抽成单一真源**：一旦出现"多条线路 / 多个入口"，就用一个状态文件加一组读取函数，
   让 App、CLI、Dock 启动器读同一份状态；否则很容易"这边切了、那边没切"。
8. **健康检查要打数据面**：`nc -z` 只能证明端口在听。真正决定能不能用的是"能不能取回一个响应"，
   所以用 `curl -m 5 -x <proxy> https://api.ipify.org` 判 200 —— 这一步能把"假通"（端口通但数据被 RST）过滤掉。

---

## 八、换到 Windows：哪些能照搬，哪些要换

先说结论：**思路完全适用，但有 4 处必须换实现**。
（说明：Windows 部分是机制层面的推断，本机是 macOS，未在 Windows 上实测；
macOS 上的每条结论都是实测过的。）

### 8.1 跨平台不变的部分

| 机制 | 为什么不变 |
| --- | --- |
| Codex（Rust）读 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | 同一份 Rust 代码，走的是同一个环境变量读取逻辑 |
| **0.163+ 依然不支持 SOCKS** | 是网络栈（rama）的能力问题，与操作系统无关 → 仍然需要本地 HTTP→SOCKS 中转 |
| DNS 污染 | 污染发生在本地 DNS 解析环节，Windows 同样受影响 → 中转必须**用域名**请求上游（脚本已固定 `ATYP=0x03`） |
| Chromium 只认系统代理 / `--proxy-server` | Electron 的行为一致，`--proxy-server` 在 Windows 上同样有效 |
| 中转脚本本身 | 纯 Python 标准库（`socket`/`struct`/`threading`），Windows 直接能跑；不依赖 `nc`、`launchd` 等 |

### 8.2 需要换的 4 处

| macOS 做法 | Windows 对应做法 |
| --- | --- |
| `launchd` 的 LaunchAgent 常驻 | **任务计划程序**（Task Scheduler）→ 新建任务 → 触发器"登录时" → 操作 `pythonw.exe C:\path\teclub_relay.py`（`pythonw` 不弹控制台窗口）；或把快捷方式丢进 `shell:startup`。Task Scheduler 不接管 stdout，**日志要自己重定向到文件** |
| `.zshrc` 里按"祖先进程是不是 App"判定 | Windows 没有"登录 shell 重算环境"这套：**GUI 进程继承 `explorer.exe` 的环境**。所以用 `setx HTTP_PROXY ...`（用户级、永久）或"系统属性 → 环境变量"设置，然后**注销重登 / 重启 explorer** 才生效（已经启动的 App 不会变） |
| `open -n -a ChatGPT.app --args --proxy-server=...` | 直接给 exe 传参：`"%LOCALAPPDATA%\Programs\ChatGPT\ChatGPT.exe" --proxy-server=http://127.0.0.1:18080`，做成快捷方式放桌面 / 开始菜单 / 启动项 |
| `env -u http_proxy` 清掉冲突变量 | **不适用**：Windows 环境变量名**不区分大小写**，`http_proxy` 与 `HTTP_PROXY` 是同一个变量，不存在"小写覆盖大写"的坑；改成在系统环境变量里统一设置即可 |
| `nc -z 127.0.0.1 18080` 健康检查 | PowerShell：`Test-NetConnection 127.0.0.1 -Port 18080` |

### 8.3 Windows 上额外要注意

1. **别和 Clash 的系统代理打架**：Clash for Windows / Verge 如果开了"系统代理"，
   Chromium 会用系统代理、Rust 侧只看环境变量，容易出现"界面通、模型不通"。
   建议把 Clash 的系统代理关掉，两边都显式指向 `127.0.0.1:18080`。
2. **App 的 exe 路径以实际安装为准**：任务管理器 → 右键进程 → "打开文件所在位置"。
   常见位置 `%LOCALAPPDATA%\Programs\ChatGPT\`。
3. **先确认内置 codex 版本**：在 App 目录里找 `codex-cli\...\codex.exe --version`。
   - `0.163+` → 必须用 HTTP 中转（同 macOS）；
   - `0.146` → 可以直接 `socks5h://proxy.teclub.cn:7012`，中转可以省掉。
4. **`setx` 有长度/生效范围的坑**：单个变量值上限约 1024 字符，且新值只对**新开的进程**生效；
   改完记得彻底退出 App 再启动（不是最小化）。
5. **Python 来源**：用 python.org 的正式版或 Microsoft Store 版均可；
   计划任务里要写**绝对路径**（`pythonw.exe`），不要依赖 PATH。

---


## 九、在 Clash 与 teclub 之间切换（`codex-net`）

2026-10-24 复测发现 teclub 三条线全挂（US `7012` 也 `Connection refused`），而 Clash 正常。
于是把"用哪条线"抽成一个可持久化的状态，一条命令切换。

### 9.1 设计要点

1. **单一真源**：状态文件 `~/.config/codex-net/current`，内容只有一行（`clash` / `teclub`，缺省 `clash`）。
   `.zshrc` 里所有取代理的地方（App 例外段、`codex()`、`codex-app`、Dock 启动器）都读它，
   避免多处硬编码导致"界面走 A、模型走 B"。
2. **探活看数据面，不看端口**：`_codex_probe()` 真的通过代理请求一次 `https://api.ipify.org`（5 秒超时）。
   teclub 的 HK 节点就是"端口通、SOCKS 握手通、CONNECT 成功，但数据被 RST"——
   只测端口会误判成可用。
3. **切换即重启**：代理是启动时注入的（Rust 读 env、Chromium 读启动参数），
   所以切换动作最后一步自动调用 `codex-app` 重启。
4. **启动兜底**：`codex-app` 启动前也探活；当前线路挂了就自动切到另一条并写回状态文件（打印提示），
   两条都不通则拒绝启动。

### 9.2 命令

```sh
codex-net              # 当前线路 + 两条线的数据面可用性
codex-net clash        # 切到 Clash（不可用时不切）
codex-net teclub       # 切回 teclub
codex-net auto         # 按 teclub → clash 顺序选第一条能用的
```

实际输出（2026-10-24，teclub 故障期间）：

```text
当前线路: clash  →  http://127.0.0.1:7890
  clash    ✅ 可用    http://127.0.0.1:7890
  teclub   ❌ 不可用  http://127.0.0.1:18080
切换: codex-net clash | codex-net teclub | codex-net auto
```

### 9.3 关键实现

```zsh
_codex_net_mode() {                       # 读状态文件，非法/缺失时回落 clash
  local m; m=$(cat "$CODEX_NET_FILE" 2>/dev/null)
  case "$m" in clash|teclub) print -r -- "$m" ;; *) print -r -- clash ;; esac
}

_codex_net_url() {                        # 模式 → 代理 URL
  case "${1:-$(_codex_net_mode)}" in
    teclub)
      # 优先本地中转（Codex 0.163+ 只认 HTTP 代理）；未监听则回退 SOCKS5（CLI 支持）
      nc -z -w 1 127.0.0.1 18080 >/dev/null 2>&1 \
        && print -r -- 'http://127.0.0.1:18080' \
        || print -r -- 'socks5h://proxy.teclub.cn:7012' ;;
    *) print -r -- 'http://127.0.0.1:7890' ;;
  esac
}

_codex_proxy() { _codex_net_url "$(_codex_net_mode)" }

_codex_probe() {                          # 数据面探活；--noproxy '' 避免被环境变量干扰
  local code
  code=$(curl -sS -m 5 --noproxy '' -x "$1" -o /dev/null -w '%{http_code}' https://api.ipify.org 2>/dev/null)
  [ "$code" = "200" ]
}
```

`codex-app` 的流程：

```text
读 mode → 取 URL → _codex_probe
   ├─ 通   → 直接用
   └─ 不通 → 试另一条
              ├─ 通则改状态文件 + 打印提示 + 用新线路启动
              └─ 都不通 → 报错退出（不要启动出一个半残 App）
```

Dock 启动器同样按状态文件选 `--proxy-server`，所以点图标和敲命令的行为一致。

### 9.4 切换后的自检

```sh
codex-net          # 看当前线路
codex-app-env      # 看 app-server 的 env 与 Chromium 的 --proxy-server 是否同一条线
```

实测（2026-10-24 从 teclub 切到 clash）：

| 检查项 | 结果 |
| --- | --- |
| App 环境变量 | `https_proxy=http://127.0.0.1:7890` ✅ |
| 启动参数 | `--proxy-server=http://127.0.0.1:7890` ✅ |
| Chromium 网络进程 | 35 条连接指向 `127.0.0.1:7890` ✅ |
| `sa_server_request_failed` | 0 ✅ |
| `workspace routing` 超时 | 0 ✅ |

⚠️ 仍然要记住：**直接点原来的 `/Applications/ChatGPT.app` 图标不带 `--proxy-server`**，
界面还是会报 `Couldn't load workspace settings`。日常用 `codex-app` 或那个包装 App 启动。

---

## 附录 A：`teclub_relay.py` 逐段说明

整体只有 231 行，纯标准库，结构就四件事：**收 HTTP 头 → 建 SOCKS5 隧道 → 回 200 → 双向搬运**。

### A.1 配置区（L25–L31）

```python
LISTEN_HOST = os.environ.get("TECLUB_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("TECLUB_LISTEN_PORT", "18080"))
UPSTREAM    = os.environ.get("TECLUB_UPSTREAM", "socks5://proxy.teclub.cn:7012")

CONNECT_TIMEOUT = 15   # 上行建连超时
IDLE_TIMEOUT    = 300  # 单条隧道最长静默时间
BUF             = 65536
```

三个变量都能用环境变量覆盖，所以**换节点不用改代码**，只改 plist 里的 `TECLUB_UPSTREAM` 再重启服务即可。

### A.2 `log()`（L34–L36）

写 `stderr`，由 LaunchAgent 重定向到 `~/Library/Logs/teclub-relay.log`。
所以日志里看到的两类行就是全部信息：

```
teclub-relay listening on http://127.0.0.1:18080 -> socks5://proxy.teclub.cn:7012
CONNECT chatgpt.com:443
ERR ('127.0.0.1', 5xxxx) chatgpt.com:443: SOCKS5 连接被拒绝 (rep=5)
```

`CONNECT` 是正常的，`ERR` 才是问题。

### A.3 `_is_ip()`（L43–L50）

判断目标是不是 IP 字面量，决定 SOCKS5 请求里用哪种地址类型：

| 目标 | ATYP | 含义 |
| --- | --- | --- |
| `chatgpt.com` | `0x03` | 域名，**由上游解析 DNS**（我们想要的） |
| `1.2.3.4` | `0x01` | IPv4 |
| `::1` | `0x04` | IPv6 |

这一步就是把"DNS 污染"问题挡在门外的地方 —— 只要传的是域名，本机 DNS 就完全不参与。

### A.4 `parse_upstream()`（L53–L60）

解析上游 URL，支持 `socks5://user:pass@host:port`。
**故意只允许 `socks5` / `socks5h`**：如果误填成 `http://...` 会直接 `SystemExit` 报错，
避免"看起来在跑其实转了个寂寞"。

### A.5 `recv_exact()`（L63–L70）

SOCKS5 是二进制协议，握手回复长度固定，必须收满 N 字节才能解析；
`recv()` 可能一次只给一部分，所以循环直到收够，中途断开就抛错。

### A.6 `socks5_open()`（L73–L115）—— 核心

分三步，每步都是"发请求 + 校验回复"：

```python
# ① 问候：告诉服务器我支持哪些认证方式
methods = b"\x00\x02" if UP_USER else b"\x00"     # 0x00 无认证 / 0x02 用户名密码
s.sendall(b"\x05" + bytes([len(methods)]) + methods)
ver, method = recv_exact(s, 2)

# ② 认证（仅在服务器选了 0x02 时）
#    用户名/密码各以 1 字节长度前缀发送

# ③ 请求：把目标地址 + 端口发过去
s.sendall(b"\x05\x01\x00" + atyp + bytes([len(host_bytes)]) + host_bytes + struct.pack("!H", dest_port))
_, rep, _, addr_type = recv_exact(s, 4)          # rep != 0 表示失败
# ④ 把服务器回的绑定地址读掉（长度取决于 addr_type），协议才对齐
```

两个容易写错的地方，这里都处理了：

- **`rep` 必须校验**：`0` 才是成功；`5` 是"目标不可达"，`4` 是"主机不可达"，
  不校验就会出现"隧道好像通了但其实没通"的怪现象；
- **必须把返回的绑定地址读完**：`ATYP=1` 读 4 字节、`=4` 读 16 字节、`=3` 先读 1 字节长度再读内容，
  最后还有 2 字节端口。少读一个字节，后面所有数据就错位了。

函数最后 `s.settimeout(None)`：隧道建立后切换成阻塞模式，长连接不能有超时。

### A.7 `pump()`（L118–L133）

单向搬运：`recv` → `sendall`，直到一端 EOF 或异常。
`finally` 里对两端 `shutdown(SHUT_RDWR)`，这样另一端会立刻收到 FIN，
不会出现"一边关了另一边还在等"的半开连接堆积。

### A.8 `read_headers()`（L135–L144）

一直读到出现 `\r\n\r\n` 为止（HTTP 头结束标记），上限 256 KB 防止被撑爆内存。
浏览器/Codex 的请求头通常 1–2 KB，这个上限很宽松。

### A.9 `split_target()`（L147–L154）

处理两种写法：`host:port` 和 IPv6 的 `[::1]:443`。没写端口时默认 443。

### A.10 `relay()`（L157–L164）

```python
if rest:                       # 头之后可能已经带了请求体，先发给上游
    upstream.sendall(rest)
t = threading.Thread(target=pump, args=(upstream, conn), daemon=True)
t.start()
pump(conn, upstream)           # 主线程负责 客户端 → 上游
t.join(timeout=1)              # 另一个方向在子线程
```

两个方向必须各占一个线程，否则会互相阻塞（典型的"能发不能收"）。

### A.11 `handle()`（L166–L216）

按请求方法分流：

- `CONNECT host:port`（HTTPS 走这个）→ 记一行日志 → 建 SOCKS5 隧道 →
  回 `HTTP/1.1 200 Connection Established` → `relay()` 纯字节搬运。
  **从这里开始就不再解析任何内容**，所以 TLS 是端到端的，中转看不到明文。
- 普通 HTTP（`GET http://...` 绝对 URI 形式）→ 把请求行改写成 `GET /path` 的形式，
  再加到上游隧道里发出去。
- 其它情况回 400；异常回 502 并写 `ERR` 日志。

### A.12 `main()`（L219–L227）

```python
srv.setsockopt(SOL_SOCKET, SO_REUSEADDR, 1)   # 重启时端口能立刻复用
srv.listen(128)
while True:
    conn, addr = srv.accept()
    threading.Thread(target=handle, args=(conn, addr), daemon=True).start()
```

一个连接一个线程，`daemon=True` 保证主进程退出时不会被残留连接拖住。

### A.13 为什么不用现成方案

| 方案 | 取舍 |
| --- | --- |
| `gost` / `privoxy` / `3proxy` | 功能更强，但要多装一个二进制、多一份配置语法；本机当时三个都没装 |
| `mitmproxy` | 支持 CONNECT，但要装 Python 包 + 默认会尝试解密，杀鸡用牛刀 |
| 本脚本 | 231 行、零依赖、可审计；只做一件事，出问题一眼能看出来 |

**能力边界（有意为之）**：不支持 UDP/QUIC（Chromium 会自动回落到 TCP，实测无影响）、
不做缓存、不做 MITM、只监听 `127.0.0.1`（不对外网暴露）。

---


## 附录 B：`teclub_relay.py` 完整代码

> 位置：`~/.config/teclub-relay/teclub_relay.py`（`/usr/bin/python3` 即可运行，无第三方依赖）

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""teclub-relay —— 本地 HTTP 代理（含 CONNECT）→ 上游 SOCKS5（teclub）

为什么需要它：
  Codex 桌面端（ChatGPT.app 内置的 codex-cli 0.163+，rama 网络栈）只认 HTTP(S) 代理，
  不支持 socks5:// / socks5h:// 出站代理。本脚本在 127.0.0.1 上开一个 HTTP 代理，
  把 CONNECT 隧道转给 teclub 的 SOCKS5 入口，并且**始终用域名**（ATYP=0x03）
  交给上游解析，绕开本机被污染的 DNS。

环境变量：
  TECLUB_LISTEN_HOST  默认 127.0.0.1
  TECLUB_LISTEN_PORT  默认 18080
  TECLUB_UPSTREAM     默认 socks5://proxy.teclub.cn:7012（支持 user:pass@）
"""

import os
import socket
import struct
import sys
import threading
from urllib.parse import urlsplit

LISTEN_HOST = os.environ.get("TECLUB_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("TECLUB_LISTEN_PORT", "18080"))
UPSTREAM = os.environ.get("TECLUB_UPSTREAM", "socks5://proxy.teclub.cn:7012")

CONNECT_TIMEOUT = 15
IDLE_TIMEOUT = 300
BUF = 65536


def log(msg):
    sys.stderr.write("%s\n" % msg)
    sys.stderr.flush()


class Socks5Error(Exception):
    pass


def _is_ip(host):
    for fam in (socket.AF_INET, socket.AF_INET6):
        try:
            socket.inet_pton(fam, host)
            return True
        except OSError:
            continue
    return False


def parse_upstream(url):
    u = urlsplit(url)
    if u.scheme not in ("socks5", "socks5h"):
        raise SystemExit("upstream 只支持 socks5:// 或 socks5h://，收到: %r" % url)
    return (u.hostname or "", u.port or 1080, u.username or "", u.password or "")


UP_HOST, UP_PORT, UP_USER, UP_PWD = parse_upstream(UPSTREAM)


def recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise Socks5Error("upstream 提前断开")
        buf += chunk
    return buf


def socks5_open(dest_host, dest_port):
    """开一条到 dest 的 SOCKS5 隧道（域名交给上游解析）。"""
    s = socket.create_connection((UP_HOST, UP_PORT), timeout=CONNECT_TIMEOUT)
    s.settimeout(CONNECT_TIMEOUT)

    methods = b"\x00\x02" if UP_USER else b"\x00"
    s.sendall(b"\x05" + bytes([len(methods)]) + methods)
    ver, method = recv_exact(s, 2)
    if ver != 5:
        s.close()
        raise Socks5Error("不是 SOCKS5 服务")
    if method == 0x02:
        u, p = UP_USER.encode(), UP_PWD.encode()
        s.sendall(b"\x01" + bytes([len(u)]) + u + bytes([len(p)]) + p)
        _, status = recv_exact(s, 2)
        if status != 0:
            s.close()
            raise Socks5Error("SOCKS5 认证失败")
    elif method != 0x00:
        s.close()
        raise Socks5Error("上游不接受的认证方式: %s" % method)

    if _is_ip(dest_host):
        host_bytes = socket.inet_pton(socket.AF_INET6 if ":" in dest_host else socket.AF_INET, dest_host)
        atyp = b"\x04" if ":" in dest_host else b"\x01"
    else:
        host_bytes = dest_host.encode("idna")
        atyp = b"\x03"
    s.sendall(b"\x05\x01\x00" + atyp + bytes([len(host_bytes)]) + host_bytes + struct.pack("!H", dest_port))

    _, rep, _, addr_type = recv_exact(s, 4)
    if rep != 0:
        s.close()
        raise Socks5Error("SOCKS5 连接被拒绝 (rep=%d)" % rep)
    if addr_type == 0x01:
        recv_exact(s, 4)
    elif addr_type == 0x03:
        recv_exact(s, recv_exact(s, 1)[0])
    elif addr_type == 0x04:
        recv_exact(s, 16)
    recv_exact(s, 2)
    s.settimeout(None)
    return s
```

上接同一文件（`socks5_open` 之后的部分）：

```python
def pump(src, dst):
    try:
        while True:
            data = src.recv(BUF)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        for s in (src, dst):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def read_headers(conn):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(BUF)
        if not chunk:
            return None
        data += chunk
        if len(data) > 262144:
            return None
    return data


def split_target(target):
    if target.startswith("["):
        host, _, port = target[1:].partition("]:")
        return host, int(port or 443)
    host, _, port = target.rpartition(":")
    if not host:
        return target, 443
    return host, int(port)


def relay(conn, upstream, rest):
    if rest:
        upstream.sendall(rest)
    t = threading.Thread(target=pump, args=(upstream, conn), daemon=True)
    t.start()
    pump(conn, upstream)
    t.join(timeout=1)


def handle(conn, addr):
    upstream = None
    label = "-"
    try:
        conn.settimeout(IDLE_TIMEOUT)
        raw = read_headers(conn)
        if not raw:
            return
        head, _, rest = raw.partition(b"\r\n\r\n")
        lines = head.split(b"\r\n")
        parts = lines[0].decode("latin-1").split(" ")
        if len(parts) < 2:
            return
        method, target = parts[0].upper(), parts[1]
        label = target

        if method == "CONNECT":
            host, port = split_target(target)
            log("CONNECT %s:%s" % (host, port))
            upstream = socks5_open(host, port)
            conn.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            relay(conn, upstream, rest)
            return

        # 普通 HTTP（绝对 URI 形式）
        if not target.lower().startswith(("http://", "https://")):
            conn.sendall(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n")
            return
        u = urlsplit(target)
        host = u.hostname or ""
        port = u.port or (443 if u.scheme == "https" else 80)
        path = (u.path or "/") + (("?" + u.query) if u.query else "")
        upstream = socks5_open(host, port)
        parts0 = lines[0].decode("latin-1").split(" ", 2)
        new_line = " ".join([parts0[0], path] + parts0[2:])
        headers = b"\r\n".join([new_line.encode("latin-1")] + lines[1:]) + b"\r\n\r\n"
        upstream.sendall(headers + rest)
        relay(conn, upstream, b"")
    except Exception as e:  # noqa: BLE001
        log("ERR %s %s: %s" % (addr, label, e))
        try:
            conn.sendall(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
        except OSError:
            pass
    finally:
        for s in (conn, upstream):
            if s is not None:
                try:
                    s.close()
                except OSError:
                    pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LISTEN_HOST, LISTEN_PORT))
    srv.listen(128)
    log("teclub-relay listening on http://%s:%d -> %s" % (LISTEN_HOST, LISTEN_PORT, UPSTREAM))
    while True:
        conn, addr = srv.accept()
        threading.Thread(target=handle, args=(conn, addr), daemon=True).start()


if __name__ == "__main__":
    main()
```

### 配套的 LaunchAgent

`~/Library/LaunchAgents/com.zhenliu.teclub-relay.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.zhenliu.teclub-relay</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>/Users/zhenliu/.config/teclub-relay/teclub_relay.py</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>TECLUB_LISTEN_HOST</key><string>127.0.0.1</string>
    <key>TECLUB_LISTEN_PORT</key><string>18080</string>
    <key>TECLUB_UPSTREAM</key><string>socks5://proxy.teclub.cn:7012</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key>
  <string>/Users/zhenliu/Library/Logs/teclub-relay.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/zhenliu/Library/Logs/teclub-relay.log</string>
</dict>
</plist>
```

### 配套的 Dock 启动器

`~/Applications/ChatGPT (teclub).app`（`LSUIElement`，图标复制自 ChatGPT）。
**跟随状态文件选线路**，所以点图标和敲 `codex-app` 行为一致：

```sh
#!/bin/sh
set -u
APP="/Applications/ChatGPT.app"
NO_PROXY="localhost,127.0.0.1,::1"
UID_NUM=$(id -u)
MODE=$(cat "$HOME/.config/codex-net/current" 2>/dev/null)

case "$MODE" in
  clash|*) PROXY="http://127.0.0.1:7890" ;;
  teclub)  PROXY="http://127.0.0.1:18080" ;;
esac

# 1) 选的是 teclub 时，确保本地中转在跑
if [ "$PROXY" = "http://127.0.0.1:18080" ]; then
  if ! nc -z -w 1 127.0.0.1 18080 >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$UID_NUM/com.zhenliu.teclub-relay" >/dev/null 2>&1
    i=0
    while ! nc -z -w 1 127.0.0.1 18080 >/dev/null 2>&1; do
      i=$((i + 1)); [ "$i" -gt 20 ] && break; sleep 0.25
    done
  fi
fi

# 2) 已有实例：参数正确就只激活，否则先退出
PID=$(pgrep -f "$APP/Contents/MacOS/ChatGPT" | head -1)
if [ -n "${PID:-}" ]; then
  if ps -o command= -p "$PID" | grep -q -- "--proxy-server=$PROXY"; then
    exec /usr/bin/open -a "$APP"
  fi
  /usr/bin/osascript -e 'quit app "ChatGPT"' >/dev/null 2>&1
  i=0
  while pgrep -f "$APP/Contents/MacOS/ChatGPT" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -gt 40 ] && break; sleep 0.25
  done
fi

# 3) 带代理启动（-n 必须，否则 open 不传 --args）
exec /usr/bin/open -n -a "$APP" \
  --env http_proxy="$PROXY" --env https_proxy="$PROXY" \
  --env all_proxy="$PROXY"  --env no_proxy="$NO_PROXY" \
  --env HTTP_PROXY="$PROXY" --env HTTPS_PROXY="$PROXY" \
  --env ALL_PROXY="$PROXY"  --env NO_PROXY="$NO_PROXY" \
  --args --proxy-server="$PROXY"
```

   否则重启就回到原点。

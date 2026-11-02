# MudiModem 架构与 3.0 重构计划 — 2026-11-02

## 进度
| 阶段 | 状态 | 已落地的内容 |
|---|---|---|
| **R0 打基础** | ✅ 完成（2026-11-02） | `manifest.txt` + 唯一的安装器 `src/installer/mudimodem-install`（install / uninstall / deploy / 自更新都走它，keep.d 在安装时生成）；在假根目录里端到端跑安装/升级/卸载的模拟测试（dash、busybox、路由器自己的 ash）；清单 lint；`tools/firmware.sh`（固件拉取+解包，sha256 固定）；`tools/emu.sh`（qemu 运行镜像的 lua / eco / busybox / 任意程序）；主题变量 lint，并修掉了 16 个未定义变量；文档重组，去掉 superpowers 流程痕迹，CLAUDE.md 精简 |
| **R1 前端结构** | ✅ 完成 | esbuild 构建（`src/web` → 提交的 `dist/views`，`--check` 防漂移）；主 chunk 拆成外壳 + 8 个模块，用 `kit/compose.js` 合成同一个组件，拆分前后 104 个方法逐字节一致；`kit/rpc.js` 是唯一碰 `/rpc` 的代码；全页简体中文（`kit/i18n.js` 跟随 GL 语言，`locales/zh-cn.js`），浏览器审计确保零漏翻；审计里的界面问题（确认、流量提示、控制台、手机布局、指标说明）已修。决定：频段 / 锁小区 / 配置仍在主 chunk 里（外壳本身需要它们的数据），按源码模块拆分而不是运行时懒加载 |
| R2 插件模块化 + 事务 | 🟡 事务部分已完成 | 待确认文件记录 `DEADLINE`/`APPLIED`；新增 `change_status`；`confirm` 返回 `was_pending`；页面按路由器的截止时间倒计时，加载时恢复，横幅在所有标签页显示，Keep/Revert 如实报告结果。插件拆分模块还没做：R3 会把插件变成薄转发，现在拆的收益有限 |
| R3 守护进程 | ✅ 完成 | **① 采集器**：`mudimodemd`（镜像自带的 eco）接管了采集器：射频 + 电池采样、历史文件、eMMC 备份和恢复、推送、浏览器在线检测，契约不变（文件格式、`/ws` 名字和结构都一样）。影子比对在模拟环境里做：两套实现跑同一个假 GL 总线，样本、电池记录、推送、备份分段和 ubus 调用顺序都要一致（`test/collectd-emu.test.py`）；文件和电池辅助函数在宿主 Lua、路由器 Lua、eco 三个运行时下和 Python 逐字节一致（Python 删除后改为固定答案：`test/jsonl-golden.test.py`、`test/compat-golden.test.py`）。**③ AT 队列**：控制台的 AT 引擎（`src/lib/mudimodemd/at.lua`，原插件逻辑逐条搬过去）和先进先出队列（`atq.lua`，最多 4 个）在守护进程里；插件的 `at_console` 只通过 oui.ubus（cosocket，不阻塞 nginx）转发，每次最多等 20 秒，没跑完就返回 `{pending, id}`，页面用 `at_result` 接着等。插件里少了 2 处 `io.popen`。守护进程总是运行（`ubus call mudimodem health` / `at_start` / `at_wait`）。演练：ubusd 重启、cell_info 卡住、第二个实例、慢 AT 期间采样不停、slot 0 不发 sub_id、GL AT 服务缺失时回退到直连口工具。上机只剩 🔴 确认（`tools/verify.sh` 第 7、8c 步）。**② 任务**：`jobs.lua`（`job_start` / `job_wait`，同类任务不会并发，第二次启动会并入正在跑的那次）+ `tasks.lua`：版本检查的 curl、AT 库检查/刷新（python 工具）、小区扫描都在守护进程里跑，插件只负责策略和转发，页面用 `job_result` 接着等。扫描通过本机 `/rpc` 调 GL 自己的 `modem.scan_cell_tower`（带 `glinet` 头，和 gl-session 的 `call` 走的是同一条本机回环，但超时是我们自己的 330 秒；gl-session 的 HTTP 客户端 30 秒就放弃），扫描成功后由守护进程记事件。插件里又少了 3 处阻塞调用（curl、两次 python3）。测速和自更新仍由插件以 detach 方式启动（一次 fork，很快），删除 Python 时（⑤）再迁。**④ 变更事务**：见 D2。Apply 不再让 nginx 停 1 秒；锁小区的"立即回滚"（AT 解锁和清 GL 存储）不再在 worker 里跑。演练在 `test/change-emu.test.py` 里：真实插件、守护进程、路由器 busybox 下的真实看门狗，加上记录所有 `gl-session call` 的假 GL。覆盖：到期自动回滚、Keep、回滚窗口内守护进程被 SIGKILL、窗口内 ubusd 重启、看门狗不布防就不写（守护进程谎报已布防也不写）、守护进程不在时退回旧路径、锁小区立即回滚（pending 里的 sub_id，然后清 GL 存储）。**⑤ 去掉 Python**：AT 直连口（`atport.lua`，pty 演练 `test/atport-emu.test.py`）、AT 库同步（`tasks.lua`，`test/library-emu.test.py`）、测速和定时测速（`speedtest.lua`，假测速服务器演练 `test/speedtest-emu.test.py`）都改到 eco；Python 采集器、`cellular_compat.py`、`mudimodem-deps`、`mudimodem-speedtestd` 服务全部删除。原来以 Python 为参照的对比测试改成固定答案（`test/golden/`，在删除前由 Python 生成）。安装器新增"退役"步骤：停掉并禁用旧清单里有、新清单里没有的服务，删除不再发布的文件；2.x 机器没有已安装的清单，用一份明确的 Python 文件列表处理（用户设置从不动）。路由器上不再有任何 Python，静态检查会拦住新的 Python 调用 |
| R4 新功能 | ✅ 完成 | **4.1 / 4.4 / 4.8（不上机完成）**：在模拟里运行 GL 自己的 `cellular_manager`、`modem_AT` 和 `glc`（`test/emu/gl-real.sh`），加上分析基带固件，把原先只能上机确认的行为都定了下来，然后按确定的行为直接实现，不加兜底层：采集器读 GL 的 `get_signals`；频段页的 5G 方式（仅 NSA / 仅 SA = GL 的空列表，经确认或回滚）；备用卡的频段只存进 GL，由 GL 在那张卡拨号时下发。**AMBR**：蜂窝测速结果记录当前 SIM 的运营商承载上限（`cellular.sim info` 的 `ambr_dl` / `ambr_ul`），结果卡片标出"已达上限"（≥ 90%）；演练 `test/speedtest-emu.test.py`。**吞吐车道**：采集器每个射频周期读蜂窝设备的 `/sys/class/net/<dev>/statistics` 字节计数，算出 `rx_kbps` / `tx_kbps` 写进样本（设备从 `network.interface dump` 解析，最多每分钟一次；重连、换卡、计数回退时留空），Tracking 信号图下面多一条吞吐车道；`src/lib/mudimodemd/net.lua`，演练在 `test/collectd-emu.test.py`。**连通性探测**：守护进程每 30 秒（失败时每 10 秒）从蜂窝设备 ping 一次 GL 自己多 WAN 设置里的跟踪 IP（和 GL 自己的检查方法一样，`ping -I <设备> -c 1`，一个不通就换下一个），结果挂在下一个样本上（`ping_ms` / `ping_lost`）；之前通过、连续两次不通记一条"断网"事件，恢复时记"恢复联网"和断网时长；Tracking 多一条 ping 车道。**模组崩溃**：GL 在模组自恢复模式下会把转储移到 `/data/vendor/modem_crash_log/`，守护进程每分钟看一次，有新转储就记一条"Modem 崩溃"事件。`src/lib/mudimodemd/link.lua`，演练同在 `test/collectd-emu.test.py`。**不断网的邻区**：锁基站页的"读取邻区"按钮通过守护进程的 AT 队列发一次只读的 `AT+QENG="neighbourcell"`（只在点击时，不轮询），LTE 行解析成可锁定的行（EARFCN + PCI，照常确认或回滚），其他格式原样显示；5G SA 下 Modem 本来就不报邻区，页面如实说明。`src/web/main/neighbours.js`。**测速精度和配置**：每个方向同时跑多条限时连接（带流量上限），速率取网卡计数在热身结束到第一条连接结束之间的稳定段（排除 TCP 慢启动），窗口太短时退回 curl 的总量（`measure_down` / `measure_up` 记录用了哪种）；时延改为请求发出到首字节（不含建连）；"快速"（2 条、最多约 29 MB）和"完整"（4 条、最多约 290 MB）两档，服务器可选 Cloudflare 或自建 LibreSpeed；结果记录流量消耗，历史图有刻度和日期。演练 `test/speedtest-emu.test.py`（限时截断、LibreSpeed 端点、设置校验）。**长期小时汇总**：采集器把每个样本计入"这一小时、这个小区"的累计（`summary.lua`：RSRP/SINR/RSRQ 的最小/平均/最大、ping 丢包、吞吐、无服务时长），整点追加一行到 `/etc/mudimodem/summary.jsonl`（闪存，每小时写一次，保留 30 天，约几百 KB；正常停止时写入未满的一小时）；插件 `get_summary {days}`；Tracking 新增"长期"卡片（7 / 30 天的每小时 RSRP 范围和平均、无服务时段、按停留时间排序的小区表）。演练在 `test/collectd-emu.test.py`，单元测试 `test/daemon-summary.test.lua`、`test/backend-summary.test.lua` |

姊妹篇：`docs/audit-2026-11-02.md` 逐条列出了具体问题。这一篇回答的是另一个问题：**这些问题为什么会
反复出现，结构上应该怎么改。** 所有关于固件的结论都来自官方 `e5800-4.10.0_release5` 镜像（解包在
`firmware/rootfs/`）。标记：🟢 在镜像或源码里读到 · 🟡 来自二进制 · 🔴 需要上机确认。

---

## 0. 结论
把"做事"的部分从 nginx 里移出去，交给一个**常驻守护进程 `mudimodemd`**。它用 4.10 镜像自带的
**lua-eco**（Lua 5.4 + 事件循环）编写，统一负责采样、变更事务（确认或回滚）、长任务和 AT 队列。

nginx 插件只保留三件事：方法白名单、参数校验、直接读历史文件。

前端改为"外壳 + 共享工具包（kit）+ 统一数据层（store）+ 按标签懒加载"。打包和安装由**一份清单**驱动。

这样带来的结果：
- Python 依赖整个去掉。
- 长请求、阻塞后台、倒计时丢失、5 份文件清单互相漂移，这几类问题从结构上不再存在。

整个迁移分 5 个阶段，每个阶段都能单独发布（§6）。

---

## 1. 现状诊断：上一轮的 bug 背后有哪些结构原因

| # | 结构问题 | 它导致的症状 | 证据 |
|---|---|---|---|
| S1 | **业务逻辑跑在 nginx worker 里**，而 4.10 只有 **1 个 worker** | 控制台单步最长 60 秒、每次 Apply 都 `sleep 1`、Config 页 curl 最多 8 秒、库刷新要启动 python3。**这些期间整个 GL 后台（包括 /ws 推送）都会停住**；扫描还受 `/cgi-bin/` 300 秒超时限制 | 🟢 镜像 `etc/nginx/nginx.conf:3` 是 `worker_processes  1`，`lib/functions/gl_util.sh` 的 `set_nginx_thread` 对 e5800 不做修改；插件里有 **25 处** `os.execute` / `io.popen`（`src/rpc/mudimodem`）；🔴 上机用 `ps` 确认。CLAUDE.md §5 的"4 workers"是 4.8 时的情况 |
| S2 | **状态散落在多个进程和临时文件里** | Keep / Revert 的结果没人认领，倒计时只存在浏览器里（审计 §1.1 / §1.2）；到处是"进程是不是已经死了"的检测代码 | `PENDING` 是给 sh `source` 的 key=value 文件，里面内嵌单引号包住的 JSON，**没有截止时间**；另有 `ARMED` 握手文件，测速状态文件里的 `pid` / `started`，`at.inflight`，`glbattlimit.pid`。插件写文件后拉起看门狗，再 `sleep 1` 检查 `ARMED` |
| S3 | **三种语言、两个 Lua 版本，再加一个要事后安装的运行时** | 固件升级后 Python 没了，要靠 `mudimodem-deps heal` 联网重装，期间没有实时数据；同一份 GL 数据结构的知识写了两遍 | `cellular_compat.py` 和插件各有一份 `pick_modem` / `active_slot`；采集器每 10 秒要 fork 3 次以上的 `ubus` 子进程（`mudimodem-collectd:108, 247, 281`） |
| S4 | **前端 5 个 chunk 没有任何共享代码** | 引用了不存在的主题变量，风格不统一，一处改动要改四个地方 | `rpcSilent` 有 4 份，`injectStyle` 有 5 份；"预加载 + 推送 + 补洞 + 停滞检测"在状态条、Tracking、Battery 里各实现了一遍（`*_HOLE_MS` 定义了 3 次）；4 套按钮类名 |
| S5 | **主 chunk 什么都管**（2163 行：外壳、状态条、Bands、Cell lock、Config） | 倒计时横幅只能画在两个标签页里；改一个标签页就要重新测试整个主 chunk | `src/views/mudimodem.js` |
| S6 | **"装哪些文件、装到哪"写了 5 份**（✅ R0 已解决） | 漂移只能靠当时的 `test_install_wiring.sh` 事后核对；安装要逐个下载约 30 个文件，中途失败会留下新旧混杂的状态 | `install.sh`、`tools/deploy.sh`、`uninstall.sh`、`tools/verify.sh`、`src/upgrade/keep.d/mudimodem`（R0 已删除，改为安装时生成）各自维护一份路径列表 |
| S7 | **文档就是变更日志** | 新人或 AI 无法分辨哪些是现状、哪些是历史 | CLAUDE.md 1030 行，4.8 的历史、"更正的更正"、§12 的状态日志混在一起；specs 和 plans 合计 45 份 |

**结论：** S1 + S2 是安全网和长任务问题的根源，S4 + S5 是 UI 问题的根源，S3 + S6 是升级和安装问题的根源。
只修单个 bug，同类问题还会再出现；要根除，需要调整的是这三组结构。

---

## 2. 决定方案的事实：4.10.0 镜像自带的运行时 🟢

这些包都登记在镜像的 `usr/lib/opkg/info` 里，属于只读的 ROM，**固件升级不会删掉它们**，这一点和我们装的 python3 不同：

| 组件 | 用途 |
|---|---|
| **lua-eco 3.19.1**（`/usr/bin/eco`，Lua 5.4 + 事件循环） | 写守护进程：`eco.ubus`（`add` 注册对象、`subscribe`、`listen`、`notify`、`call`），`eco.time`（`at`、`timer`、`sleep`），`eco.sys`（`exec`、`sh`、`signal`），`eco.file`（`flock`、`inotify`），`eco.http` + `eco.ssl`，`eco.socket`，`eco.termios` |
| `libubus-lua`、`uloop`、`luaposix`、`luasocket`、`lsqlite3`（5.1 和 5.4 都有）、`lua-cjson`（5.1 和 5.4 都有）、`sqlite3-cli`、`curl`、`jsonfilter` | 补充工具 |

- **GL 自己的 websocket 会话守护进程 `/usr/sbin/gl-ngx-session` 就是 `#!/usr/bin/eco` 脚本**，作者是 oui 的作者。
  也就是说，这是 GL 在这台机器上自己选用的守护进程运行时，不是我们引入的冷门依赖。
- 已在开发机上实测：用 `qemu-aarch64-static -L firmware/rootfs firmware/rootfs/usr/bin/eco` 能跑起来，
  `eco.time` 定时器和 `cjson` 都正常。所以守护进程可以和现有 Lua 测试一样，**在路由器自己的解释器下做单元测试**。

⇒ Python（采集器、测速、AT 直连工具、库工具）可以全部换成 eco。随之可以删掉 `mudimodem-deps`、升级后的
heal 流程，以及依赖 opkg 和网络的那条路径。

---

## 3. 目标架构

```
浏览器（GL SPA）
 ├─ GET /views/gl-sdk4-ui-mudimodem*.common.js   外壳 chunk（含 kit + store）+ 各标签页懒加载 chunk
 ├─ /ws   mudimodem.collect / .battery / .event / .change / .job   ← 守护进程经 gl-session notify 推送
 └─ POST /rpc  mudimodem.<method>
        │
        ▼
 nginx 插件 /usr/lib/oui-httpd/rpc/mudimodem   （Lua 5.1，目标 ≤ 300 行，不含任何阻塞调用）
   · 方法白名单 + 参数校验（validator 照旧）
   · 历史读取：直接读守护进程写的文件（大数据量，不经 ubus）
   · 其他所有方法 → ubus call mudimodem <method>（cosocket，不阻塞 worker）
        │
        ▼
 mudimodemd   （eco / Lua 5.4，procd 托管，单进程，唯一的写入方）
   ├─ sampler   RF：优先读 GL 的 cellular.collect get_signals（零 AT），cell_info 只用来补 cell_id/TAC
   │            电池：sysfs；吞吐：/sys/class/net/*/statistics；推送前检查 gl-session has_websocket
   ├─ store     tmpfs jsonl（格式与 2.x 相同）+ eMMC 两段式追加备份；以后可加小时汇总（sqlite 可选）
   ├─ change    变更事务：prepare → applied(deadline) → kept | reverted | expired | failed
   │            状态存在 /etc/mudimodem/change.json；每次状态变化都推送 mudimodem.change 并记事件
   ├─ jobs      扫描、测速、库刷新、自更新、长 AT 序列：立即返回 job_id，进度通过 mudimodem.job 推送
   ├─ at        串行 AT 队列：优先 GL 的 modem.CPU.AT，失败时用 eco.termios 直连 /dev/at_mdm0；记录 inflight
   └─ battery   充电上限监视（glbattlimit 的逻辑并入，sysfs 写入保持不变）

 /usr/sbin/mudimodem-panic   （纯 sh，不依赖守护进程，ssh 可调用，作为带外恢复手段）
```

### 关键设计决定

**D1 状态和定时器全部归守护进程，插件不保存任何状态。**
- nginx 只有 1 个 worker（S1），而且 reload 时 `ngx.timer` 会被取消，所以定时器不能放在 nginx 里。
- 原来"外部看门狗 + ARMED 握手 + `sleep 1`"这套机制，改成守护进程内的 `time.at(deadline)`。
- 截止时间用路由器的时钟。页面挂载时读 `change.status` 就能恢复横幅，这样审计 §1.2 的问题从根上解决。

**D2 安全网不依赖守护进程（R3 ④ 已定）。** 这是整个设计里最需要谨慎的一点：
- 计时、回滚、开机检查、`panic` 全部留在 `mudimodem-revert`（纯 sh，ssh 下什么都不运行也能用）；待确认状态仍是
  sh 可以 `source` 的 pending 文件。
- 守护进程只接手原来会卡住 nginx 的两段等待：
  - **布防**（`change_arm`）：用插件原来的同一条命令拉起看门狗，等它写下布防标记再回答。插件**自己再检查一次标记**，
    没有标记就不写（守护进程说"已布防"也不算数）。插件以前为此在 worker 里 `sleep 1`。
  - **锁小区的"立即回滚"**（`restore` 任务）：运行同一个 `restore-now`，再加 `--reconcile` 清掉 GL 存储里的锁。
    以前这一步由插件在 worker 里用 glc 做；守护进程不是 nginx worker，可以像 `panic` 一样经 gl-session 回到 `/rpc`
    （`gl_unlock_slot`，sh 里本来就有）。在 nginx worker 里这条回环会因为唯一的 worker 被占着而卡死，
    所以退回路径（守护进程不在时）不带 `--reconcile`。
  - 守护进程完全没有应答时，插件退回原来的进程内路径（慢，但同样安全）。
- 原计划把计时搬进守护进程、sh 只做兜底，放弃了，理由有三：
  - sh 看门狗本来就是精确计时（布防即开始倒数）；
  - 再加一个计时器，只会多出"两边谁来回滚"的协调问题，安全上没有收益；
  - procd 停服务只按 pid 发信号（🟢 `/sbin/procd`：`kill(pid, SIGTERM)`，然后是 `SIGKILL`，从不发给进程组），
    所以守护进程拉起的看门狗在守护进程重启后照样存活，和 nginx 拉起的一样。
- `confirm` 返回 `was_pending`，"太晚了，已经回滚"会如实告诉用户（审计 §1.1，已实现）。

**D3 所有可能超过几秒的操作都做成任务（job）。**
- 已经是任务的：AT 序列（`at_start` / `at_wait`）、扫描、库检查/刷新、版本检查、锁小区的回滚（`job_start` / `job_wait`）。
- 插件每次最多等 20 秒；没做完就回 `{pending, id}`，页面用 `at_result` / `job_result` 接着等。每一片都要在 30 秒内
  返回，这是 GL ubus 代理的上限（实测）。结果在守护进程内存里保留 5 分钟。
- 同一类任务同时只跑一个（扫描、库检查/刷新、回滚），第二次启动会并入正在跑的那次，所以刷新页面后再点一次就能接上。
- 测速和自更新仍由插件以 detach 方式启动（一次很快的 fork），留到 ⑤ 处理。

**D4 历史数据由插件直接读文件。** 24 小时的数据可能有几 MB，不适合整包走 ubus。守护进程是唯一的写入方，
插件只读。文件格式（`samples.jsonl` 的 schema）保持不变，前端不受影响。

**D5 GL 数据结构的知识只保留在守护进程里一份**，用 Lua 写。插件不再解析 GL 的数据结构，所以也就不存在
"5.1 和 5.4 公共子集"的约束。

**D6 前端把所有用到的 GL 内部接口集中到一个适配层。**
- 涉及的接口：`$rpcRequest`、`statusMap` / `moduleStatus`、`window.$i18n`、eval 加载器、主题变量名。
- GL 下次改版时，只需要改这一个文件。

**D7 前端引入构建步骤，但终端用户永远不需要构建。** 这是一个需要维护者拍板的决定，见 §7。
- 源码改成 ES 模块（`src/web/**`），用 esbuild 打包成和现在完全相同的
  `module.exports = (function(){…})()` 形式的 chunk。仍然是 `render(h)`，GL 的运行时没有模板编译器，
  这一点不变；这次重构**不**迁移到 SFC 模板。
- 构建在 CI 里完成，产物放进发布包（D8）。install 永远不需要在路由器上构建。
- Node 本来就在开发机上用于测试，不增加新的依赖类别。

**D8 发布包加一份清单，作为唯一的数据源。**
- `manifest.txt` 是唯一的权威列表（已实现）。每条记录包含：类型（file / gz / cache / default / own / keepd / service）、
  源文件、目标路径、权限；服务按出现顺序启动，卸载时反序停止。
- `install`、`uninstall`、`deploy`、`verify`、`keep.d` **全部由它驱动**（已实现）。原来的 `test_install_wiring.sh`
  拆成 `test/manifest.test.sh`（清单本身）、`test/installer.test.sh`（实际跑安装）和 `test/static.test.sh`（剩下的代码约束）。
- `tools/build.sh` 已经能生成 `build/mudimodem-<ver>.tar.gz` 和 `sha256`，`deploy.sh` 用的就是它；还没做的是让 CI 把它作为 release 发布。
- 安装流程：一次下载 → 校验 → 解到暂存目录 → 停服务 → 原子替换 → 写入版本号 → 启服务。自更新走同一条路径。
  这样可以替代现在逐个下载约 30 个 raw 文件的方式。
- 为什么不做 ipk：升级会清掉 opkg 的安装记录，而 keep.d 只恢复文件，两者很难协调。tarball 加清单更适合这台机器的升级模型。

### 不改的部分（经过验证的选择，保留）
- chunk 的 eval 加载方式、菜单 JSON、`global_sockets`；`/rpc` 入口仍然是不带点的 `mudimodem` 插件（点号限制）。
- 频段配置和锁小区继续走 glc 调 GL 的 `get/set_band_config` 和 `set_cell_tower`。语义不变：只写一次、失败即关闭、通过 GL 自己的存储保证持久。
- "确认或回滚"的交互方式，三层频段模型，sub_id 先按 slot 再按 IMSI 解析的规则，从不发送 `sub_id=0`。
- keep.d 作为固件升级时的保留清单；web 文件放在 `/usr/share/mudimodem/www`，通过 nginx alias 提供。

---

## 4. 前端分层

```
src/web/
  gl/        adapter.js     $rpcRequest / moduleStatus / $i18n / 主题探测（唯一碰 GL 内部的地方）
  kit/       rpc.js         rpc（交互用，有 GL 横幅）/ rpcSilent（后台用）/ job（等待任务）
             store.js       数据流：rf / battery / events / change / jobs
                            预加载窗口 + 推送合并 + 补洞 + 停滞检测 + 换 SIM 断线 + 路由器时钟偏移，全部只写一次
             i18n.js        t(key, vars)；mergeLocaleMessage 注入；跟随 $i18n.locale；缺失时回退英文
             theme.js       语义色到 GL 变量的映射（good → --secondary 等），配合 lint 测试
             fmt.js         频段 / ARFCN↔MHz / 时间 / 单位（现在分散在各个 chunk 里）
             ui/            Card、Btn、Seg、Badge、Tip（点击展开，支持触屏）、Banner、WindowPicker
             chart/         时间轴、按像素列 min/max 抽稀、多车道布局、HTML 图例和读数（不会在手机上溢出）
  shell/     index.js       标签栏（可横向滚动，记住上次的标签，支持 hash 深链）
                            状态条、全局变更横幅（任何标签页都显示）、任务提示
  tabs/      tracking/ bands/ lock/ console/ speedtest/ battery/ config/   每个标签一个懒加载 chunk
```

- **kit 只打包进外壳 chunk 一次**，再通过 `provide` / props 传给各标签页，这样不会在每个 chunk 里重复一份。
  每个标签页的 chunk 只包含自己的组件。
- 现在的 Node 测试方式（eval chunk，传入桩 `h`）保持不变。另外 kit 里的纯函数（store 的合并 / 补洞、
  fmt、抽稀）可以直接单独做单元测试，不再需要整块 eval。
- 新增的 lint 测试：
  - 每个 `var(--x)` 都必须在 GL 主题里定义过（审计 §2.1）。
  - 每个 `t("key")` 都必须在 en 表里存在；zh-cn 的覆盖率要报告出来。
  - 不能有 chunk 绕过 `gl/adapter.js` 直接访问 `window.$rpcRequest`。

---

## 5. 守护进程与插件接口

`mudimodemd` 在 ubus 上注册一个对象 `mudimodem`。服务端调用不受点号限制，浏览器碰不到它（oui 的 `/rpc` 只分发给
Lua 插件和 glc）。插件按方法一一转发。已实现的部分：

| 方法 | 说明 |
|---|---|
| `health` | 采样计数、最近一次错误、浏览器是否在线、AT 队列和任务的状态、连通性（`link`、探测和丢包次数、断网次数）、模组崩溃次数 |
| `at_start {cmd, timeout}` / `at_wait {id, wait}` | 控制台的 AT 序列（`at.lua` + `atq.lua`），一次一个，最多排 4 个 |
| `job_start {kind, args}` / `job_wait {id, wait}` | kind：`version_fetch`、`lib_check`、`lib_refresh`、`scan`、`speedtest`、`restore` |
| `change_arm` | 拉起回滚看门狗，等它布防后回答（D2） |

没有做、也不打算按原草案做的：把 bands / lock 的读写整个搬进守护进程（插件通过 glc 读写本来就不阻塞 nginx），
以及 `change.status/confirm`（这两步只是读写 pending 文件，留在插件里最简单）。测速是守护进程的 `speedtest` 任务（设置、历史、状态文件由插件直接读写）；电池限充仍由 `glbattlimit`（sh）负责。

守护进程写的文件：`/tmp/mudimodem/`（样本、电池、`latest.json`、事件，24 小时，RAM）；`/etc/mudimodem/`（长期小时汇总 `summary.jsonl`、测速历史和设置、可选的历史备份；随固件升级保留）。它自己记的事件：`link`（断网 / 恢复联网）、`modem`（模组崩溃）、`user`（扫描）。

**变更事务（实际实现，R3 ④）**：
```
apply   插件写 pending ─▶ change_arm（守护进程拉起看门狗，等待标记）─▶ 插件确认 ARMED ─▶ glc 写入 GL 存储
到期    看门狗：仍有 pending 且 nonce 是自己 ─▶ restore_from_pending ─▶ 事件 + 推送（失败时保留 pending）
Keep    插件删除 pending，看门狗醒来后什么都不做
Revert  频段：插件内用 glc 写回快照；锁小区：守护进程的 restore 任务（restore-now --reconcile）
```
- 页面按路由器的 deadline 倒数，加载时用 `change_status` 恢复；到期后询问路由器，不自己假设已经回滚（已实现）。
- 没有做：`mudimodem.change` 推送。另一个浏览器里的 Keep / Revert 要等到期或刷新才会反映出来。

**采样源**（已实现，行为在模拟里用 GL 的真程序确认过）：
- 每个周期读 GL 的 `cellular.collect get_signals`。GL 自己每 10 秒对两张卡各跑一遍 QENG+QCAINFO，我们不再重复。
- `get_signals` 的行就是 `cell_info` 的行去掉等级，没有小区号和 TAC：等级按 GL 的阈值补上（`cellular_compat.with_levels`），小区号和 TAC 只在主载波（制式/频段/PCI/频点）变化、每 60 秒，或 GL 还没有新数据时读一次 `cell_info`；无服务时 GL 的行本身就说明了一切，不读。

---

## 6. 迁移路线：每个阶段都能单独发布

| 阶段 | 内容 | 用户可见的变化 | 验收标准 | 需要上机？ | 预估 |
|---|---|---|---|---|---|
| **R0 打基础** ✅ | `manifest.txt` 加唯一的安装器；模拟安装测试；清单 lint；CSS 变量 lint；固件和模拟工具；文档重组 | 无（`install.sh` 先暂存全部文件再安装；`deploy.sh` 只需一次 ssh 传输） | 全部测试通过，包括在路由器自己的 ash 下跑的安装/卸载测试 | 否 | 完成 |
| **R1 前端结构** | esbuild 构建步骤（从 R0 挪过来）；kit、store、外壳拆分，Bands / Lock / Config 拆成独立 chunk；全局横幅；i18n 框架加 zh-cn；顺带完成审计第一批 UI 修复 | 中文界面、手机布局、暗色主题、横幅在所有标签页显示 | 现有 chunk 测试迁移后通过；新增的 lint 通过；375 px 宽时没有横向滚动 | 建议 | 4–6 天 |
| **R2 插件模块化 + 事务** | 插件拆成 `/usr/lib/lua/mudimodem/*.lua`（`lua_package_path` 已包含 `/usr/lib/lua/?.lua` 🟢）；`change.json` 加 deadline，`confirm` 返回 `was_pending`；仍然沿用 sh 看门狗 | Keep / Revert 的结果如实显示；刷新页面后横幅恢复 | Lua 隔离测试（宿主机和路由器 Lua 两轮）覆盖：晚到的 confirm、回滚失败、刷新后恢复 | 建议 | 2–3 天 |
| **R3 守护进程** | 依次接管：①采样器，先**影子运行**，与 Python 采集器同时跑、逐条比对样本 → ②任务（扫描、测速）→ ③AT 队列 → ④变更事务（保留 sh 兜底守卫）→ ⑤删除 Python 和 `mudimodem-deps`；插件里的阻塞调用清零 | 升级后实时数据立即可用；扫描不再超时；控制台和库刷新不再卡住整个后台 | 在模拟的 GL ubus 环境里做集成测试（§6.1）：样本和 Python 版逐条一致；人为制造的崩溃、重启、超时、ubus 断开场景下，事务都能按时回滚 | 只用来最后确认 🔴 项 | 7–10 天 |
| **R4 新功能** | 邻区、AMBR、SA / NSA 子模式、吞吐和连通性两条车道、长期汇总（审计 §4） | 新功能 | 每项各自的验收标准 | 视功能而定 | 每项 0.5–2 天 |

**R0 的文档重组（已完成）：**
- CLAUDE.md 压缩到约 100 行：目标、验证原则（固件优先、模拟优先、真机最后）、不可违反的规则、目录、命令、文档索引。
  原文原样存档在 `docs/history/CLAUDE-2.2.0.md`。
- 当前有效的平台和领域知识整理到 `docs/knowledge.md`，只保留 4.10 上成立的事实，去掉 4.8 历史和"更正的更正"。
- 版本记录放在 `CHANGELOG.md`。
- 删除 superpowers 留下的 plans（已完成的执行清单，开头都有强制使用某个 skill 的指令）；specs 移到 `docs/design/`，并注明只是背景资料。
- 修正了审计 §7 列出的漂移，契约文档补上了这次从镜像里读到的事实（1 个 nginx worker、300 秒 glc 超时、i18n、GL 自己的 10 秒采样、AMBR、cellular.dial_status）。

### 6.1 模拟优先的验证策略（2026-11-02 已验证可行）
维护者的要求：能用固件确认的就用固件确认，尽量不做实机测试。下面这几层都已经在开发机上跑通：

| 层 | 做法 | 状态 |
|---|---|---|
| GL 的行为 | 直接读镜像：明文 Lua / JSON / JS 用 Python 分析，二进制用 `reference/4.10/re-tools/` | ✅ 一直在用 |
| 路由器 Lua（插件） | `tools/emu.sh lua`：镜像的 Lua 5.1（LNUM）+ GL 的 cjson | ✅ test-local 的 router 轮 |
| 路由器 shell 脚本 | `tools/emu.sh sh`：镜像的 busybox ash，PATH 里只放镜像自己的 applet | ✅ 所有 sh 测试都在这里跑 |
| 安装器 | 在假根目录（`MUDIMODEM_ROOT`）里跑完整的 install / update / uninstall | ✅ `test/installer.test.sh` |
| **GL 的 ubus 服务** | `test/emu/gl-bus.sh start <dir> <场景.json>`：在 qemu 里跑镜像的 `ubusd -s <sock>`，加上 `test/emu/fake-gl.lua`（eco 写的假 `cellular.*` / `modem.CPU.AT` / `gl-session`，按契约文档的结构返回，支持失败、卡住、换小区的序列），把每次调用和推送记到 jsonl；被测代码通过真正的 ubus 协议调用 | ✅ 采集器的两套实现都在上面跑端到端测试（`test/collectd-emu.test.py`）。顺带用它确认了一个线上事实：推送到浏览器的帧没有 null 键，空数组变成 `{}`（GL 的 gl-session 就是这么转发的） |
| **页面渲染** | `tools/preview.js`：无头 Chromium + 镜像里 GL 的主题 CSS + Vue 2.6.12 运行时 + 假的 `/ws`、`/rpc` 数据，按 GL SPA 的方式 eval 我们的 chunk；`--matrix` 覆盖所有标签页 × 桌面/手机 × 亮/暗，页面报错或出现横向滚动即失败 | ✅ 接入 test-local；已经抓出并修掉控制台在手机上溢出、存储被禁用时报错这两个问题 |
| **GL 自己的蜂窝程序** | `test/emu/gl-real.sh <目录> <命令>`：在私有的挂载 + 进程命名空间里，用 overlayfs（镜像在下、可写层在上）+ chroot + binfmt 运行镜像的 `ubusd` 和 `cellular_manager`；`/proc/gl-hw-info` 按设备树的 gl-hw 节点提供；`/dev/smd9` 接 `test/emu/fake-modem.py`（伪终端后面的假 RG650V，回真机抓过的回复，记下收到的每条 AT）；GL 的 syslog 收到 `syslog.txt`。GL 自己拉起 `modem_AT`，整条链路都是 GL 的代码 | ✅ 用它测出了 `get_signals` 的真实结构和频率、GL 的信号等级阈值；`test/gl-real.test.py` 让采集器对着 GL 的真程序跑。QMI（拨号、流量统计）模拟不了 |
| nginx + oui 插件 | 镜像的 nginx 在 qemu 下用临时配置运行（2026-10-28 已用来检查 alias） | 可用；如果需要端到端测 `/rpc`，再在它上面搭 |

真机只用来确认 🔴 项：射频状态、模组的真实回复、实际耗时。这些项集中列在 `docs/cellular-api-4.10.md` §6，攒在一起统一确认。

---

## 7. 风险与取舍

1. **eco 是 GL 维护的组件**，以后的固件可能改它的 API（4.10.0 里是 3.19.1）。应对：
   - 只用一个很小的 API 子集，并封装在 `mudimodemd/sys.lua` 里。
   - 在 qemu 下用镜像自带的 eco 跑契约测试。
   - install 和 verify 检查 `eco` 是否存在以及版本。
   - 新固件出来时，只需要更新 rootfs 再跑一遍测试。
2. **单个守护进程是单点故障。** 应对：procd 自动重启；Config 页显示 `health`；sh 兜底守卫和 `panic` 不依赖守护进程（D2）。
3. **构建步骤推翻了 CLAUDE.md §5 里"不引入工具链"的决定。** 理由：
   - 终端用户仍然不需要构建，只有维护者和 CI 需要。
   - 共享代码和 i18n 只能靠复制粘贴、在 5 个 chunk 之间手动保持一致，这本身就是 S4 的问题来源。
   - 如果你坚持不要构建，也有替代方案：kit 做成一个单独的 chunk，由外壳 eval 一次后注入各标签页。
     这样能拿到大约七成收益，但没有 import、tree-shaking，也没有静态检查。
4. **R3 的改动量最大。** 应对：
   - 文件格式和 `/ws` 推送的名字、结构**完全不变**，前端在 R3 期间不需要跟着改。
   - 采样器先影子运行做比对。
   - 按 ①→⑤ 的顺序一个模块一个模块接管，每一步都能单独回退。
5. **现有测试和当前的文件布局绑得很紧**（尤其是 Python 采集器的 1100 行测试）。应对：随模块一起迁移；
   用例场景（时钟回拨、修剪、两段式轮转、推送前检查）照搬到 eco 测试里。
6. **1 个 worker 这个结论来自镜像里的配置**（🟢）。R3 之前先在真机上用 `ps` 确认。即使实际是多个 worker，
   D1 和 D3 依然成立：长请求和超时问题与 worker 数量无关。

---

## 8. 建议
- **R0–R2 建议直接做。** 纯收益、风险低、不需要上机就能完成大部分工作，而且能顺带完成审计第一批和第二批的修复。
- **R3 是真正能根治问题的一步**：去掉 Python、去掉长请求、后台不再被卡住。影子比对和故障演练都在模拟的
  GL ubus 环境里做（§6.1），真机只用来最后确认 🔴 项。
- 需要你先拍板的两件事：
  - (a) 是否接受前端构建步骤（D7）。
  - (b) R3 的守护进程是否用 eco（推荐，镜像自带），还是退而求其次，把守护进程写成 OpenWrt 的 Lua 5.1 + `uloop` / `libubus-lua`
    （同样是镜像自带，但没有协程，写异步代码会更啰嗦）。

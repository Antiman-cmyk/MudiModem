# MudiModem 改进审计（GL 4.10.0 固件 + 2.2.0 代码）— 2026-11-02

**范围：** 从 GL 官方固件接口（`firmware-api.gl-inet.com/cloud-api/model/info?model=e5800`）拉取
`e5800-4.10.0_release5-1092-0825-1787643675.zip`，SHA256 `3a6b6957…cf040c` 与官方一致；按
`reference/4.10/re-notes.md` 的方法解到 `firmware/rootfs/`。按维护者要求，beta 版（4.10.2）不在
范围内。审计对象是 `main` 上的 2.2.0（`800c72a`）。

**基线：** `tools/test-local.sh` 共 45 项全部通过，包括 Python、Node、宿主机 Lua，以及用 qemu 在
**路由器自己的 Lua 和 busybox** 下跑的那一轮。下面列的问题都是现有测试覆盖不到的。

**标记：** 🟢 在源码/JSON/明文 JS 里读到 · 🟡 来自二进制字符串或反汇编 · 🔴 必须上机验证。
`file:line` 都相对仓库根目录。

---

## 0. 结论速览（按影响排序）

| # | 问题 / 机会 | 类别 | 工作量 |
|---|---|---|---|
| 1 | **Keep / Revert 不看返回结果**：Keep 丢包时改动会被悄悄回滚；回滚失败时用户不知道 | 安全网 | 小 |
| 2 | **60 秒倒计时只活在当前浏览器标签里**：刷新、切页或手机锁屏后 Keep 按钮就没了 | 安全网 | 中 |
| 3 | **小区扫描是一个 10 分钟的同步请求，但 nginx 给 `/cgi-bin/` 设的是 300 秒超时**；扫描结果也不落盘 | 功能正确性 | 中 |
| 4 | **两个页面引用了 GL 主题里不存在的 CSS 变量**：控制台的 read/set/nv 风险徽章显示成普通黑字 | UI | 小 |
| 5 | 暗色主题下"信号好"和"无数据"是同一个颜色；警告文字对比度约 2:1 | UI | 小 |
| 6 | 手机上 7 个标签不换行，整页横向滚动；图表的图例和悬浮框溢出 | UI | 中 |
| 7 | 全英文。GL 后台带中文，而且 `window.$i18n` 可以直接注入译文 | 中文化 | 中 |
| 8 | GL 自己的 `cellular_manager` **也在每 10 秒跑一遍 QENG+QCAINFO**，和我们的采集器重复占用同一个 AT 通道 | 性能 | 中（🔴） |
| 9 | 运营商限速 AMBR 已经通过我们订阅的 websocket 送到页面了，却没显示 | 功能 | 小 |
| 10 | 测速：清空历史不确认，定时测速不提示流量；固定 20 MiB 单连接在 5G 高速下会测低 | 功能 | 小～中 |

第 1–6 项是确定的 bug 或缺陷，代码里都能看到。第 8 项以后有一部分要上机确认，见 §6。

---

## 1. 安全网与交互可靠性（建议最先做）

### 1.1 Keep / Revert 不看返回结果 🟢
- `src/views/mudimodem.js:1201-1223`：`keepBands` 和 `revertBands` 都写成
  `.then(function(){}).catch(function(){})`，然后无论结果如何都把 `pending` 清掉。
- `src/rpc/mudimodem:1094-1098`：`confirm` 不检查 `PENDING` 是否还在，直接 `os.remove`，记一条
  "Kept" 事件，返回 `ok`。
- 会出现的情况：
  - Keep 请求在重拨断网时丢了：页面显示已完成，看门狗 60 秒后照样回滚。用户以为保留了，实际已经回滚。
  - Keep 在看门狗回滚**之后**才到：事件日志写"Band change confirmed"，但改动早已撤销。
  - `revert_now` 返回 `{error: "restore failed … watchdog still armed"}`：页面不显示。
- **建议：**
  - `confirm` 返回 `was_pending`。为 `false` 时页面提示"太晚了，看门狗已经回滚了"，也不记 Kept 事件。
  - Keep / Revert 失败时保留横幅，并给一个"重试"按钮。
  - 显示 `revert_now` 返回的 error。

### 1.2 倒计时状态不持久 🟢
- 倒计时纯粹是前端每秒减 1（`mudimodem.js:1180-1197`）。手机锁屏会暂停定时器，所以会和服务端看门狗对不上。
- 横幅只画在 Bands 页和 Cell lock 页里。刷新页面后没有任何地方恢复它：`pending_kind` 只在
  `verifyLockAfterDrop`（`:628`）里读一次，`get_bands` 根本不返回待确认状态。刷新后再点 Apply，
  只会得到"another change is pending"。
- 倒计时期间去 GL 的 Internet 页看一眼联网状态，是很自然的操作，结果就是一个好改动被回滚。
- **建议：**
  - 后端写 PENDING 时记下截止时间，`get_bands` / `get_lock` 返回
    `pending: {kind, applied, deadline}`，时间用路由器的时钟。
  - 页面挂载时恢复横幅，按 `deadline` 倒数。
  - 状态条上放一个所有标签页都能看到的"⏱ 42 s · Keep"小药丸。

### 1.3 小区扫描：超时上限和结果持久化 🟢
- 页面用 `timeout: 600000`（10 分钟）调 `scan_cells`（`mudimodem.js:681`），后端在
  `src/rpc/mudimodem:669-679` 里通过 `ngx.location.capture("/cgi-bin/glc")` 同步等待。
- 但 4.10.0 的 `/etc/nginx/conf.d/gl.conf:59` 给 `location /cgi-bin/` 设了 **`fastcgi_read_timeout 300`**。
  所以只要扫描超过 5 分钟，子请求就会返回 504，而 GL 那边可能还在扫。我们的 UI 文案说"最长约 10 分钟"。
  GL 自己的页面走的是同一条路，也受这个限制。
- 扫描结果只存在组件内存里（`this.scan`）。刷新、离开页面，或者远程管理时链路断开（扫描期间模组本来就离线），
  花 5–10 分钟断网换来的结果就没了。
- **建议：**
  - 改成和测速一样的后台任务：通过 `mudimodem-detach` 执行
    `ubus call gl-session call '{"module":"modem","func":"scan_cell_tower",…}'`，绕开 nginx 超时。
  - 结果写到 `/tmp/mudimodem/last-scan.json`（带 `ts` 和 `slot`）。
  - 页面用 `rpcSilent` 轮询状态；`get_lock` 返回上一次的扫描结果，并标出"N 分钟前，SIM x"。
  - 🔴 上机记录一次真实扫描耗时，文案按实测写。

### 1.4 "锁到当前小区"可能锁到已经离开的小区 🟢
- `renderCurrentCell`（`mudimodem.js:1782-1793`）里，PCI / ARFCN 来自打开标签页时那一次 `get_lock`
  （`lockData.serving`），RSRP / SINR 却是实时的。发生切换后，卡片仍把旧小区标成"当前"。
- **建议：** 把实时 `mudimodem.collect` 里的 `pci` / `tx_channel` 和 `lockData.serving` 对比。不一致时
  标注"服务小区已变化"，并自动重新读取。

### 1.5 其他交互细节
- 测速的 Clear history 一键删除最多 500 条结果（两个接口一起），不需要确认（`mudimodem-speedtest.js:271-276`）。
  改成两次点击确认，和 Update now 的做法一样。
- 定时测速不提示流量（`:304-331`）。每 30 分钟测一次，约等于每天 1 GiB。在间隔旁边显示
  "每次约 22 MiB · 按当前间隔约 X GiB/天"。
- "Reset to default" 紧挨着 Apply，看起来像"重置选择"，实际会立即写入（`mudimodem.js:1074-1086`）。
  改名为"应用默认（关闭频段过滤 + Auto）"。
- "Enable higher-risk commands" 存在 localStorage 里，打开后永远不会关（`mudimodem-console.js:143-145, 215-219`）。
  改成只在本次会话有效，或 N 分钟后自动关闭。
- 倒计时横幅写着"看上面的曲线"，但状态条是 15 分钟窗口的 RSRP，60 秒只有大约 6 个点，而且没有
  "已应用"标记（`:1653-1678`）。建议：
  - 在曲线上标出应用时刻。
  - 横幅里直接列"应用前 → 现在"的 RSRP、SINR、频段和注册状态。
  - Apply 之前就说明"应用会断网重拨几秒"。GL 的 `set_band_config` 和 `set_cell_tower` 成功后都会重拨，
    契约文档 §6 有记录。

---

## 2. UI 与视觉

### 2.1 引用了不存在的主题变量 🟢
用 GL 的 `base.css` 和 default / dark / classic 三套主题逐一核对每个 `var(--…)`：

| 文件 | 未定义的变量 | 后果 |
|---|---|---|
| `mudimodem-console.js:416-471` | `--bg-card --bg-title --error-bg --error-100 --error-700 --success-bg --success-100 --success-700 --warning-bg --warning-100 --warning-700 --primary-bg` | read/set/nv 风险徽章（这个页最重要的安全提示）没有底色和颜色；警示横幅和卡片透明 |
| `mudimodem-battery.js:943-981, 1123, 1172, 1235` | `--card-bg --bg-content --bg-body --text-primary`（有一处 `--background-body` 兜底，但那个变量也不存在） | 卡片透明，文字回退成继承色 |

- **修复：** 换成 GL 实际存在的变量：`--background-card`、`--background-title`、`--error-background`、
  `--success-background`、`--warning-background`、`--primary-background`、`--text-title`、`--border`。
- **防回归：** 加一个测试，扫描 `src/views/*.js` 里所有 `var(--x)`，凡是 GL 主题和本文件都没定义的就报错。
  主题文件从 `firmware/rootfs/www/theme` 取；没有 rootfs 时跳过。

### 2.2 对比度和暗色主题 🟢
- `qColor` 把 good 映射到 `--info-hover`（`mudimodem.js:315-319`，`mudimodem-tracking.js:483`）。暗色主题里
  `--info-hover` 和 `--text-hint` 都是 `--gl-gray-700`，所以"信号好"和"无数据"颜色一样。GL 4.10 的
  cellular-detail 已经改用 `--secondary` 来表示 good。
- `--warning` 在白底上（#f5a623）对比度约 2:1，但它被用在扫描断网警告、锁定确认这类安全文案上
  （`mudimodem.js:1825, 1945` 等）。
- 大量真实信息用 `--text-hint` 画成 9–10 px：状态条下方的模式 / 运营商行、频段频率、坐标轴。
- **建议：**
  - 警告：`--warning-background` 底，配加深的文字色。
  - good：改用 `--secondary`。
  - 信息性文字用 `--text-weak`；`--text-hint` 只留给占位符。
  - 状态不要只靠颜色区分，旁边加一个"好 / 中 / 差"的文字。

### 2.3 手机布局 🟢
- `.mm-tabs` 是 7 个按钮、22 px 间距，不换行也不能横向滚动（`mudimodem.js:1428`）。375 px 宽时整页横向滚动。
  Mudi 是旅行路由器，经常用手机管理。
- 其他会溢出的地方：
  - 扫描行：一行 5 个 flex 项，不换行。
  - Tracking 图例：固定位置的 SVG 文字，约 450 px 宽（`tracking.js:741-748`）。
  - Tracking 悬浮读数：固定 184×158（`:986`）。
  - Battery 悬浮读数：一行约 90 个字符（`battery.js:1234`）。
- 频段方块和徽章的解释全写在 `title` 里，触屏上根本看不到。
- **建议：**
  - 标签栏加 `overflow-x: auto`。
  - 扫描行折成两行。
  - 图例和读数改成图表下方的 HTML。
  - 点一下频段方块就在下方显示它的状态说明。

### 2.4 AT 控制台 🟢
- 输出区固定 224 px 高，新回复不会自动滚到底（代码里没有 `scrollTop`），回复经常落在可视区外。
- Copy 只用 `navigator.clipboard`（`mudimodem-console.js:401-406`）。这个 API 只在 HTTPS 下存在，而管理页
  通常是 `http://192.168.8.1`，于是按了没反应，也没有任何提示。
- **建议：**
  - 用户没往上翻时自动滚到底。
  - 复制失败时退回 `textarea + execCommand("copy")`，并提示"已复制"或"请手动选择"。
  - 加一个 Clear 按钮，再加几个快捷键：`/` 聚焦搜索，Ctrl+L 清屏。

### 2.5 术语和信息组织
- 频段页同时出现五个近义词：allowed、permitted、active、selected、serving。`active` 其实是 ue_capability。
- 提示文字用内部代号（"mode -> NR5G"、"Off under NR5G mode"），而模式选择器上写的是"5G only"。
- 页脚只显示"6 SA changed"，而不是具体的差异（+n66 −n41）。
- RSRP、SINR、RSRQ、PCI、ARFCN、SCS 都没有解释，质量只用颜色表示。扫描列表用自己的阈值
  （−95 / −105，三档），状态条用的是采集器的 level，两套标准不一样。
- **建议：**
  - 统一成四个层级："模组支持 / 运营商允许 / 模组实际广播 / 正在使用"。
  - 加一个"?"弹层，解释三层模型和各指标的典型范围。
  - 只保留一套阈值来源。

### 2.6 小功能
- 记住上次打开的标签页，或支持 URL hash 深链。现在每次进入都回到 Tracking，并重新加载那个 chunk。
- Tracking 事件日志：按来源过滤；点一行就把图表定位到那个时刻。
- 导出 CSV：RF 历史、事件、测速、电池。
- Cell ID、PCI、ARFCN 加复制按钮。
- 修正几处显示问题：
  - LTE 锁定显示成"(n12)"（`mudimodem.js:1809`）。
  - 扫描结果里 LTE 显示"B?"，其实可以用 `LTE_EARFCN` 表从频点反推出频段。
  - 锁定确认按排序后的行号定位（`:1912`），重新排序后可能指到别的行。

---

## 3. 中文化（i18n）🟢

现状：5 个 chunk 里 `$t(` 一次都没用，大约 200 条英文硬编码，其中约 40 句是字符串拼接。

GL 4.10.0 的机制（在 `app.*.js` 和 `/www/i18n` 里读到）：
- 自带 7 种语言：en、de、es、it、ja、zh-cn、zh-tw。文件按包组织：`/www/i18n/gl-sdk4-ui-<pkg>.<lang>.json`。
- `ui.load_locales {locale}` 读出所有匹配的文件，然后合并进全局的 vue-i18n 实例，即 **`window.$i18n`**
  （有 `mergeLocaleMessage`，`fallbackLocale: "en"`）。
- 菜单标题可以写成 `{"title": {"translate": "<key>"}}`，`displaymanagement.json` 就是这么写的。

**推荐方案：不往 `/www/i18n` 放文件，由 chunk 自己注入。** 原因有两个：
- `/www` 在固件升级时不保留（§9 / keep.d 规则）。
- `load_locales` 遇到坏 JSON 会抛错，而 app.js 的处理是无限重试（`()=>{ot(t,e)}`），结果是**整个后台卡死**，
  风险和坏的菜单 JSON 一样。

具体做法：
1. 译文放在 `/usr/share/mudimodem/www/mudimodem/i18n.json`。这个路径已经由 nginx alias 提供，也已经在
   keep.d 里。也可以直接内联在主 chunk 里。
2. 主 chunk 第一次 eval 时调用
   `window.$i18n.mergeLocaleMessage(lang, {mudimodem: …})`，用 `t(key, vars)` 取译文，并把 `t` 传给子 chunk。
   监听 `$i18n.locale`，语言切换时重新渲染。
3. 技术名词（RSRP、n41、AT、PCI）不翻译。拼接的句子要先改成带占位符的模板。

估计 1–2 天，大部分时间花在把拼接句改成模板上。先做 zh-cn，其他语言缺失时自动回退到英文。

---

## 4. 功能提升（结合固件发现）

### 4.1 采集器复用 GL 自己的信号采样，减半 AT 负载 🟡🔴
- 4.10.0 里 `e5800` 在 `/lib/modem_data/product_baseline.json` 的 `support_historical_signal` 列表中 🟢。
  于是 `libcmcollect.so` 每 10 秒调用一次 `quectel_get_qcainfo_signal`（QENG + QCAINFO）🟡，
  另外还跑 `AT+QCSQ` 和 `AT+QGDCNT?` 统计流量。结果保存在内存里，最多 180 条（30 分钟），通过
  `cellular.collect get_signals {time, slot}` 读取 🟡。
- `mudimodem-collectd` 每 10 秒又调一次 `cellular.network cell_info`，也就是**又一遍** QENG + QCAINFO。
  两个采样器挤在同一个 AT 通道上，还要再加上 GL 详情页每 20 秒一次的 `get_cell_info`。
- **建议：**
  - RF 数据（signals[]）改读 `cellular.collect get_signals {time:10, slot}`。这是读内存，没有 AT 开销。
  - `cell_info` 只在 PCI / EARFCN / 频段变化时，或者每 60 秒调用一次，用来补 cell_id 和 TAC。
  - 读不到时（服务未运行、slot 不匹配）自动回退到现在的路径。
- 🔴 上机确认 `get_signals` 的返回结构、最新一条的时延，以及切换 SIM 后的表现。
- 这一条同时会修正契约文档 §2 的说法："只有我们的采集器调用 `cell_info`"并不成立。

### 4.2 显示运营商限速（AMBR）🟢
- `cellular.networks_info` 带 `ambr_dl` / `ambr_ul`，GL 的 cellular-detail 显示为
  "Max bit rate x / y Mbps"。这个 websocket 我们已经订阅了，所以数据现成。
- 可以放在状态条或 Battery 风格的事实行里，测速结果也标上"运营商上限"。用户能一眼看出
  "测出来 48 Mbps，是不是被运营商限到 50 了"。
- 同一个推送里还有 `ipv4{ip, gateway, dns}` 和 `ipv6`，可以一起展示。

### 4.3 不断网的邻区列表 🟡🔴
- 现在想看附近有哪些小区，只能做一次要断网 5–10 分钟的 QSCAN。
- `AT+QENG="neighbourcell"` 是只读命令，一次 AT 往返。GL 自己的 `debug_at_info` 就会跑它 🟡。
- 建议在 Cell lock 页加一个"快速查看邻区"按钮，只在点击时调用一次，不进采集循环，也不做成轮询。
- 🔴 NR 的邻区格式至今没确认（CLAUDE.md 开放问题 #6）。先在 LTE 上做，NR 显示实际返回的原文。

### 4.4 5G 子模式：禁用 SA，或只用 NSA 🟡🔴
- GL 的 `quectel_set_band_info`（`libcm_modem.so` @0x29c28）会根据 `network_mode` 和三组频段**各自是否为空**，
  决定发 `mode_pref`（AUTO / NR5G / LTE:NR5G / LTE）以及 `nr5g_disable_mode` 0 / 1 / 2。分支在
  0x29c98–0x29ef4，比较的就是这几个计数。
- 也就是说，GL 的引擎本来就支持"只用 NSA"、"只用 SA"。现在走不到，是因为 `set_bands` 刻意从不写
  `NR-SA:[]`（2.0.0 评审定的：存储的空列表不等于空白名单）。
- 不少用户需要单独禁用 SA，比如为了稳定或者省电；GL 的 UI 只有 Auto / 5G / 4G 三档。
- 🔴 要做两件事：反汇编确认完整的分支表（哪种组合发 `nr5g_disable_mode,1`），再上机验证空列表的读写语义。
  确认之后可以加一个"5G 方式：SA + NSA / 只用 NSA / 只用 SA"的选择器，仍然走确认或回滚。

### 4.5 流量和吞吐 🟡
- 每个 tick 读一次 `/sys/class/net/<wwan>/statistics/{rx,tx}_bytes`，零 AT 开销，就能在 Tracking 里加一条
  吞吐通道，信号和实际流量放在同一时间轴上。
- `cellular.collect get_traffic {bus}` 和 `/tmp|/etc/gl_modem_traffic/<bus>/total_sim<N>` 可以支撑
  "每日用量"柱状图。GL 只给累计总数，没有历史。

### 4.6 连通性探测 🟢
- 现在只记射频，"信号很好但上不了网"（PDN、DNS、运营商侧问题）在 Tracking 里完全看不出来。
- 可以每 30–60 秒对一个可配置目标做 1 次 ping 或 HTTP HEAD，记录时延和丢包，作为一条车道。数据量是 KB 级每小时。
- 把这些点和事件联动，就能显示"断网 3 分钟"这样的记录。

### 4.7 测速的准确度和配置 🟢
- 现在是固定 20 MiB、单个 curl 连接（`tools/mudimodem-speedtest.py:34-42`）。在几百 Mbps 的 5G 上，
  不到 1 秒就下载完，结果主要取决于 TCP 慢启动，会明显偏低。单连接在高带宽时延积的链路上也会偏低。
- **建议：**
  - 改成限时（比如 8 秒）多连接（3–4 条），设字节上限，取稳定段的吞吐。
  - 提供"快速（约 5 MiB）"和"完整"两档。
  - 测速地址目前只能用环境变量覆盖，UI 改不了。Cloudflare 在某些地区访问不稳定。
- 测速历史图没有 Mbps / ms 刻度，x 轴按结果序号均分，也没有日期（`mudimodem-speedtest.js:444`）。
  "Latest result"刚打开时是空的，应该先填入最近一条历史结果。

### 4.8 为非活动 SIM 预配频段 🟢🔴
- GL 的频段配置是按 slot 存的。`set_band_config` 只在 `slot == current_sim` 时重拨（契约文档 §6）。
- 所以可以在不碰当前链路的情况下，先给 SIM2 配好频段，等故障切换过去时自动生效。
- 🔴 要确认对非活动 slot 写入时，GL 是否完全不发 AT。policy 也要用那张卡的 sub_id 来读。

### 4.9 其他可选项
- **按信号弱自动切 SIM** 🟡：`cellular.failover switch_event` 接受 `SIGNAL_ERROR` 事件，但 GL 里没有任何地方
  产生它。采集器可以在 RSRP 持续低于阈值时触发。failover 对这个事件的处理没有验证，要谨慎。
- **长期汇总**：现在只有 24 小时。按小时记录每个小区 / 频段的 min / avg / max，保留 7–30 天，只要几百 KB。
  旅行用户可以按地点、按日期比较。
- **模组崩溃事件** 🟢：`check_modem_crash.sh` 每 60 秒把转储移到 `/data/vendor/modem_crash_log/`。
  采集器发现新文件时，可以在 Tracking 里打一个"模组崩溃"事件。
- **AT 库补只读诊断条目**（库在独立仓库 `kevinherzig/mudi7-at-library`，当前 24 条）：
  - `AT+QENG="neighbourcell"`
  - `AT+QNWCFG="lte_ambr"` 和 `"nr5g_ambr"`
  - `AT+QNWPREFCFG="nr5g_disable_mode"`
  - `AT+QNWINFO`
  - `AT+QMBNCFG="list"`（运营商配置文件）
  - `AT+QIMSCFG="IMS_STATUS"`
  - `AT+QLTS=2`（网络时间）
  - `AT+CGCONTRDP`（IP / DNS）
  
  这些都是只读命令，GL 自己的 debug 列表或库里也用到了。
- **USSD 查余额**：4.10.0 的 UI 里没有 USSD，`CUSD` 只出现在 smstools3 的 `smsd` 里。对旅行 SIM 有用，
  但要先确认与 `smsd` 的端口不冲突，排在后面。

### 4.10 现有方向得到固件的佐证
从 4.10.0 的原生页面可以看出，MudiModem 已有的功能仍然有必要：
- **频段**：cellular-detail 的复选框来自模组支持列表，没有 policy 层，也没有回滚。
- **锁小区**：没有安全网。
- **信号历史**：只存在内存里，30 分钟，x 轴按序号排；NSA 下 PCC 序列是空的。
- **modemsignallog**：在 4.10 上已经失效，读的是扁平字段和废弃的 `sims_status`。
- **AT 对话框**：
  - 有一个**不需要确认**的"Reset modem"（`AT&F0`）。
  - "Band"快捷方式拼出的是旧 EC2x 的 `AT+QCFG="band",0,<hex>,0`，不是 RG650V 的命令。

  对比之下，MudiModem 控制台带风险分级的做法更安全。

---

## 5. 工程结构
- **5 个 chunk 不共享任何代码**：
  - `rpcSilent` 有 4 份拷贝，`clock` 和 `qColor` 也重复。
  - 按钮有 4 套类名（`.mm-btn`、`.mmc-send`、`.mms-btn`、`.mmb-seg`），卡片有 3 种样式。
  - Tracking 和 Battery 的时间窗选择器长得不一样。
  
  建议主 chunk 注入一份共享样式，并把 helper 对象（rpc、t、clock、qColor、主题色）作为 props 传给子 chunk。
  可以和 §3 的 `t()` 一起做。
- **Tracking 渲染开销**：`winSamples` 是方法而不是缓存（`mudimodem-tracking.js:509`），一次渲染要调用约 6 次
  （`:617, 632, 637, 730, 911` 等）；鼠标每移动一下就整页重渲染；路径不做抽稀。在 24 小时窗口下很卡。
  做法可以参考 Battery 已经实现的"按像素列取 min / max"抽稀；事件日志拆成独立子组件。
- **定时器泄漏**：`verifyLockAfterDrop` 的探测定时器和 4 秒的"Reverted"超时，在页面关闭后仍然会继续运行。

---

## 6. 需要上机验证的项（🔴）
1. 一次 `scan_cell_tower` 的真实耗时：是否超过 300 秒（§1.3）。
2. `cellular.collect get_signals {time:10, slot}` 的返回结构、最新一条的时延、切换 SIM 后的行为（§4.1）。
3. `AT+QENG="neighbourcell"` 在 SA、NSA、LTE 下各返回什么（§4.3）。
4. `quectel_set_band_info` 完整的分支表，以及存储的空 SA 列表读回来是什么（§4.4）。不要在唯一的上行链路上试。
5. 对非活动 slot 调用 `set_band_config` 时是否发 AT、是否重拨（§4.8）。
6. `networks_info.ambr_*` 在 T-Mobile 和 AT&T 上是否都有值（§4.2）。

## 7. 文档漂移
- README：
  - 标签列表里还有 SIM（`README.md:14`）。
  - AT 控制台写着"on its own channel"（`:56`），而 2.2.0 已经改成优先走 GL 的 AT 服务。
  - `docs/screenshots/` 里还是 1.x 的界面，带 SIM 和 LCD 标签。
- `docs/cellular-api-4.10.md`：
  - §1 说只有三个蜂窝 websocket 名字，实际 `libcmstate_manager.so` 还推送 `cellular.dial_status` 🟡。
  - §1 里 `networks_info` 的字段漏了 `ambr_dl`、`ambr_ul`、`ipv4`、`ipv6` 🟢。
  - §2 说只有我们调用 `cell_info`，实际 GL 自己的采集器和详情页都在调（§4.1）。
  - `getNetworkType` 的错误不止 5 / 51 对调，2 / 3 也错了一位 🟢。
- CLAUDE.md：
  - §5 和 §7 的"nginx runs 4 workers"是 4.8 的情况。4.10.0 镜像的 `etc/nginx/nginx.conf:3` 是
    `worker_processes 1`，`gl_util.sh set_nginx_thread` 对 e5800 不做修改 🟢（🔴 需上机用 `ps` 确认）。
    所以插件里的阻塞调用会让整个后台一起卡住，详见 `2026-11-02-refactor-architecture.md` 的 S1。
  - §8 还在说"复用 modemsignallog 的配色"，但 modemsignallog 在 4.10 上已经失效；cellular-detail 用的是
    good → `--secondary`。
  - §6 的 GL 方法列表还是 4.8 的：4.10 去掉了 `set_3gpp_rel`，新增了 `get_cell_info`、`get_signals`、
    `get/set_band_config`、`set_slot_type`、`set_sim_name` 等。
  - §5a 说"GL 从不查询 `policy_band`"，这只对 UI 成立；后端的 `debug_at_info` 会查。

## 8. 建议顺序
1. **第一批（1–2 天，纯代码，不需要上机）：**
   - §1.1 和 §1.2（安全网）。
   - §2.1，加上 CSS 变量测试。
   - §2.2 的颜色映射。
   - §2.3 的标签栏。
   - §2.4 的自动滚动和复制。
   - §1.5 测速的确认和流量提示。
2. **第二批：**
   - §1.3 扫描改为后台任务。
   - §3 中文化（先做 zh-cn），顺带做 §5 的共享 helper。
   - §2.5 的术语统一和说明弹层。
   - §4.2 AMBR。
3. **第三批（需要上机）：**
   - §4.1 采集器改读 GL 的采样。
   - §4.3 邻区。
   - §4.4 5G 子模式。
   - §4.7 测速改为多连接。
   - §4.5 和 §4.6 两条新车道。

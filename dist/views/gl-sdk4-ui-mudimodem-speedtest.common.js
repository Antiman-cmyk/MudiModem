/* MudiModem — built from src/web/tabs/speedtest.js by tools/build-web.mjs. Do not edit: run npm run build:web. */
module.exports = (function () {
var __mm = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/web/tabs/speedtest.js
  var speedtest_exports = {};
  __export(speedtest_exports, {
    default: () => speedtest_default
  });

  // src/web/kit/rpc.js
  function hasRpc() {
    return typeof window !== "undefined" && !!window.$rpcRequest;
  }
  function rpc(method, params, opts) {
    return window.$rpcRequest("call", ["sid", "mudimodem", method, params || {}], opts);
  }
  function rpcSilent(method, params, timeoutMs) {
    if (typeof window === "undefined" || !window.$axios || !window.$axios.post) return Promise.resolve(null);
    var sid = window.$getCookie && window.$getCookie("Admin-Token") || "";
    return window.$axios.post("/rpc", {
      jsonrpc: "2.0",
      id: 1,
      method: "call",
      params: [sid, "mudimodem", method, params || {}]
    }, { timeout: timeoutMs || 15e3 }).then(function(r) {
      return r && r.data && r.data.result || null;
    }).catch(function() {
      return null;
    });
  }

  // src/web/locales/zh-cn.js
  var zh_cn_default = {
    "copied": "已复制",
    "newest first · click one to see it on the chart": "最新的在前 · 点一条在图表上查看",
    "copy failed": "复制失败",
    "Tap the chart for the readings at that moment.": "点按图表，查看那一时刻的读数。",
    "Show this moment on the chart": "在图表上显示这一时刻",
    "Show or hide these events": "显示或隐藏这类事件",
    "Every source is hidden - switch one back on above.": "所有来源都已隐藏，请在上方重新打开一个。",
    "Download these results as CSV": "把这些结果下载为 CSV",
    "Download the samples in this range as CSV": "把这个时间范围内的采样下载为 CSV",
    "Download the event log as CSV": "把事件日志下载为 CSV",
    "selected": "已选择",
    "{s} module supports · {p} carrier allows · {a} modem advertises": "模组支持 {s} · 运营商允许 {p} · 模组实际广播 {a}",
    "{b} selected (click to remove)": "{b} 已选择（点击取消）",
    "{b} carrier allows, not selected (click to select)": "{b} 运营商允许，未选择（点击选择）",
    "ring = in use now (every carrier: PCC + SCCs)": "圆环 = 正在使用（所有载波：PCC + SCC）",
    "in use now ({role})": "正在使用（{role}）",
    "carrier allows, not selected": "运营商允许，未选择",
    "carrier allows, not advertised": "运营商允许，模组未广播",
    "advertised by the modem": "模组实际广播",
    "Your SIM's carrier policy. A band outside it never takes, whatever you select - the grid shows it as blocked.": "SIM 卡运营商的策略。策略之外的频段无论怎么选都不会生效，网格里显示为已屏蔽。",
    "What the modem currently tells the network it can do (its UE capability): normally your selection within the carrier's policy. The 5G NSA group shows it, read-only.": "Modem 当前向网络声明的能力（UE capability）：通常是你的选择中运营商允许的部分。5G NSA 一组只读显示它。",
    "What the band layers mean": "各层频段的含义",
    "The carriers serving you right now: the ring around a band (the primary carrier and any aggregated ones).": "当前为你服务的载波：频段外的圆环（主载波和聚合的辅载波）。",
    "The bands you allow the modem to use. Apply writes them through GL, with a 60 s revert.": "你允许 Modem 使用的频段。点“应用”后通过 GL 写入，60 秒内可回滚。",
    "Signal quality including how busy the cell is, in dB. LTE: −6 or better is excellent, down to −10 good, down to −14 fair. 5G: −12, −16 and −20.": "包含基站繁忙程度的信号质量，单位 dB。LTE：−6 及以上为优，−10 以上为良，−14 以上为中。5G 的分界是 −12、−16 和 −20。",
    "Signal against noise and interference, in dB. 12 or more is excellent, 6 to 12 good, 0 to 6 fair, below 0 poor.": "信号与噪声和干扰之比，单位 dB。12 及以上为优，6 到 12 为良，0 到 6 为中，低于 0 为差。",
    "Selected": "已选择",
    "Received power from the cell, in dBm. −100 or better is excellent, down to −105 good, down to −110 fair, below that poor.": "来自基站的接收功率，单位 dBm。−100 及以上为优，−105 以上为良，−110 以上为中，更低为差。",
    "Module supports": "模组支持",
    "Modem advertises": "模组实际广播",
    "In use": "正在使用",
    "Every band this modem can use. GL's own band page offers all of them.": "这个 Modem 能用的所有频段。GL 自带的频段页面列出的就是这些。",
    "Choose the network mode and which 5G/LTE bands the modem may use. Bands your carrier forbids are shown as blocked: they can't be selected because they never take.": "选择网络模式，以及 Modem 可以使用哪些 5G / LTE 频段。运营商禁止的频段显示为已屏蔽：选了也不会生效，所以不能选。",
    "Changes: {what}. Stored for SIM {n}.": "改动：{what}。保存给 SIM {n}。",
    "Changes: {what}. Applies with a 60s revert.": "改动：{what}。应用后 60 秒内可回滚。",
    "Carrier allows": "运营商允许",
    "+{n} more": "另外 {n} 项",
    "waiting for the next sample...": "等待下一个采样……",
    "scanned {age} ago · SIM {slot}": "{age}前扫描 · SIM {slot}",
    "scanned {age} ago": "{age}前扫描",
    "no service": "无服务",
    "Writes GL's default to the modem now: band filtering off + Auto mode (60s revert)": "立即把 GL 的默认设置写入 Modem：关闭频段过滤 + 自动模式（60 秒内可回滚）",
    "The link drops for a few seconds while the modem re-registers.": "Modem 重新注册期间，连接会中断几秒。",
    "Now {n}": "现在 {n}",
    "Before {b}  →  now {n}": "之前 {b}  →  现在 {n}",
    "Apply defaults": "应用默认设置",
    "Applied {what}. Reverting in {s} unless you keep it.": "已应用 {what}。{s} 后自动回滚，除非你选择保留。",
    "The modem has moved to PCI {pci} / ARFCN {arfcn} since this was read. Refresh before locking.": "读取之后 Modem 已切换到 PCI {pci} / ARFCN {arfcn}。请先刷新再锁定。",
    "The modem has moved to PCI {pci} / ARFCN {arfcn} since this was read - re-reading...": "读取之后 Modem 已切换到 PCI {pci} / ARFCN {arfcn}，正在重新读取……",
    "(carrier change)": "（载波变化）",
    "(details unavailable)": "（详情不可用）",
    "1 hour": "1 小时",
    "12 hours": "12 小时",
    "2 hours": "2 小时",
    "24 hours": "24 小时",
    "30 min": "30 分钟",
    "4G only": "仅 4G",
    "5G NSA: an LTE anchor plus a 5G leg (B66 + n41). The readings, cell and channel shown are the LTE anchor's; Cell lock pins the 5G leg.": "5G NSA：一个 LTE 锚点加一路 5G（如 B66 + n41）。显示的读数、小区和信道都是 LTE 锚点的；锁定基站锁的是 5G 那一路。",
    "5G leg · lock target": "5G 小区 · 锁定目标",
    "5G NR non-standalone": "5G NR 非独立组网（NSA）",
    "5G NR standalone": "5G NR 独立组网（SA）",
    "5G NSA only": "5G 仅 NSA",
    "5G SA + NSA": "5G SA + NSA",
    "5G SA only": "5G 仅 SA",
    "5G only": "仅 5G",
    "5G selections held back under 4G-only": "仅 4G 模式下 5G 选择不会下发",
    "6 hours": "6 小时",
    "> 2 d": "> 2 天",
    "A change is already pending - Keep or Revert it first.": "已有待确认的修改 - 请先保留或恢复。",
    "A kept cell lock lives in the modem's own NV (survives reboot, reflash and factory reset) and in GL's store. Every lock made here auto-reverts in 60s unless you keep it, and the watchdog fires even if this page is closed. If the router ever becomes unreachable over the web, the ssh way back is: {cmd} - it clears the cell lock on both slots (GL's store and the modem), resets lock persistence and the network mode to Auto, and turns band filtering off.": "保留下来的基站锁定同时存在于 Modem 自己的 NV（重启、重刷固件和恢复出厂设置后都还在）和 GL 的配置里。这里做的每次锁定在 60 秒内不保留就会自动恢复，即使关闭本页面看门狗也会照常执行。如果路由器的网页再也打不开，可以通过 ssh 恢复：{cmd} - 它会清除两个卡槽的基站锁定（GL 配置和 Modem），重置锁定持久化，把网络模式设为自动，并关闭频段过滤。",
    "AT command": "AT 命令",
    "AT console": "AT 控制台",
    "Active · target {target} GL UI · current {cur}": "生效中 · 目标 {target}（GL 界面）· 当前 {cur}",
    "All": "全选",
    "All SIMs": "所有 SIM 卡",
    "Already at the default - re-sending 'filtering off + Auto' to the modem anyway.": "已经是默认设置 - 仍然向 Modem 重新发送“关闭过滤 + 自动”。",
    "Applied {what}. Time's up - the auto-revert is restoring your previous settings...": "已应用 {what}。时间到 - 自动恢复正在还原之前的设置…",
    "Apply": "应用",
    "Applying...": "正在应用…",
    "Armed · target {target} · will apply when the charger connects · current {cur}": "已开启 · 目标 {target} · 接上充电器后生效 · 当前 {cur}",
    "Asking the modem...": "正在询问 Modem…",
    "Asks the modem which cells it measures besides the serving one (LTE and NSA anchors).": "询问 Modem 除服务小区外还测到了哪些小区（LTE 和 NSA 锚点）。",
    "Auto": "自动",
    "Auto or 4G only": "自动或仅 4G",
    "Auto or 5G only": "自动或仅 5G",
    "Auto-revert FAILED": "自动恢复失败",
    "Auto-revert fired": "已自动恢复",
    "Auto-reverts in 60s unless kept.": "60 秒内不保留则自动恢复。",
    "Automatic background tests": "后台自动测速",
    "BAND": "频段",
    "BW": "带宽",
    "Back online": "恢复联网",
    "Backup size": "备份大小",
    "Band": "频段",
    "Band change confirmed": "已确认频段修改",
    "Bands": "频段",
    "Bands applied": "已应用频段",
    "Bands haven't loaded yet - hit refresh.": "频段尚未加载 - 请点击刷新。",
    "Based on ChiliApple's battery control scripts": "基于 ChiliApple 的电池控制脚本",
    "Battery": "电池",
    "Battery charge limit": "电池充电上限",
    "CELL": "小区",
    "Can't reach the router — battery history stopped updating {age} ago.": "无法连接路由器 — 电池历史已在 {age} 前停止更新。",
    "Can't reach the router — battery history stopped updating.": "无法连接路由器 — 电池历史已停止更新。",
    "Cancel": "取消",
    "Carrier": "运营商",
    "Carriers": "载波",
    "Carrier aggregation: several carriers combined for more speed.": "载波聚合：把多个载波合在一起以提高速度。",
    "Cell": "小区",
    "Cell / Ch": "小区 / 信道",
    "Cell ID": "小区 ID",
    "Cell lock": "锁定基站",
    "Cell lock applied": "已锁定基站",
    "Cell lock cleared": "已解除基站锁定",
    "Cell lock confirmed": "已确认基站锁定",
    "Cell lock removed": "已移除基站锁定",
    "Cell lock — open Cell lock tab": "基站锁定 — 打开锁定基站页",
    "Cell scan": "基站扫描",
    "Cell {from} → {to}": "小区 {from} → {to}",
    "Cellular": "蜂窝网络",
    "Cellular interface down": "蜂窝网络接口未连接",
    "Ch": "信道",
    "Charge blocked (limit)": "充电已暂停（充电上限）",
    "Charge limit not available on this device.": "此设备不支持充电上限。",
    "Charging": "充电中",
    "Charging stopped": "已停止充电",
    "Clear": "清空",
    "Clear history": "清除历史",
    "Clear it": "清除",
    "Clear the transcript": "清空记录",
    "Click again to delete all results": "再点一次删除全部结果",
    "Commands go straight to the {modem}. Nothing is validated. Entries marked nv write modem memory that survives a factory reset.": "命令会直接发给 {modem}，不做任何校验。标记为 nv 的条目会写入 Modem 的存储，恢复出厂设置后仍然存在。",
    "Config": "配置",
    "Confirm": "确认",
    "Connection dropped while applying the lock - checking whether it took...": "锁定时连接中断 - 正在确认是否已生效…",
    "Connection dropped while locking and hasn't recovered yet - refresh once you're back to see the current lock state.": "锁定时连接中断且尚未恢复 - 恢复后请刷新以查看当前锁定状态。",
    "Contributed by": "贡献者",
    "Copied": "已复制",
    "Copy": "复制",
    "Copy failed - select the text to copy it": "复制失败 - 请手动选择文本复制",
    "Copy the transcript": "复制记录",
    "Couldn't check interfaces: {err}": "无法检查网络接口：{err}",
    "Couldn't confirm which SIM answered - values may be for the other slot": "无法确认是哪张 SIM 卡在应答 - 数值可能属于另一个卡槽",
    "Couldn't load history: {err}": "无法加载历史：{err}",
    "Couldn't load history: {err} — retrying every {s} s.": "无法加载历史：{err} — 每 {s} 秒重试一次。",
    "Couldn't load the AT console: {err}": "无法加载 AT 控制台：{err}",
    "Couldn't load the battery view: {err}": "无法加载电池页：{err}",
    "Couldn't load the graph: {err}": "无法加载信号图：{err}",
    "Couldn't load the library: {err}": "无法加载命令库：{err}",
    "Couldn't load the long-term record: {err}": "无法加载长期记录：{err}",
    "Couldn't load the speed test: {err}": "无法加载测速：{err}",
    "Couldn't load the wider range yet; retrying every {s} s.": "暂时无法加载更长的时间范围；每 {s} 秒重试一次。",
    "Couldn't reach the router to keep it ({err}). The countdown is still running - press Keep again.": "无法连接路由器来保留修改（{err}）。倒计时仍在继续 - 请再次点击“保留”。",
    "Couldn't reach the router to revert ({err}). The auto-revert is still armed.": "无法连接路由器来恢复（{err}）。自动恢复仍然有效。",
    "Couldn't reach the router to see what the auto-revert did - reload once you're back online.": "无法连接路由器确认自动恢复的结果 - 恢复联网后请刷新页面。",
    "Couldn't reach the router — retrying every {s} s.": "无法连接路由器 — 每 {s} 秒重试一次。",
    "Couldn't read bands: {err}": "无法读取频段：{err}",
    "Couldn't read lock state: {err}": "无法读取锁定状态：{err}",
    "Couldn't read neighbours: {err}": "无法读取邻区：{err}",
    "Couldn't save the schedule: {err}": "无法保存计划：{err}",
    "Couldn't save: {err}": "无法保存：{err}",
    "Couldn't start update: {err}": "无法开始更新：{err}",
    "Current": "电流",
    "Current 60 s avg": "电流 60 秒平均",
    "Current cell": "当前基站",
    "Current · mA": "电流 · mA",
    "Data now on SIM {slot}": "数据切换到 SIM {slot}",
    "Decoded — field names from the library entry": "解析结果 — 字段名来自命令库条目",
    "Detail": "详情",
    "Device": "设备",
    "Down": "下载",
    "Down / Up": "下载 / 上传",
    "Download": "下载",
    "Draining on power": "接电源仍在放电",
    "Each edited band group needs at least one band": "每个修改过的频段组至少要保留一个频段",
    "Each test uses up to {mb} MB of data — up to {day} a day at this interval.": "每次测速最多消耗 {mb} MB 流量 —— 按此间隔每天最多 {day}。",
    "Earlier battery history didn't load — showing samples since the tab opened; retrying every {s} s.": "更早的电池历史没能加载 — 只显示打开本页以来的采样；每 {s} 秒重试一次。",
    "Earlier history didn't load — showing live samples since the page opened; retrying every {s} s.": "更早的历史没能加载 — 只显示打开页面以来的实时采样；每 {s} 秒重试一次。",
    "Editing SIM {n}, which is not in use. Changes are stored and GL applies them the next time SIM {n} connects (a SIM switch or failover) - without the 60 s revert, since nothing changes now.": "正在编辑未使用的 SIM {n}。更改会被保存，GL 在 SIM {n} 下次连接时（切卡或故障切换）应用 - 由于现在不会有任何变化，所以没有 60 秒回滚。",
    "Enable higher-risk commands": "启用高风险命令",
    "Enabled · not active · target {target} · current {cur}": "已开启 · 未生效 · 目标 {target} · 当前 {cur}",
    "Estimating…": "正在估算…",
    "Event": "事件",
    "Event log": "事件日志",
    "Every {n}": "每 {n}",
    "Failover": "SIM 卡切换",
    "Find every cell in range, with lockable details.": "查找范围内的所有基站，并给出可锁定的参数。",
    "Full": "已充满",
    "GL UI Reported Charge": "GL 界面电量",
    "GL UI Reported Charge · %": "GL 界面电量 · %",
    'GL reports network mode "{mode}", which this panel doesn\'t offer - it stays as it is unless you pick a mode below.': "GL 报告的网络模式是“{mode}”，本页面不提供该选项 - 除非你在下面选择其他模式，否则保持不变。",
    "GL's AT service · addressed to the active SIM: {who}": "GL 的 AT 服务 · 发往当前 SIM 卡：{who}",
    "GL's stored lock": "GL 保存的锁定",
    "Handover": "基站切换",
    "History": "历史",
    "History across reboots": "重启后保留历史",
    "Holding at the limit": "保持在充电上限",
    "Holding at {pct} %": "保持在 {pct} %",
    "IC Reported Charge": "电量芯片读数",
    "If the auto-revert is still running it will undo this within ~60s - {keep} to make it stick, or {revert} to remove it now.": "如果自动恢复仍在运行，它会在约 60 秒内撤销此修改 - 点击{keep}使其生效，或点击{revert}立即撤销。",
    "Internet": "互联网",
    "Invert": "反选",
    "Keep": "保留",
    "Keep signal & battery history across reboots": "重启后保留信号和电池历史",
    "Keeping...": "正在保留…",
    "Kept": "已保留",
    "LIVE": "实时",
    "LTE": "LTE",
    "LTE anchor": "LTE 锚点",
    "LTE anchor {band}": "LTE 锚点 {band}",
    "Last seen": "最近一次",
    "Latency": "延迟",
    "Latest result": "最近结果",
    "Library": "命令库",
    "Library not loaded.": "命令库未加载。",
    "LibreSpeed (your server)": "LibreSpeed（自建服务器）",
    "Limit": "充电上限",
    "Limit charging": "限制充电",
    "Live charts still use RAM. When this is on, the collector appends new samples to eMMC about every {n} minutes (~6 MiB for a full day of signal + battery). Off by default.": "实时图表仍使用内存。开启后，采集器大约每 {n} 分钟把新采样追加写入 eMMC（一整天的信号 + 电池约 6 MiB）。默认关闭。",
    "Loading battery history…": "正在加载电池历史…",
    "Loading history from the router…": "正在从路由器加载历史…",
    "Loading history…": "正在加载历史…",
    "Loading the AT console…": "正在加载 AT 控制台…",
    "Loading the battery view…": "正在加载电池页…",
    "Loading the library…": "正在加载命令库…",
    "Loading the signal graph…": "正在加载信号图…",
    "Loading the speed test…": "正在加载测速…",
    "Loading…": "正在加载…",
    "Lock": "锁定",
    "Lock it": "锁定",
    "Lock to PCI {pci}? Network mode switches to 4G-preferred until unlocked.": "锁定到 PCI {pci}？解除锁定前网络模式会切换为 4G 优先。",
    "Lock to PCI {pci}? Network mode switches to 5G-only until unlocked.": "锁定到 PCI {pci}？解除锁定前网络模式会切换为仅 5G。",
    "Lock to this cell": "锁定到此基站",
    "Locked": "已锁定",
    "Locking...": "正在锁定…",
    "Long term": "长期",
    "Low-level: target {target}, current {cur}": "底层：目标 {target}，当前 {cur}",
    "Mbps down": "Mbps 下载",
    "Mbps up": "Mbps 上传",
    "Model": "型号",
    "Modem": "Modem",
    "Modem crash": "Modem 崩溃",
    "MudiModem (version unknown)": "MudiModem（版本未知）",
    "NO SVC": "无服务",
    "NSA needs LTE: choose Auto to use NSA only": "NSA 需要 LTE：选择“自动”才能仅用 NSA",
    "NSA only": "仅 NSA",
    "Nearby cells": "附近基站",
    "Neighbour cells": "邻区",
    "Network": "网络",
    "Network mode": "网络模式",
    "Network mode — open Bands": "网络模式 — 打开频段页",
    "No long-term record yet. The router writes one line per hour, so the first appears after the first full hour.": "还没有长期记录。路由器每小时写一条，第一个完整小时之后才会出现。",
    "No scan yet. A scan lists every cell in range, on every carrier, but takes the modem offline for up to ~10 minutes.": "还没有扫描。扫描能列出范围内所有运营商的所有小区，但会让 Modem 离线最长约 10 分钟。",
    "No band changes, handovers or failovers recorded yet.": "还没有记录到频段修改、基站切换或 SIM 卡切换。",
    "No battery history yet — sampling starts within 20 s.": "还没有电池历史 — 20 秒内开始采样。",
    "No changes": "没有修改",
    "No matches.": "没有匹配项。",
    "No reply to ping": "ping 无应答",
    "No results yet for this interface. Run a speed test above.": "这个接口还没有结果。请在上方开始测速。",
    "No samples yet. The collector runs on the router and gathers continuously — check back in a minute, or confirm the mudimodem-collectd service is running.": "还没有采样。采集器在路由器上持续运行 — 请稍后再看，或确认 mudimodem-collectd 服务正在运行。",
    "None": "全不选",
    "Not charging": "未充电",
    "Off": "关闭",
    "Off under {mode} - 5G selections are not sent (GL clears them under 4G-only). Set the mode to {need} to use them.": "在“{mode}”模式下不生效 - 5G 的选择不会下发（仅 4G 时 GL 会清空它们）。要使用请把模式设为“{need}”。",
    "Off under {mode} - these won't apply. Set the mode to {need} to use them.": "在“{mode}”模式下不生效 - 这些选择不会应用。要使用请把模式设为“{need}”。",
    "Off · current {cur}": "关闭 · 当前 {cur}",
    "Off: 5G NSA only - SA is turned off, so these bands are not used.": "已关闭：5G 仅 NSA - SA 已关闭，这些频段不会使用。",
    "Off: 5G SA only - NSA is turned off, so these bands are not used.": "已关闭：5G 仅 SA - NSA 已关闭，这些频段不会使用。",
    "Offline": "断网",
    "On battery": "电池供电",
    "PAUSED": "已暂停",
    "Pin the modem to the cell it is using now - the safest lock target.": "把 Modem 固定在当前使用的基站上 - 最安全的锁定目标。",
    "Ping": "Ping",
    "Ping loss": "Ping 丢包",
    "Quick": "快速",
    "RPC helper unavailable": "RPC 不可用",
    "RPC unavailable": "RPC 不可用",
    "RSRP · dBm": "RSRP · dBm",
    "RSRP · hourly min / avg / max · SIM {slot}": "RSRP · 每小时最小 / 平均 / 最大 · SIM {slot}",
    "RSRP · last sample {age} ago": "RSRP · 最后一次采样在 {age} 前",
    "RSRP · last {n} min": "RSRP · 最近 {n} 分钟",
    "RSRQ · dB": "RSRQ · dB",
    "Range {r}": "范围 {r}",
    "Raw AT": "AT 命令",
    "Readings": "读数来自",
    "Read again": "重新读取",
    "Read neighbours": "读取邻区",
    "Reading band configuration from the modem...": "正在从 Modem 读取频段配置…",
    "Reading lock state from the modem...": "正在从 Modem 读取锁定状态…",
    "Recovery": "恢复方法",
    "Refresh now": "立即更新",
    "Refreshing…": "正在更新…",
    "Remote sessions:": "远程连接：",
    "Restored previous bands": "已还原之前的频段",
    "Retry": "重试",
    "Revert": "恢复",
    "Revert now": "立即恢复",
    "Reverted": "已恢复",
    "Reverted - cell lock removed.": "已恢复 - 基站锁定已移除。",
    "Reverted - restored your previous bands.": "已恢复 - 已还原之前的频段。",
    "Reverting...": "正在恢复…",
    "Run speed test": "开始测速",
    "SA + NSA": "SA + NSA",
    "SA only": "仅 SA",
    "SCS {scs} kHz is assumed from the band.": "SCS {scs} kHz 是根据频段推定的。",
    "SIM {n} (in use)": "SIM {n}（使用中）",
    "SIM {n} (standby)": "SIM {n}（备用）",
    "SIM {slot} (active) is not registered on a network right now - {carrier}.": "SIM {slot}（当前使用）目前未注册到网络 - {carrier}。",
    "SIM {slot} (active) is not registered on a network right now.": "SIM {slot}（当前使用）目前未注册到网络。",
    "SINR · dB": "SINR · dB",
    "Sampled every 10s by the MudiModem collector (pushed live), last {n} minutes": "由 MudiModem 采集器每 10 秒采样并实时推送，显示最近 {n} 分钟",
    "Save": "保存",
    "Scan failed: {err}": "扫描失败：{err}",
    "Scan for cells": "扫描基站",
    "Scan now": "立即扫描",
    "Scanning takes the modem OFFLINE for up to ~10 minutes. This connection will drop if it runs over cellular.": "扫描会让 Modem 离线最长约 10 分钟。如果你是通过蜂窝网络连接的，连接会中断。",
    "Scanning... the modem is offline until this finishes (up to ~10 minutes). Watch the strip.": "正在扫描… 完成前 Modem 处于离线状态（最长约 10 分钟）。请留意状态条。",
    "Search library": "搜索命令库",
    "Search — band, lock, signal…": "搜索 — 频段、锁定、信号…",
    "Send": "发送",
    "Sending the default to the modem: band filtering off + Auto mode.": "正在向 Modem 发送默认设置：关闭频段过滤 + 自动模式。",
    "Sending…": "正在发送…",
    "Sharp edge.": "注意风险。",
    "Source": "来源",
    "Speedtest": "测速",
    "Starting…": "正在启动…",
    "State": "状态",
    "Status": "状态",
    "Stored for SIM {n}. GL applies it the next time SIM {n} connects.": "已为 SIM {n} 保存。GL 会在 SIM {n} 下次连接时应用。",
    "Target": "目标",
    "Target must be 20–100 % GL UI Reported Charge": "目标必须在 20–100 %（GL 界面电量）之间",
    "Target too low — the charge IC needs at least 50 % IC Reported Charge (about 50 % GL UI Reported Charge)": "目标太低 — 充电芯片至少需要 50 %（电量芯片读数，约合 GL 界面电量 50 %）",
    "Temp": "温度",
    "Temperature · °C": "温度 · °C",
    "Test": "测试",
    "Test server": "测速服务器",
    "Test size": "测速规模",
    "Testing download…": "正在测试下载…",
    "Testing latency…": "正在测试延迟…",
    "Testing upload…": "正在测试上传…",
    "Testing…": "正在测试…",
    "The auto-revert has not finished after 30 s - use Revert now, or the ssh panic restore.": "自动恢复 30 秒后仍未完成 - 请点击“立即恢复”，或使用 ssh 紧急恢复。",
    "The collector has not produced a sample for {age} (modem resetting, or mudimodem-collectd stopped) - these are its last known values, not live readings.": "采集器已经 {age} 没有产生新采样（Modem 正在重置，或 mudimodem-collectd 已停止），以下是最后一次的数值，不是实时读数。",
    "The collector's last sample is {age} old - nothing newer has been pushed": "采集器的最后一次采样已是 {age} 前，之后没有新的推送",
    "The connection dropped while applying, and nothing is pending on the router now - the change did not take, or was already reverted.": "应用时连接中断，且路由器上现在没有待确认的修改 - 修改没有生效，或已被恢复。",
    "The frequency bands in use, the one the readings come from first: n = 5G NR, B = LTE. Low bands reach far; high bands are faster but shorter.": "正在使用的频段，读数所属的那个排在最前：n 表示 5G NR，B 表示 LTE。低频覆盖远；高频速度快但覆盖近。",
    "The lock request was cut off by a connection drop and no lock is set - try again.": "锁定请求因连接中断而失败，目前没有设置锁定 - 请重试。",
    "The modem reports no neighbours. On 5G SA it never does - only a scan finds other cells there.": "Modem 没有报告邻区。5G SA 下从来不会报告 - 只有扫描才能找到其他小区。",
    "The modem restarted after a crash; GL saved a dump in /data/vendor/modem_crash_log": "Modem 崩溃后已自动重启；GL 已把转储保存在 /data/vendor/modem_crash_log",
    "The watchdog reverted a lock, but {gl} still remembers it - GL may re-apply it later. Clear it to reconcile.": "看门狗已撤销一次锁定，但 {gl} 仍然记着它 - GL 之后可能会重新应用。请清除以保持一致。",
    "Thorough": "完整",
    "Time": "时间",
    "Too late to keep: the auto-revert had already restored your previous bands. Apply it again if you want it.": "来不及保留了：自动恢复已经还原了之前的频段。如需要请重新应用。",
    "Too late to keep: the auto-revert had already restored your previous cell setting. Apply it again if you want it.": "来不及保留了：自动恢复已经还原了之前的基站设置。如需要请重新应用。",
    "Tracking": "信号追踪",
    "Unknown": "未知",
    "Unknown tab.": "未知标签页。",
    "Unlock": "解除锁定",
    "Unlocked": "未锁定",
    "Unlocking...": "正在解除…",
    "Up": "上传",
    "Up to date · rev {rev}": "已是最新 · 版本 {rev}",
    "Update available": "有更新",
    "Update failed: {err} — see /var/log/mudimodem-update.log": "更新失败：{err} — 详见 /var/log/mudimodem-update.log",
    "Update is taking longer than expected — check /var/log/mudimodem-update.log, then reload the page.": "更新耗时超出预期 — 请查看 /var/log/mudimodem-update.log，然后刷新页面。",
    "Update now": "立即更新",
    "Updated to v{v}. The page is still running the old interface —": "已更新到 v{v}。当前页面仍在运行旧界面 —",
    "Updated. The page is still running the old interface —": "已更新。当前页面仍在运行旧界面 —",
    "Updating to v{v}…": "正在更新到 v{v}…",
    "Updating…": "正在更新…",
    "Upload": "上传",
    "User": "用户",
    "Vendor": "厂商",
    "Verified on": "验证设备",
    "Voltage": "电压",
    "Voltage · V": "电压 · V",
    "WRITES MODEM NV — survives factory reset": "写入 Modem NV — 恢复出厂设置后仍然存在",
    "Waiting for the collector's first sample (mudimodem-collectd pushes every 10s)...": "正在等待采集器的第一次采样（mudimodem-collectd 每 10 秒推送一次）…",
    "Watchdog": "看门狗",
    "What these readings mean": "这些读数的含义",
    "Which cell the modem is on (its ID) and the channel number with its frequency.": "Modem 当前所在的小区（小区 ID），以及信道号和对应频率。",
    "Wired WAN": "有线 WAN",
    "Would strand your {rat} cell lock - clear the lock first": "会让 {rat} 基站锁定失效 - 请先解除锁定",
    "Your connection dropped while applying, but the band change ({what}) most likely applied.": "应用时连接中断了，但频段修改（{what}）很可能已经生效。",
    "Your connection dropped while applying, but the {lock} did apply.": "应用时连接中断了，但 {lock} 已经生效。",
    "a tick marks the moment — everything to its right is the radio's answer": "竖线标记操作的时刻 — 它右侧就是无线信号的反应",
    "after {d} offline": "断网 {d} 后恢复",
    "apply failed": "应用失败",
    "band change": "频段修改",
    "blocked by carrier policy": "被运营商策略屏蔽",
    "but the network mode is {mode} - the lock can't take effect. Set the mode to {need}, or clear the lock on the Cell lock tab.": "但网络模式是“{mode}” - 锁定无法生效。请把模式设为“{need}”，或在“锁定基站”页解除锁定。",
    "carrier {plmn}": "运营商 {plmn}",
    "changed": "已修改",
    "changes runtime state — gone on reboot": "修改运行状态 — 重启后失效",
    "click to confirm — briefly restarts the admin panel": "点击确认 — 管理界面会短暂重启",
    "could not check interfaces": "无法检查网络接口",
    "could not load history": "无法加载历史",
    "could not load the battery view": "无法加载电池页",
    "could not load the graph": "无法加载信号图",
    "could not load the speed test": "无法加载测速",
    "could not save": "无法保存",
    "could not save schedule": "无法保存计划",
    "could not start": "无法启动",
    "couldn't reach the router": "无法连接路由器",
    "default: band filtering off, mode Auto": "默认：关闭频段过滤，模式自动",
    "direct port /dev/at_mdm0 (GL's AT service is down) · active SIM: {who}": "直连端口 /dev/at_mdm0（GL 的 AT 服务不可用）· 当前 SIM 卡：{who}",
    "fill in every parameter before sending": "发送前请填写所有参数",
    "filtering off + Auto": "关闭过滤 + 自动",
    "from the last {n} min": "依据最近 {n} 分钟",
    "high band, fast + short range": "高频，速度快、覆盖近",
    "hourly, kept 30 days": "按小时，保留 30 天",
    "load failed": "加载失败",
    "lock failed": "锁定失败",
    "locked": "已锁定",
    "low band, reaches far": "低频，覆盖远",
    "mode {m}": "模式 {m}",
    "modem": "Modem",
    "ms latency": "ms 延迟",
    "no answer": "没有应答",
    "no reply": "无应答",
    "no scan, the link stays up": "无需扫描，连接不中断",
    "nv": "nv",
    "one clock, all three metrics — hover for a slice, click to pin": "同一时间轴上的三个指标 — 悬停查看某一时刻，点击固定",
    "other frequency": "异频",
    "pinned": "已固定",
    "read": "只读",
    "read before locking": "锁定前请先阅读",
    "read just now": "刚刚读取",
    "read {n} min ago": "{n} 分钟前读取",
    "ready. Pick a command from the library, or type one.": "就绪。从命令库选择命令，或直接输入。",
    "Refresh": "刷新",
    "refresh": "刷新",
    "refresh failed": "更新失败",
    "refreshing...": "正在刷新…",
    "reload now": "立即刷新",
    "request failed": "请求失败",
    "requires a scan": "需要扫描",
    "resolving…": "正在识别…",
    "rev unknown": "版本未知",
    "rev {rev}": "版本 {rev}",
    "safe — reads only": "安全 — 只读",
    "same frequency": "同频",
    "scan failed": "扫描失败",
    "Carrier cap": "运营商限速",
    "standalone, non-standalone, or both": "独立组网、非独立组网，或两者",
    "the modem did not answer": "Modem 没有应答",
    "the modem refused the command": "Modem 拒绝了该命令",
    "{dl} / {ul} Mbps": "{dl} / {ul} Mbps",
    "download at the cap": "下载已达上限",
    "upload at the cap": "上传已达上限",
    "gave up waiting for the router": "等待路由器超时，已放弃",
    "serving now": "当前服务",
    "set": "设置",
    "skipped — previous step failed": "已跳过 — 上一步失败",
    "slot {slot}": "卡槽 {slot}",
    "target {pct}%": "目标 {pct}%",
    "the speed test stopped without a result": "测速中途停止，没有结果",
    "unlock failed": "解除锁定失败",
    "updated — rev {rev}": "已更新 — 版本 {rev}",
    "view frozen": "视图已冻结",
    "v{v} available": "v{v} 可更新",
    "which radios the modem may use": "Modem 可以使用的制式",
    "{b} blocked by carrier policy; selecting has no effect": "{b} 被运营商策略屏蔽，选择也不会生效",
    "{carrier} (slot {slot})": "{carrier}（卡槽 {slot}）",
    "{label} applying a lock briefly re-registers the modem, which can drop a remote (Tailscale / VPN) connection to this router for a few seconds. It reconnects on its own - if the request seems to hang or fail, wait a moment; the lock likely applied and this page will offer to keep or revert it once you're back.": "{label}应用锁定会让 Modem 短暂重新注册，可能导致到本路由器的远程连接（Tailscale / VPN）中断几秒钟。连接会自动恢复 - 如果请求像是卡住或失败了，请稍等片刻；锁定很可能已经生效，重新连上后本页面会让你选择保留或恢复。",
    "{locked} to {target}. The modem will not hand over.": "{locked}到 {target}。Modem 不会切换基站。",
    "{name} (not connected)": "{name}（未连接）",
    "{name} (up to {mb} MB)": "{name}（最多 {mb} MB）",
    "{name} is not connected": "{name} 未连接",
    "{name}, {n} streams": "{name}，{n} 条连接",
    "{n} GB": "{n} GB",
    "{n} GiB": "{n} GiB",
    "{n} MB": "{n} MB",
    "{n} MiB": "{n} MiB",
    "{n} commands": "{n} 条命令",
    "{n} h ago": "{n} 小时前",
    "{n} min": "{n} 分钟",
    "{n} min ago": "{n} 分钟前",
    "{n} new sample held — resume to show": "暂存了 {n} 个新采样 — 继续后显示",
    "{n} new samples held — resume to show": "暂存了 {n} 个新采样 — 继续后显示",
    "{n} s": "{n} 秒",
    "{n}s ago": "{n} 秒前",
    "{pct} % GL UI": "{pct} %（GL 界面）",
    "{pct} % GL UI Reported Charge": "{pct} %（GL 界面电量）",
    "{rat} cell PCI {pci} / ARFCN {freq}": "{rat} 小区 PCI {pci} / ARFCN {freq}",
    "{rat} lock PCI {pci} / ARFCN {freq}": "{rat} 锁定 PCI {pci} / ARFCN {freq}",
    "{time} remaining": "剩余 {time}",
    "{time} to {pct} %": "{time} 充到 {pct} %",
    "{title} (read-only)": "{title}（只读）",
    "~{h} h": "约 {h} 小时",
    "~{h} h {m} m": "约 {h} 小时 {m} 分钟",
    "~{m} m": "约 {m} 分钟",
    "— nobody yet": "— 暂无",
    "← Modem": "← Modem",
    "≈ {pct} % IC Reported Charge": "约 {pct} %（电量芯片读数）",
    "■ User": "■ 用户",
    "▲ Watchdog": "▲ 看门狗",
    "◆ Internet / modem": "◆ 互联网 / Modem",
    "○ Network": "○ 网络",
    "⚠ Modem is cell-locked to {lock}, ": "⚠ Modem 已锁定到基站 {lock}，"
  };

  // src/web/kit/i18n.js
  var TABLES = { "zh-cn": zh_cn_default, "zh-tw": zh_cn_default };
  function locale() {
    var l = "";
    if (typeof window !== "undefined") {
      if (window.$i18n && window.$i18n.locale) l = window.$i18n.locale;
      else if (window.MM_LOCALE) l = window.MM_LOCALE;
      else if (typeof navigator !== "undefined" && navigator.language) l = navigator.language;
    }
    l = String(l || "en").toLowerCase();
    if (l === "zh" || l.indexOf("zh-hans") === 0 || l.indexOf("zh-cn") === 0 || l.indexOf("zh-sg") === 0) return "zh-cn";
    if (l.indexOf("zh") === 0) return "zh-tw";
    return l;
  }
  function table() {
    return TABLES[locale()] || null;
  }
  function tr(s) {
    var tb = table();
    if (!tb || typeof s !== "string") return s;
    var core = s.trim();
    if (!core || !Object.prototype.hasOwnProperty.call(tb, core)) return s;
    var lead = s.slice(0, s.indexOf(core)), trail = s.slice(s.indexOf(core) + core.length);
    return lead + tb[core] + trail;
  }
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, function(m, k) {
      return vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }
  function t(en, vars) {
    return fill(tr(en), vars);
  }
  var ATTRS = ["title", "placeholder", "aria-label"];
  function trData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data) || !data.attrs) return data;
    var a = null;
    ATTRS.forEach(function(k) {
      if (typeof data.attrs[k] === "string") {
        var v = tr(data.attrs[k]);
        if (v !== data.attrs[k]) {
          a = a || Object.assign({}, data.attrs);
          a[k] = v;
        }
      }
    });
    return a ? Object.assign({}, data, { attrs: a }) : data;
  }
  function trKids(k) {
    if (typeof k === "string") return tr(k);
    if (Array.isArray(k)) return k.map(function(x) {
      return typeof x === "string" ? tr(x) : x;
    });
    return k;
  }
  function wrapH(h, seen) {
    return function(tag, data, children) {
      if (typeof data === "string" || Array.isArray(data)) {
        var k1 = trKids(data);
        if (seen) record(seen, null, k1);
        return h(tag, k1);
      }
      var d = trData(data), k = trKids(children);
      if (seen) record(seen, d, k);
      return h(tag, d, k);
    };
  }
  function record(seen, data, children) {
    [].concat(children == null ? [] : children).forEach(function(x) {
      if (typeof x === "string") seen(x);
    });
    if (data && data.attrs) ATTRS.forEach(function(a) {
      if (typeof data.attrs[a] === "string") seen(data.attrs[a]);
    });
  }
  function localize(component) {
    var render = component.render;
    component.render = function(h) {
      var seen = typeof window !== "undefined" && window.__mmI18nSeen;
      return render.call(this, wrapH(h, seen));
    };
    return component;
  }

  // src/web/kit/fmt.js
  function p2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function hhmm(t2) {
    var d = new Date(t2);
    return p2(d.getHours()) + ":" + p2(d.getMinutes());
  }
  function mdhm(t2) {
    var d = new Date(t2);
    return p2(d.getMonth() + 1) + "/" + p2(d.getDate()) + " " + hhmm(t2);
  }

  // src/web/kit/csv.js
  function cell(v) {
    if (v === null || v === void 0) return "";
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(rows, cols) {
    var out = [cols.map(function(c) {
      return cell(c[0]);
    }).join(",")];
    (rows || []).forEach(function(r) {
      out.push(cols.map(function(c) {
        return cell(c[1](r));
      }).join(","));
    });
    return out.join("\r\n") + "\r\n";
  }
  function isoTime(ms) {
    var n = Number(ms);
    return n > 0 ? new Date(n).toISOString() : "";
  }
  function download(name, text) {
    if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return false;
    var url = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() {
      URL.revokeObjectURL(url);
    }, 1e3);
    return true;
  }

  // src/web/kit/carriers.js
  function isNr(rat) {
    return /NR5G/.test(rat || "");
  }
  function bandName(rat, band) {
    if (band === void 0 || band === null || band === "") return null;
    return (isNr(rat) ? "n" : "B") + band;
  }
  function pccRat(s) {
    if (!s) return "";
    var sig = Array.isArray(s.signals) && s.signals[0];
    return s.pcc_rat || sig && sig.rat || s.mode || "";
  }
  function carriers(s) {
    if (!s) return [];
    var rows = Array.isArray(s.signals) ? s.signals : [];
    var out = [];
    rows.forEach(function(g, i) {
      if (!g || g.band === void 0 || g.band === null || g.band === "") return;
      var rat = g.rat || (i === 0 ? pccRat(s) : s.mode) || "";
      out.push({
        role: g.role || (i === 0 ? "PCC" : "SCC"),
        rat,
        band: Number(g.band),
        label: bandName(rat, g.band),
        pci: g.pci,
        arfcn: g.earfcn,
        rsrp: g.rsrp,
        rsrq: g.rsrq,
        sinr: g.sinr
      });
    });
    if (!out.length && s.band !== void 0 && s.band !== null && s.band !== "") {
      var r = pccRat(s);
      out.push({
        role: "PCC",
        rat: r,
        band: Number(s.band),
        label: bandName(r, s.band),
        pci: s.pci,
        arfcn: s.tx_channel,
        rsrp: s.rsrp,
        rsrq: s.rsrq,
        sinr: s.sinr
      });
    }
    return out;
  }
  function bandsText(s) {
    var seen = [];
    carriers(s).forEach(function(c) {
      if (seen.indexOf(c.label) === -1) seen.push(c.label);
    });
    return seen.length ? seen.join(" + ") : "—";
  }

  // src/web/tabs/speedtest.js
  var speedtest_default = localize(function() {
    "use strict";
    var IFACES = [["cellular", "Cellular"], ["wired", "Wired WAN"]];
    var PROFILES = [["quick", "Quick", 29], ["full", "Thorough", 288]];
    function profileMB(id) {
      for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i][0] === id) return PROFILES[i][2];
      return PROFILES[0][2];
    }
    var INTERVALS = [
      [1800, "30 min"],
      [3600, "1 hour"],
      [7200, "2 hours"],
      [21600, "6 hours"],
      [43200, "12 hours"],
      [86400, "24 hours"]
    ];
    var PHASE_TEXT = {
      starting: "Starting…",
      download: "Testing download…",
      upload: "Testing upload…",
      latency: "Testing latency…"
    };
    function ifaceLabel(id) {
      for (var i = 0; i < IFACES.length; i++) if (IFACES[i][0] === id) return IFACES[i][1];
      return "—";
    }
    function capRow(r) {
      if (r.ambr_dl == null && r.ambr_ul == null) return null;
      var v = t("{dl} / {ul} Mbps", { dl: r.ambr_dl == null ? "—" : r.ambr_dl, ul: r.ambr_ul == null ? "—" : r.ambr_ul });
      var at = [];
      if (r.ambr_dl && r.down_mbps != null && r.down_mbps >= 0.9 * r.ambr_dl) at.push(t("download at the cap"));
      if (r.ambr_ul && r.up_mbps != null && r.up_mbps >= 0.9 * r.ambr_ul) at.push(t("upload at the cap"));
      return ["Carrier cap", at.length ? v + " · " + at.join(", ") : v];
    }
    function testRow(r) {
      if (r.data_mb == null && r.profile == null) return null;
      var name = null;
      for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i][0] === r.profile) name = t(PROFILES[i][1]);
      var bits = [];
      if (r.data_mb != null) bits.push(t("{n} MB", { n: r.data_mb }));
      if (name) bits.push(r.streams ? t("{name}, {n} streams", { name, n: r.streams }) : name);
      if (r.server === "librespeed") bits.push("LibreSpeed");
      return ["Test", bits.join(" · ")];
    }
    function resultDetailRows(r) {
      var cap = capRow(r), tr2 = testRow(r);
      return [
        ["Latency", r.latency_ms == null ? "—" : r.latency_ms + " ms (±" + (r.jitter_ms == null ? "—" : r.jitter_ms) + ")"]
      ].concat(cap ? [cap] : []).concat(tr2 ? [tr2] : []).concat([
        ["Carrier", (r.carrier || "—") + " · SIM " + (r.slot == null ? "—" : r.slot)],
        // The prefix follows the carrier: an EN-DC anchor on B2 is "B2", not "n2".
        // every band of the result's radio snapshot, primary first — as the strip and Tracking say it
        ["Band", bandsText(r)],
        ["Cell", r.cell_id == null ? "—" : r.cell_id],
        ["RSRP", r.rsrp == null ? "—" : r.rsrp + " dBm"],
        ["SINR", r.sinr == null ? "—" : r.sinr + " dB"],
        ["RSRQ", r.rsrq == null ? "—" : r.rsrq + " dB"]
      ]);
    }
    var component = {
      name: "mudimodem-speedtest",
      props: { embedded: { type: Boolean, default: false } },
      data: function() {
        return {
          styleId: "mms-css",
          results: [],
          resultsLoading: true,
          resultsErr: "",
          ifaces: null,
          ifacesErr: "",
          runIface: "cellular",
          filterIface: "cellular",
          // "all" or a slot number as a string: cellular results from two SIMs
          // are two radios, so the graph can show one SIM at a time.
          filterSlot: "all",
          status: { running: false },
          lastResult: null,
          statusPoll: null,
          schedule: null,
          scheduleErr: "",
          scheduleSaving: false,
          // {profile, server, librespeed_url} (get_speedtest_settings); urlDraft = the URL being typed
          settings: null,
          settingsErr: "",
          settingsSaving: false,
          urlDraft: null,
          cursor: null,
          pinned: null,
          width: 900,
          clearArmed: false,
          clearTimer: null
          // "Clear history" asks twice: it deletes up to 500 results
        };
      },
      computed: {
        // Distinct SIM slots among the cellular results, in first-seen order.
        // Wired results have no radio (older ones may still carry a snapshot of
        // the cellular link — irrelevant to the wired test), so never for wired.
        slotsShown: function() {
          if (this.filterIface !== "cellular") return [];
          var seen = [];
          this.results.forEach(function(r) {
            if (r.iface !== "cellular" || r.slot == null) return;
            var k = String(r.slot);
            if (seen.indexOf(k) === -1) seen.push(k);
          });
          return seen;
        },
        // The slot filter in force: a slot that has no results (any more) falls
        // back to "all" rather than hiding everything behind a vanished control.
        slotFilter: function() {
          return this.filterSlot !== "all" && this.slotsShown.indexOf(this.filterSlot) !== -1 ? this.filterSlot : "all";
        },
        filtered: function() {
          var f = this.filterIface, sf = f === "cellular" ? this.slotFilter : "all";
          return this.results.filter(function(r) {
            return r.iface === f && (sf === "all" || String(r.slot) === sf);
          });
        }
      },
      created: function() {
        this.injectStyle();
      },
      mounted: function() {
        var self = this;
        if (typeof window === "undefined") return;
        this.measure();
        this._onResize = function() {
          self.measure();
        };
        window.addEventListener("resize", this._onResize);
        this.fetchInterfaces();
        this.fetchHistory();
        this.fetchSchedule();
        this.fetchSettings();
        this.fetchStatus(true);
      },
      // Torn down (a tab switch destroys us): every async continuation checks
      // _dead first, so a reply landing afterwards can't start an orphan 1 Hz
      // poll that would run until the test ends.
      beforeDestroy: function() {
        this._dead = true;
        if (this.clearTimer) clearTimeout(this.clearTimer);
        if (this.statusPoll) clearInterval(this.statusPoll);
        this.statusPoll = null;
        if (typeof window !== "undefined" && this._onResize) window.removeEventListener("resize", this._onResize);
      },
      methods: {
        measure: function() {
          if (this.$refs && this.$refs.graph && this.$refs.graph.clientWidth)
            this.width = this.$refs.graph.clientWidth;
        },
        // User-initiated one-shots: a failure there is real, GL's banner is fine.
        rpc: function(method, params) {
          if (!hasRpc()) return Promise.reject(new Error("RPC unavailable"));
          return rpc(method, params || {});
        },
        // Background calls: POST to /rpc via $axios DIRECTLY. Resolves the
        // result, or null on ANY failure (it never rejects) — the caller treats
        // null as "try again next tick".
        rpcSilent: function(method, params, timeout) {
          return rpcSilent(method, params, timeout || 8e3);
        },
        fetchInterfaces: function() {
          var self = this;
          this.rpc("get_speedtest_interfaces", {}).then(function(r) {
            if (self._dead) return;
            self.ifaces = r;
            self.ifacesErr = "";
          }).catch(function(e) {
            if (self._dead) return;
            self.ifacesErr = e && (e.message || e.type) || "could not check interfaces";
          });
        },
        fetchHistory: function() {
          var self = this;
          this.resultsLoading = true;
          this.rpc("get_speedtest_history", {}).then(function(r) {
            if (self._dead) return;
            self.results = r && r.results || [];
            self.resultsErr = "";
            self.resultsLoading = false;
            if (!self.lastResult && self.results.length) {
              self.lastResult = self.results.reduce(function(a, b) {
                return (b.t || 0) > (a.t || 0) ? b : a;
              });
            }
          }).catch(function(e) {
            if (self._dead) return;
            self.resultsErr = e && (e.message || e.type) || "could not load history";
            self.resultsLoading = false;
          });
        },
        fetchSchedule: function() {
          var self = this;
          return this.rpc("get_speedtest_schedule", {}).then(function(r) {
            if (!self._dead) self.schedule = r;
          }).catch(function() {
          });
        },
        // Status poll — background, so SILENT. One request in flight at most:
        // on a slow link a 1 Hz interval would otherwise stack them up.
        fetchStatus: function(startPollIfRunning) {
          var self = this;
          if (this._statusInFlight) return Promise.resolve();
          this._statusInFlight = true;
          return this.rpcSilent("get_speedtest_status", {}).then(function(r) {
            self._statusInFlight = false;
            if (self._dead || !r) return;
            self.applyStatus(r, startPollIfRunning);
          });
        },
        applyStatus: function(r, startPollIfRunning) {
          var polling = !!this.statusPoll;
          if (r.running && r.phase !== "error") {
            this.status = r;
            if (startPollIfRunning) this.startPoll();
            return;
          }
          if (r.phase === "error")
            r = {
              running: false,
              phase: "error",
              iface: r.iface,
              message: r.message || "the speed test stopped without a result"
            };
          this.status = r;
          if (polling) {
            if (r.phase === "done" && r.result) this.lastResult = r.result;
            this.stopPollAndRefresh();
          }
        },
        startPoll: function() {
          var self = this;
          if (this.statusPoll || this._dead) return;
          this.statusPoll = setInterval(function() {
            self.fetchStatus(false);
          }, 1e3);
        },
        stopPollAndRefresh: function() {
          clearInterval(this.statusPoll);
          this.statusPoll = null;
          this.fetchHistory();
        },
        runTest: function() {
          var self = this;
          if (this.status.running) return;
          this.status = { running: true, phase: "download", iface: this.runIface };
          return this.rpc("run_speedtest", { iface: this.runIface }).then(function(r) {
            if (self._dead) return;
            if (r && r.error === "iface_down") {
              self.status = {
                running: false,
                phase: "error",
                message: t("{name} is not connected", { name: t(self.runIface === "cellular" ? "Cellular" : "Wired WAN") })
              };
              return;
            }
            if (r && r.error) {
              self.status = { running: false, phase: "error", message: r.error };
              return;
            }
            self.startPoll();
          }).catch(function(e) {
            if (self._dead) return;
            self.status = { running: false, phase: "error", message: e && (e.message || e.type) || "could not start" };
          });
        },
        // Resolves once the save AND the re-read have settled, so the caller can
        // put its control back to whatever this.schedule now says.
        fetchSettings: function() {
          var self = this;
          return this.rpc("get_speedtest_settings", {}).then(function(r) {
            if (!self._dead && r && !r.error) self.settings = r;
          }).catch(function() {
          });
        },
        // Save a change to the test size or server; the reply is what the router now holds.
        saveSettings: function(patch) {
          var self = this;
          if (!this.settings) return Promise.resolve();
          var next = Object.assign({}, this.settings, patch);
          this.settingsSaving = true;
          this.settingsErr = "";
          return this.rpc("set_speedtest_settings", {
            profile: next.profile,
            server: next.server,
            librespeed_url: next.librespeed_url || ""
          }).then(function(r) {
            if (self._dead) return;
            self.settingsSaving = false;
            if (!r || r.error) {
              self.settingsErr = r && r.error || "could not save";
              return;
            }
            self.settings = { profile: r.profile, server: r.server, librespeed_url: r.librespeed_url || "" };
            self.urlDraft = null;
          }).catch(function(e) {
            if (self._dead) return;
            self.settingsSaving = false;
            self.settingsErr = e && (e.message || e.type) || "could not save";
          });
        },
        setSchedule: function(enabled, intervalSeconds) {
          var self = this;
          this.scheduleSaving = true;
          this.scheduleErr = "";
          return this.rpc("set_speedtest_schedule", { enabled, interval_seconds: intervalSeconds }).then(function(r) {
            if (self._dead) return;
            self.scheduleSaving = false;
            if (r && r.error) {
              self.scheduleErr = String(r.error);
              return;
            }
            if (r && typeof r.enabled === "boolean")
              self.schedule = Object.assign({}, self.schedule, {
                enabled: r.enabled,
                interval_seconds: r.interval_seconds != null ? r.interval_seconds : intervalSeconds
              });
            return self.fetchSchedule();
          }).catch(function(e) {
            if (self._dead) return;
            self.scheduleSaving = false;
            self.scheduleErr = e && (e.message || e.type) || "could not save schedule";
          });
        },
        // Vue patches `checked`/`value` only when the BOUND value changes, so a
        // refused save would leave the box ticked (or the interval moved) while
        // the schedule is not. Force the DOM control back to the real state.
        syncScheduleControl: function(el, prop) {
          if (!el || !this.schedule) return;
          if (prop === "checked") el.checked = !!this.schedule.enabled;
          else el.value = String(this.schedule.interval_seconds);
        },
        armClear: function() {
          var self = this;
          if (this.clearArmed) {
            this.clearArmed = false;
            clearTimeout(this.clearTimer);
            this.clearHistory();
            return;
          }
          this.clearArmed = true;
          this.clearTimer = setTimeout(function() {
            self.clearArmed = false;
          }, 5e3);
        },
        // The results the history shows (interface + SIM filter), one row each.
        exportResults: function() {
          var col = function(k) {
            return function(r) {
              return r[k];
            };
          };
          var text = csv(this.filtered, [
            ["time_utc", function(r) {
              return isoTime(r.t);
            }],
            ["t_ms", col("t")],
            ["interface", col("iface")],
            ["trigger", col("trigger")],
            ["down_mbps", col("down_mbps")],
            ["up_mbps", col("up_mbps")],
            ["latency_ms", col("latency_ms")],
            ["jitter_ms", col("jitter_ms")],
            ["data_mb", col("data_mb")],
            ["profile", col("profile")],
            ["streams", col("streams")],
            ["server", col("server")],
            ["measure_down", col("measure_down")],
            ["measure_up", col("measure_up")],
            ["sim", col("slot")],
            ["carrier", col("carrier")],
            ["mode", col("mode")],
            ["band", col("band")],
            ["pci", col("pci")],
            ["rsrp_dbm", col("rsrp")],
            ["sinr_db", col("sinr")],
            ["rsrq_db", col("rsrq")],
            ["ambr_dl_mbps", col("ambr_dl")],
            ["ambr_ul_mbps", col("ambr_ul")]
          ]);
          return download("mudimodem-speedtests-" + isoTime(Date.now()).slice(0, 10).replace(/-/g, "") + ".csv", text);
        },
        clearHistory: function() {
          var self = this;
          this.rpc("clear_speedtest_history", {}).then(function() {
            if (!self._dead) self.results = [];
          }).catch(function() {
          });
        },
        clock: function(t2) {
          return mdhm(t2);
        },
        // ---- render ----
        renderControls: function(h) {
          var self = this;
          var ifaceSel = h("select", {
            domProps: { value: this.runIface },
            attrs: { disabled: this.status.running },
            on: { change: function(ev) {
              self.runIface = ev.target.value;
            } }
          }, IFACES.map(function(i) {
            var down = self.ifaces && self.ifaces[i[0]] && !self.ifaces[i[0]].up;
            return h("option", { attrs: { value: i[0] }, key: i[0] }, down ? t("{name} (not connected)", { name: t(i[1]) }) : i[1]);
          }));
          var runBtn = h("button", {
            staticClass: "mms-btn primary",
            attrs: { disabled: this.status.running },
            on: { click: function() {
              self.runTest();
            } }
          }, this.status.running ? PHASE_TEXT[this.status.phase] || "Testing…" : "Run speed test");
          var sizeSel = this.settings ? h("select", {
            domProps: { value: this.settings.profile },
            attrs: { disabled: this.status.running || this.settingsSaving, title: t("Test size") },
            on: { change: function(ev) {
              var el = ev.target;
              self.saveSettings({ profile: el.value }).then(function() {
                if (self.settings) el.value = self.settings.profile;
              });
            } }
          }, PROFILES.map(function(p) {
            return h("option", { attrs: { value: p[0] }, key: p[0] }, t("{name} (up to {mb} MB)", { name: t(p[1]), mb: p[2] }));
          })) : null;
          var err = !this.status.running && this.status.phase === "error" ? h("span", { staticClass: "mms-err" }, this.status.message) : null;
          var ifaceErr = this.ifacesErr ? h("span", { staticClass: "mms-err" }, t("Couldn't check interfaces: {err}", { err: this.ifacesErr })) : null;
          return h("div", { staticClass: "mms-controls" }, [ifaceSel, sizeSel, runBtn, err, ifaceErr].filter(Boolean));
        },
        // Where the test runs against: Cloudflare (default) or the user's own LibreSpeed server, for
        // regions where Cloudflare's speed endpoints are slow or blocked.
        renderServer: function(h) {
          var self = this, st = this.settings;
          if (!st) return null;
          var lib = st.server === "librespeed" || this.urlDraft != null;
          var sel = h("select", {
            domProps: { value: lib ? "librespeed" : "cloudflare" },
            attrs: { disabled: this.status.running || this.settingsSaving },
            on: { change: function(ev) {
              if (ev.target.value === "librespeed") {
                self.urlDraft = st.librespeed_url || "";
                return;
              }
              self.urlDraft = null;
              if (st.server !== "cloudflare") self.saveSettings({ server: "cloudflare" });
            } }
          }, [
            h("option", { attrs: { value: "cloudflare" } }, "Cloudflare"),
            h("option", { attrs: { value: "librespeed" } }, "LibreSpeed (your server)")
          ]);
          var kids = [h("span", "Test server"), sel];
          if (lib) {
            var val = this.urlDraft != null ? this.urlDraft : st.librespeed_url;
            kids.push(h("input", {
              staticClass: "mms-url",
              attrs: {
                type: "text",
                placeholder: "https://speed.example.com/backend/",
                spellcheck: "false",
                disabled: this.status.running || this.settingsSaving
              },
              domProps: { value: val },
              on: { input: function(ev) {
                self.urlDraft = ev.target.value;
              } }
            }));
            kids.push(h("button", {
              staticClass: "mms-btn",
              attrs: { disabled: this.status.running || this.settingsSaving || !String(val || "").trim() || this.urlDraft == null && st.server === "librespeed" },
              on: { click: function() {
                self.saveSettings({ server: "librespeed", librespeed_url: String(val).trim() });
              } }
            }, "Save"));
          }
          if (this.settingsErr)
            kids.push(h("span", { staticClass: "mms-err" }, t("Couldn't save: {err}", { err: t(this.settingsErr) })));
          return h("div", { staticClass: "mms-server" }, kids);
        },
        renderSchedule: function(h) {
          var self = this;
          if (!this.schedule) return null;
          var toggle = h("label", { staticClass: "mms-sched-toggle" }, [
            h("input", {
              attrs: { type: "checkbox", checked: this.schedule.enabled, disabled: this.scheduleSaving },
              domProps: { checked: this.schedule.enabled },
              on: { change: function(ev) {
                var el = ev.target;
                self.setSchedule(el.checked, self.schedule.interval_seconds).then(function() {
                  self.syncScheduleControl(el, "checked");
                });
              } }
            }),
            "Automatic background tests"
          ]);
          var sel = h("select", {
            attrs: { disabled: !this.schedule.enabled || this.scheduleSaving },
            domProps: { value: this.schedule.interval_seconds },
            on: { change: function(ev) {
              var el = ev.target;
              self.setSchedule(self.schedule.enabled, parseInt(el.value, 10)).then(function() {
                self.syncScheduleControl(el, "value");
              });
            } }
          }, INTERVALS.map(function(iv) {
            return h("option", { attrs: { value: iv[0] }, key: iv[0] }, t("Every {n}", { n: t(iv[1]) }));
          }));
          var err = this.scheduleErr ? h("span", { staticClass: "mms-err" }, t("Couldn't save the schedule: {err}", { err: this.scheduleErr })) : null;
          var mb = profileMB(this.settings && this.settings.profile);
          var perDay = 86400 / (this.schedule.interval_seconds || 21600) * mb;
          var cost = h("span", { staticClass: "mms-hint" }, t("Each test uses up to {mb} MB of data — up to {day} a day at this interval.", {
            mb,
            day: perDay >= 1e3 ? t("{n} GB", { n: (perDay / 1e3).toFixed(1) }) : t("{n} MB", { n: Math.round(perDay) })
          }));
          return h("div", { staticClass: "mms-sched" }, [toggle, sel, err, cost].filter(Boolean));
        },
        renderLatestResult: function(h) {
          if (!this.lastResult) return null;
          var r = this.lastResult;
          var big = h("div", { staticClass: "mms-latest-big" }, [
            h("div", { staticClass: "mms-latest-metric" }, [
              h("span", { staticClass: "v", style: { color: "var(--primary)" } }, r.down_mbps == null ? "—" : String(r.down_mbps)),
              h("span", { staticClass: "u" }, "Mbps down")
            ]),
            h("div", { staticClass: "mms-latest-metric" }, [
              h("span", { staticClass: "v", style: { color: "var(--success)" } }, r.up_mbps == null ? "—" : String(r.up_mbps)),
              h("span", { staticClass: "u" }, "Mbps up")
            ]),
            h("div", { staticClass: "mms-latest-metric" }, [
              h("span", { staticClass: "v" }, r.latency_ms == null ? "—" : String(r.latency_ms)),
              h("span", { staticClass: "u" }, "ms latency")
            ])
          ]);
          var rows = resultDetailRows(r);
          return h("div", { staticClass: "mms-card" }, [
            h("div", { staticClass: "mms-latest-head" }, [
              h("span", { staticClass: "mms-title" }, "Latest result"),
              h("span", { staticClass: "mms-latest-when" }, t(ifaceLabel(r.iface)) + " · " + this.clock(r.t))
            ]),
            big,
            h("div", {}, rows.map(function(row) {
              return h("div", { staticClass: "mms-tip-row" }, [h("span", row[0]), h("b", row[1])]);
            }))
          ]);
        },
        renderGraph: function(h) {
          var self = this, results = this.filtered;
          if (this.resultsLoading) return h("div", { staticClass: "mms-empty" }, "Loading history…");
          if (this.resultsErr) return h("div", { staticClass: "mms-empty" }, t("Couldn't load history: {err}", { err: this.resultsErr }));
          if (!results.length) return h(
            "div",
            { staticClass: "mms-empty" },
            "No results yet for this interface. Run a speed test above."
          );
          var W = this.width, PADL = 34, PADR = 12, PLOT_H = 160, LAT_H = 40, GAP = 14;
          var plotTop = 18, plotBot = plotTop + PLOT_H;
          var latTop = plotBot + GAP, latBot = latTop + LAT_H;
          var n = results.length;
          var xOf = function(i) {
            return n <= 1 ? PADL : PADL + i / (n - 1) * (W - PADL - PADR);
          };
          var maxMbps = 1;
          results.forEach(function(r2) {
            if (r2.down_mbps > maxMbps) maxMbps = r2.down_mbps;
            if (r2.up_mbps > maxMbps) maxMbps = r2.up_mbps;
          });
          var yMax = maxMbps * 1.15;
          var yOf = function(v) {
            return plotBot - Math.max(0, v || 0) / yMax * PLOT_H;
          };
          var maxLatency = 1;
          results.forEach(function(r2) {
            if (r2.latency_ms > maxLatency) maxLatency = r2.latency_ms;
          });
          var latYOf = function(v) {
            return latBot - Math.max(0, v || 0) / (maxLatency * 1.15) * LAT_H;
          };
          var cellular = this.filterIface === "cellular";
          var slotOf = function(r2) {
            return cellular ? r2.slot == null ? "?" : String(r2.slot) : "";
          };
          var multiSim = false;
          for (var si = 1; si < n; si++) if (slotOf(results[si]) !== slotOf(results[0])) {
            multiSim = true;
            break;
          }
          var kids = [];
          kids.push(h("rect", { attrs: { x: PADL, y: 5, width: 10, height: 3, fill: "var(--primary)" } }));
          kids.push(h("text", { attrs: { x: PADL + 14, y: 10, "font-size": 9.5, fill: "var(--text-badge)" } }, "Download"));
          kids.push(h("rect", { attrs: { x: PADL + 78, y: 5, width: 10, height: 3, fill: "var(--success)" } }));
          kids.push(h("text", { attrs: { x: PADL + 92, y: 10, "font-size": 9.5, fill: "var(--text-badge)" } }, "Upload"));
          [plotTop, plotBot].forEach(function(yy) {
            kids.push(h("line", { attrs: {
              x1: PADL,
              x2: W - PADR,
              y1: yy,
              y2: yy,
              stroke: "var(--divider)",
              "stroke-width": 1
            } }));
          });
          var axis = function(y, txt) {
            kids.push(h("text", { attrs: {
              x: PADL - 4,
              y,
              "text-anchor": "end",
              "font-size": 9,
              fill: "var(--text-badge)",
              "font-family": "ui-monospace,monospace"
            } }, txt));
          };
          axis(plotTop + 4, String(Math.round(yMax)));
          axis(plotTop + 14, "Mbps");
          axis(plotBot, "0");
          if (multiSim) {
            results.forEach(function(r2, i) {
              if (i > 0 && slotOf(r2) === slotOf(results[i - 1])) return;
              if (i > 0) {
                var bx = (xOf(i - 1) + xOf(i)) / 2;
                kids.push(h("line", { attrs: {
                  x1: bx.toFixed(1),
                  x2: bx.toFixed(1),
                  y1: plotTop,
                  y2: latBot,
                  stroke: "var(--divider)",
                  "stroke-width": 1,
                  "stroke-dasharray": "3 3"
                } }));
              }
              kids.push(h(
                "text",
                { staticClass: "mms-sim", attrs: {
                  x: (xOf(i) + (i > 0 ? 4 : 0)).toFixed(1),
                  y: plotTop + 10,
                  "font-size": 9.5,
                  fill: "var(--text-badge)"
                } },
                "SIM " + slotOf(r2) + (r2.carrier ? " · " + r2.carrier : "")
              ));
            });
          }
          function linePath(key, color) {
            var d = "", pen = false, prevSlot = null;
            results.forEach(function(r2, i) {
              var v = r2[key];
              if (prevSlot !== null && slotOf(r2) !== prevSlot) pen = false;
              prevSlot = slotOf(r2);
              if (v == null) {
                pen = false;
                return;
              }
              d += (pen ? "L" : "M") + xOf(i).toFixed(1) + " " + yOf(v).toFixed(1) + " ";
              pen = true;
            });
            return d ? h("path", { attrs: { fill: "none", stroke: color, "stroke-width": 1.75, d: d.trim() } }) : null;
          }
          var downLine = linePath("down_mbps", "var(--primary)");
          var upLine = linePath("up_mbps", "var(--success)");
          if (downLine) kids.push(downLine);
          if (upLine) kids.push(upLine);
          results.forEach(function(r2, i) {
            if (r2.down_mbps != null) {
              kids.push(h("circle", { attrs: { cx: xOf(i).toFixed(1), cy: yOf(r2.down_mbps).toFixed(1), r: 2.5, fill: "var(--primary)" } }));
            }
            if (r2.up_mbps != null) {
              kids.push(h("circle", { attrs: { cx: xOf(i).toFixed(1), cy: yOf(r2.up_mbps).toFixed(1), r: 2.5, fill: "var(--success)" } }));
            }
          });
          kids.push(h("text", { attrs: { x: 4, y: latTop + LAT_H / 2 + 3, "font-size": 9, fill: "var(--text-badge)" } }, "MS"));
          kids.push(h("line", { attrs: {
            x1: PADL,
            x2: W - PADR,
            y1: latBot,
            y2: latBot,
            stroke: "var(--divider)",
            "stroke-width": 1
          } }));
          axis(latTop + 4, String(Math.round(maxLatency * 1.15)));
          var latD = "", penL = false, prevSlotL = null;
          results.forEach(function(r2, i) {
            if (prevSlotL !== null && slotOf(r2) !== prevSlotL) penL = false;
            prevSlotL = slotOf(r2);
            if (r2.latency_ms == null) {
              penL = false;
              return;
            }
            latD += (penL ? "L" : "M") + xOf(i).toFixed(1) + " " + latYOf(r2.latency_ms).toFixed(1) + " ";
            penL = true;
          });
          if (latD) kids.push(h("path", { attrs: { fill: "none", stroke: "var(--warning)", "stroke-width": 1.5, d: latD.trim() } }));
          if (this.cursor != null && results[this.cursor]) {
            var cx = xOf(this.cursor);
            kids.push(h("line", { attrs: {
              x1: cx.toFixed(1),
              x2: cx.toFixed(1),
              y1: plotTop,
              y2: latBot,
              stroke: this.pinned != null ? "var(--primary)" : "var(--text-weak)",
              "stroke-width": 1
            } }));
          }
          var dateY = latBot + 13;
          kids.push(h("text", { attrs: {
            x: PADL,
            y: dateY,
            "font-size": 9,
            fill: "var(--text-badge)",
            "font-family": "ui-monospace,monospace"
          } }, this.clock(results[0].t)));
          if (n > 1) kids.push(h("text", { attrs: {
            x: W - PADR,
            y: dateY,
            "text-anchor": "end",
            "font-size": 9,
            fill: "var(--text-badge)",
            "font-family": "ui-monospace,monospace"
          } }, this.clock(results[n - 1].t)));
          var svg = h("svg", { ref: "svg", attrs: {
            viewBox: "0 0 " + W + " " + (dateY + 4),
            width: W,
            height: dateY + 4,
            preserveAspectRatio: "none"
          } }, kids);
          var nearestIdx = function(evX) {
            if (n <= 1) return 0;
            var idx = Math.round((evX - PADL) / (W - PADL - PADR) * (n - 1));
            return Math.max(0, Math.min(n - 1, idx));
          };
          var onMove = function(e) {
            if (self.pinned != null) return;
            var el = self.$refs && self.$refs.graph;
            if (!el || !el.getBoundingClientRect) {
              self.cursor = results.length - 1;
              return;
            }
            var rect = el.getBoundingClientRect();
            if (!rect.width) {
              self.cursor = results.length - 1;
              return;
            }
            var ux = ((e.clientX || 0) - rect.left) * self.width / rect.width;
            self.cursor = nearestIdx(ux);
          };
          var onLeave = function() {
            if (self.pinned == null) self.cursor = null;
          };
          var onClick = function(e) {
            if (self.pinned != null) {
              self.pinned = null;
              return;
            }
            onMove(e);
            if (self.cursor == null) self.cursor = results.length - 1;
            self.pinned = self.cursor;
          };
          var tip = null;
          if (this.cursor != null && results[this.cursor]) {
            var r = results[this.cursor];
            var rows = [
              ["Down", r.down_mbps == null ? "—" : r.down_mbps + " Mbps"],
              ["Up", r.up_mbps == null ? "—" : r.up_mbps + " Mbps"]
            ].concat(resultDetailRows(r));
            tip = h("div", { staticClass: "mms-tip" }, [
              h("div", { staticClass: "t" }, this.clock(r.t) + (this.pinned != null ? " · " + t("pinned") : ""))
            ].concat(rows.map(function(row) {
              return h("div", { staticClass: "mms-tip-row" }, [h("span", row[0]), h("b", row[1])]);
            })));
          }
          return h("div", {
            ref: "graph",
            staticClass: "mms-graph",
            on: { mousemove: onMove, mouseleave: onLeave, click: onClick }
          }, [svg, tip]);
        },
        injectStyle: function() {
          if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
          var css = ".mms{color:var(--text-regular)}.mms-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);padding:12px 14px;margin-bottom:11px}.mms-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}.mms-crumb{background:none;border:0;font:inherit;font-size:12px;color:var(--primary);cursor:pointer;padding:0}.mms-title{font-size:14px;font-weight:600;color:var(--text-title)}.mms-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mms-btn{font-size:12px;font-weight:600;border-radius:3px;padding:7px 14px;cursor:pointer;font-family:inherit;border:1px solid var(--border);background:var(--background-card);color:var(--text-regular)}.mms-btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}.mms-btn.danger{color:var(--error);border-color:var(--error)}.mms-hint{font-size:11.5px;color:var(--text-weak);flex-basis:100%}.mms-btn:disabled{opacity:.6;cursor:default}.mms-err{color:var(--error);font-size:12px}.mms-sched{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px;font-size:12px}.mms-sched-toggle{display:flex;align-items:center;gap:6px;cursor:pointer}.mms-server{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:10px;font-size:12px}.mms-url{flex:1 1 220px;min-width:0;font:inherit;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:var(--background-card);color:var(--text-regular)}.mms-empty{padding:24px 0;text-align:center;color:var(--text-hint);font-size:12.5px}.mms-graph{position:relative;cursor:crosshair}.mms-graph svg{display:block;width:100%}.mms-tip{position:absolute;top:8px;left:8px;pointer-events:none;z-index:5;background:var(--background-card);border:1px solid var(--border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:8px 10px;min-width:170px}.mms-tip .t{font-size:10.5px;color:var(--text-badge);margin-bottom:5px}.mms-tip-row{display:flex;justify-content:space-between;gap:14px;font-size:11.5px;padding:1px 0}.mms-tip-row b{font-weight:600;color:var(--text-title)}.mms-latest-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}.mms-latest-when{font-size:11px;color:var(--text-badge)}.mms-latest-big{display:flex;gap:22px;margin-bottom:10px;flex-wrap:wrap}.mms-latest-metric{display:flex;flex-direction:column}.mms-latest-metric .v{font-size:22px;font-weight:700;color:var(--text-title);line-height:1.15}.mms-latest-metric .u{font-size:10.5px;color:var(--text-badge)}";
          var el = document.createElement("style");
          el.id = this.styleId;
          el.textContent = css;
          document.head.appendChild(el);
        },
        renderPage: function(h) {
          var self = this;
          var head = h("div", { staticClass: "mms-head" }, [
            this.embedded ? null : h("button", { staticClass: "mms-crumb", on: { click: function() {
              if (self.$router) self.$router.push("/mudimodem");
            } } }, "← Modem"),
            h("span", { staticClass: "mms-title" }, "Speedtest")
          ].filter(Boolean));
          var ifaceFilterSel = h("select", {
            domProps: { value: this.filterIface },
            on: { change: function(ev) {
              self.filterIface = ev.target.value;
            } }
          }, IFACES.map(function(i) {
            return h("option", { attrs: { value: i[0] }, key: i[0] }, i[1]);
          }));
          var slotSel = null;
          if (this.slotsShown.length > 1) {
            var carrierOf = function(slot) {
              for (var i = self.results.length - 1; i >= 0; i--) {
                var r = self.results[i];
                if (r.iface === "cellular" && String(r.slot) === slot && r.carrier) return r.carrier;
              }
              return "";
            };
            slotSel = h("select", {
              staticClass: "mms-slotsel",
              domProps: { value: this.slotFilter },
              on: { change: function(ev) {
                self.filterSlot = ev.target.value;
                self.cursor = null;
                self.pinned = null;
              } }
            }, [h("option", { attrs: { value: "all" }, key: "all" }, "All SIMs")].concat(
              this.slotsShown.map(function(sl) {
                var c = carrierOf(sl);
                return h("option", { attrs: { value: sl }, key: sl }, "SIM " + sl + (c ? " · " + c : ""));
              })
            ));
          }
          return h("div", { staticClass: "mms" }, [
            h("div", { staticClass: "mms-card" }, [head, this.renderControls(h), this.renderServer(h), this.renderSchedule(h)].filter(Boolean)),
            this.renderLatestResult(h),
            h("div", { staticClass: "mms-card" }, [
              h("div", { staticClass: "mms-controls" }, [
                h("span", "History"),
                ifaceFilterSel,
                slotSel,
                this.filtered.length ? h("button", {
                  staticClass: "mms-btn",
                  attrs: { title: "Download these results as CSV" },
                  on: { click: function() {
                    self.exportResults();
                  } }
                }, "CSV") : null,
                h(
                  "button",
                  {
                    staticClass: "mms-btn" + (self.clearArmed ? " danger" : ""),
                    on: { click: function() {
                      self.armClear();
                    } }
                  },
                  self.clearArmed ? "Click again to delete all results" : "Clear history"
                )
              ].filter(Boolean)),
              this.renderGraph(h)
            ])
          ]);
        }
      },
      render: function(h) {
        return this.renderPage(h);
      }
    };
    return component;
  }());
  return __toCommonJS(speedtest_exports);
})();
return __mm.default;
})();

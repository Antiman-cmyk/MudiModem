/* MudiModem — built from src/web/tabs/console.js by tools/build-web.mjs. Do not edit: run npm run build:web. */
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

  // src/web/tabs/console.js
  var console_exports = {};
  __export(console_exports, {
    default: () => console_default
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
  var MAX_SLICES = 40;
  function follow(call, sliceMs, next) {
    var n = 0;
    var step = function(r) {
      if (r && r.pending && r.id != null) {
        if (++n > MAX_SLICES) return { error: "gave up waiting for the router" };
        return call(next || "job_result", { id: r.id }, sliceMs).then(step);
      }
      return r;
    };
    return step;
  }
  function rpcJob(method, params, sliceMs) {
    sliceMs = sliceMs || 35e3;
    var call = function(m, p, ms) {
      return rpc(m, p, { timeout: ms });
    };
    return call(method, params, sliceMs).then(follow(call, sliceMs));
  }
  function rpcSilentJob(method, params, sliceMs) {
    sliceMs = sliceMs || 35e3;
    return rpcSilent(method, params, sliceMs).then(follow(rpcSilent, sliceMs));
  }

  // src/web/locales/zh-cn.js
  var zh_cn_default = {
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
    "Applied {what}. Reverting in {s} unless you keep it - watch the trace above.": "已应用 {what}。{s} 后自动恢复，除非你选择保留 - 请观察上方的信号曲线。",
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
    "Choose the network mode and which 5G/LTE bands the modem may use. Blocked bands are ones the module supports but your carrier forbids - they can't be selected because they never take.": "选择网络模式，以及 Modem 可以使用的 5G/LTE 频段。被屏蔽的频段是模组支持、但运营商策略不允许的频段 - 选了也不会生效，所以不能选。",
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
    "Read again": "重新读取",
    "Read neighbours": "读取邻区",
    "Reading band configuration from the modem...": "正在从 Modem 读取频段配置…",
    "Reading lock state from the modem...": "正在从 Modem 读取锁定状态…",
    "Received power from the cell, in dBm. Above −90 is good, −90 to −105 fair, below −110 poor.": "从基站收到的信号功率，单位 dBm。高于 −90 为好，−90 到 −105 一般，低于 −110 差。",
    "Recovery": "恢复方法",
    "Refresh now": "立即更新",
    "Refreshing…": "正在更新…",
    "Remote sessions:": "远程连接：",
    "Reset to default": "恢复默认",
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
    "Signal against noise and interference, in dB. Above 13 is good, 0 to 13 fair, below 0 poor.": "信号与噪声和干扰之比，单位 dB。高于 13 为好，0 到 13 一般，低于 0 差。",
    "Signal quality including how busy the cell is, in dB. Above −10 is good, −10 to −15 fair, below −15 poor.": "信号质量（含基站繁忙程度），单位 dB。高于 −10 为好，−10 到 −15 一般，低于 −15 差。",
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
    "The frequency band in use: n = 5G NR, B = LTE. Low bands reach far; high bands are faster but shorter.": "当前使用的频段：n 表示 5G NR，B 表示 LTE。低频覆盖远；高频速度快但覆盖近。",
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
    "allowed": "已允许",
    "apply failed": "应用失败",
    "band change": "频段修改",
    "blocked by carrier policy": "被运营商策略屏蔽",
    "blocked by policy": "被策略屏蔽",
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
    "in use": "使用中",
    "load failed": "加载失败",
    "lock failed": "锁定失败",
    "locked": "已锁定",
    "low band, reaches far": "低频，覆盖远",
    "mode -> {m}": "模式 -> {m}",
    "mode {m}": "模式 {m}",
    "modem": "Modem",
    "ms latency": "ms 延迟",
    "newest first": "最新的在前",
    "no answer": "没有应答",
    "no reply": "无应答",
    "no scan, the link stays up": "无需扫描，连接不中断",
    "nv": "nv",
    "one clock, all three metrics — hover for a slice, click to pin": "同一时间轴上的三个指标 — 悬停查看某一时刻，点击固定",
    "other frequency": "异频",
    "permitted, not active": "允许但未生效",
    "permitted, not selected": "允许但未选择",
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
    "ring = serving now (every carrier: PCC + SCCs)": "圆环 = 当前服务（所有载波：PCC + SCC）",
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
    "scanned {n} min ago": "{n} 分钟前扫描",
    "serving now": "当前服务",
    "serving now ({role})": "当前服务（{role}）",
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
    "{b} allowed (click to remove)": "{b} 已允许（点击移除）",
    "{b} blocked by carrier policy; selecting has no effect": "{b} 被运营商策略屏蔽，选择也不会生效",
    "{b} permitted (click to allow)": "{b} 运营商允许（点击启用）",
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
    "{s} supported / {p} permitted / {a} active": "支持 {s} / 允许 {p} / 生效 {a}",
    "{time} remaining": "剩余 {time}",
    "{time} to {pct} %": "{time} 充到 {pct} %",
    "{title} (read-only)": "{title}（只读）",
    "{what} changed; applies with a 60s revert": "已修改 {what}；应用后有 60 秒的自动恢复",
    "{what} changed; stored for SIM {n}": "{what} 已更改；将为 SIM {n} 保存",
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

  // src/web/tabs/console.js
  var console_default = localize(/* @__PURE__ */ function() {
    var HISTORY_MAX = 100;
    var STORE = {
      // Shared BY REFERENCE with every instance's `lines` / `history` (data()
      // hands out these very arrays — never reassign them, only mutate). A reply
      // that lands after a tab switch therefore still reaches the transcript the
      // re-created tab is showing.
      lines: [],
      history: [],
      libStatus: null,
      // last library_status answer for this page load
      transport: "gl",
      // what the last reply came through ("gl" | "direct")
      libStatusP: null
      // the one library_status request this page makes
    };
    return {
      name: "mudimodem-console",
      data() {
        return {
          styleId: "mudimodem-console-css",
          lib: null,
          // library entries once fetched
          libLoading: false,
          libErr: "",
          q: "",
          // rail search text
          selId: null,
          // selected entry id; null = free-typing
          riskOK: false,
          // "Enable higher-risk commands" — this browser session only (sessionStorage)
          copyNote: "",
          // feedback after Copy (copied / failed), shown for a moment
          stickBottom: true,
          // keep the transcript scrolled to the newest line unless the user scrolled up
          lines: STORE.lines,
          // transcript { t, kind: cmd|resp|ok|err|urc|note, text } — page-lifetime
          LINES_MAX: 400,
          history: STORE.history,
          // sent commands, oldest first — page-lifetime, HISTORY_MAX
          histIdx: null,
          histDraft: "",
          // what was typed before ArrowUp started recalling
          prompt: "",
          multiline: false,
          params: {},
          // param values for the selected entry
          sending: false,
          decodeRows: null,
          // [[{f,v,hi},…] per matched response line]
          decodeSrc: "",
          libStatus: STORE.libStatus,
          // {local_revision, remote_revision, update_available, checked}
          transport: STORE.transport,
          // "gl" (GL's AT service) | "direct" (/dev/at_mdm0 fallback)
          refreshing: false,
          refreshMsg: ""
        };
      },
      props: { cell: { type: Object, default: function() {
        return {};
      } } },
      computed: {
        // The parent (mudimodem.js cellModel) is the only reader of GL's sockets;
        // it passes what this tab needs as a prop.
        activeSlot() {
          return this.cell && this.cell.slot;
        },
        activeCarrier() {
          return this.cell && this.cell.carrier || "";
        },
        // Which channel answers, and for which SIM — say so, always. GL's AT
        // service is addressed to the active slot's subscription; the direct port
        // (only while GL's stack is down) answers for whatever it is on.
        truthLine() {
          var who = this.activeCarrier ? t("{carrier} (slot {slot})", { carrier: this.activeCarrier, slot: this.activeSlot }) : this.activeSlot ? t("slot {slot}", { slot: this.activeSlot }) : t("resolving…");
          return this.transport === "direct" ? t("direct port /dev/at_mdm0 (GL's AT service is down) · active SIM: {who}", { who }) : t("GL's AT service · addressed to the active SIM: {who}", { who });
        },
        entries() {
          var lib = this.lib || [];
          var q = this.q.toLowerCase();
          if (!q) return lib;
          return lib.filter(function(e) {
            return (e.title + " " + e.cmd + " " + e.summary + " " + e.cat).toLowerCase().indexOf(q) !== -1;
          });
        },
        cats() {
          var seen = [];
          this.entries.forEach(function(e) {
            if (seen.indexOf(e.cat) === -1) seen.push(e.cat);
          });
          return seen;
        },
        sel() {
          var id = this.selId;
          return (this.lib || []).filter(function(e) {
            return e.id === id;
          })[0] || null;
        },
        selParams() {
          return this.sel && this.sel.params || [];
        },
        paramMode() {
          return this.selParams.length > 0;
        },
        // The command text that would be sent: the entry's cmd OR its steps joined
        // by newline, with {{params}} substituted (unfilled ones stay visible).
        assembled() {
          if (!this.sel || !this.paramMode) return this.prompt;
          var base = this.sel.steps ? this.sel.steps.join("\n") : this.sel.cmd;
          var p = this.params;
          return base.replace(/\{\{(\w+)\}\}/g, function(m, name) {
            var v = ((p[name] || "") + "").trim();
            return v !== "" ? v : m;
          });
        },
        // The wire command split into individual AT steps (trimmed, blanks dropped).
        stepLines() {
          var v = ((this.paramMode ? this.assembled : this.prompt) || "").trim();
          if (!v) return [];
          return v.split(/\r?\n/).map(function(s) {
            return s.trim();
          }).filter(function(s) {
            return s !== "";
          });
        },
        promptMultiline() {
          if (this.multiline) return true;
          var v = this.paramMode ? this.assembled : this.prompt;
          return (v || "").indexOf("\n") >= 0;
        },
        paramsFilled() {
          var p = this.params;
          return this.selParams.every(function(x) {
            return ((p[x.name] || "") + "").trim() !== "";
          });
        },
        gateBlocked() {
          return !!(this.sel && this.sel.risk !== "read" && !this.riskOK);
        }
      },
      // New transcript lines land at the bottom: follow them unless the user scrolled up to read.
      updated() {
        var el = this.$refs && this.$refs.term;
        if (el && this.stickBottom) el.scrollTop = el.scrollHeight;
      },
      created() {
        var self = this;
        this.injectStyle();
        try {
          this.riskOK = window.sessionStorage.getItem("mudimodem.riskEnabled") === "1";
        } catch (e) {
        }
        this.fetchLib();
        if (STORE.libStatusP) STORE.libStatusP.then(function(st) {
          self.libStatus = st;
        });
        else this.checkLibraryStatus();
      },
      beforeDestroy() {
        if (this._copyTimer) {
          clearTimeout(this._copyTimer);
          this._copyTimer = null;
        }
      },
      methods: {
        // Background calls (the on-open library check): POST to /rpc via $axios
        // DIRECTLY. $rpcRequest's interceptor raises GL's global banner on any
        // failure — e.g. its own timeout while the router waits on GitHub — before
        // our .catch can run. Resolves the result, or null on any failure.
        rpcSilent(method, params, timeoutMs) {
          return rpcSilent(method, params, timeoutMs || 15e3);
        },
        fetchLib() {
          var self = this;
          if (this.libLoading) return;
          if (typeof window === "undefined" || !window.$axios) return;
          this.libLoading = true;
          this.libErr = "";
          window.$axios.get("/mudimodem/at-library.json?_t=" + Date.now()).then(function(res) {
            self.lib = res.data && res.data.entries || [];
            self.libLoading = false;
          }).catch(function(e) {
            self.libLoading = false;
            self.libErr = e && e.message || "load failed";
          });
        },
        // Fail-silent by contract: any failure is libStatus null (the rail just
        // shows no revision line). Shared through STORE for the page's lifetime.
        checkLibraryStatus() {
          var self = this;
          var p = rpcSilentJob("library_status", {}).then(function(r) {
            STORE.libStatus = r || null;
            self.libStatus = STORE.libStatus;
            return STORE.libStatus;
          });
          STORE.libStatusP = p;
          return p;
        },
        refreshLibrary() {
          var self = this;
          if (this.refreshing || !hasRpc()) return Promise.resolve();
          this.refreshing = true;
          this.refreshMsg = "";
          return rpcJob("refresh_library", {}).then(function(r) {
            self.refreshing = false;
            if (r && r.ok) {
              self.refreshMsg = t("updated — rev {rev}", { rev: r.revision || "" });
              self.fetchLib();
              return self.checkLibraryStatus();
            }
            self.refreshMsg = r && r.error || "refresh failed";
          }).catch(function(e) {
            self.refreshing = false;
            self.refreshMsg = e && (e.message || e.type) || "refresh failed";
          });
        },
        toggleGate() {
          this.riskOK = !this.riskOK;
          try {
            window.sessionStorage.setItem("mudimodem.riskEnabled", this.riskOK ? "1" : "0");
          } catch (e) {
          }
        },
        pick(e) {
          this.selId = e.id;
          var ps = {};
          (e.params || []).forEach(function(p) {
            ps[p.name] = "";
          });
          this.params = ps;
          var base = e.steps ? e.steps.join("\n") : e.cmd;
          this.prompt = e.params && e.params.length ? "" : base;
          this.multiline = !!e.steps || base.indexOf("\n") >= 0;
          this.decodeRows = null;
          this.decodeSrc = "";
        },
        onPromptInput(v) {
          this.prompt = v;
          if (v.indexOf("\n") >= 0) this.multiline = true;
          var base = this.sel ? this.sel.steps ? this.sel.steps.join("\n") : this.sel.cmd : null;
          if (this.sel && !this.paramMode && v !== base) this.selId = null;
        },
        promptKey(ev) {
          if (ev.key === "Enter" && !ev.shiftKey) {
            if (ev.preventDefault) ev.preventDefault();
            this.send();
            return;
          }
          if (ev.key === "Enter" && ev.shiftKey) {
            if (!this.promptMultiline && !this.paramMode) {
              if (ev.preventDefault) ev.preventDefault();
              this.multiline = true;
              this.prompt = (this.prompt || "") + "\n";
            }
            return;
          }
          if ((ev.key === "ArrowUp" || ev.key === "ArrowDown") && !this.paramMode && !this.promptMultiline) {
            if (!this.history.length) return;
            if (ev.key === "ArrowDown" && this.histIdx === null) return;
            if (ev.preventDefault) ev.preventDefault();
            if (this.histIdx === null) this.histDraft = this.prompt;
            var i = this.histIdx === null ? this.history.length : this.histIdx;
            i += ev.key === "ArrowUp" ? -1 : 1;
            if (i < 0) i = 0;
            if (i >= this.history.length) {
              this.histIdx = null;
              this.prompt = this.histDraft;
              return;
            }
            this.histIdx = i;
            this.prompt = this.history[i];
            this.selId = null;
          }
        },
        stamp() {
          var d = /* @__PURE__ */ new Date();
          var p = function(n) {
            return (n < 10 ? "0" : "") + n;
          };
          return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
        },
        push(kind, text) {
          this.lines.push({ t: this.stamp(), kind, text });
          if (this.lines.length > this.LINES_MAX) {
            this.lines.splice(0, this.lines.length - this.LINES_MAX);
          }
        },
        note(text) {
          this.push("note", text);
        },
        classifyLine(l) {
          var URCS = [
            "RDY",
            "+CPIN:",
            "+QUSIM",
            "+CPINDS:",
            "+QIND:",
            "+CFUN:",
            "+CGEV:",
            "+QNETDEVSTATUS:",
            "POWERED DOWN"
          ];
          if (l === "OK") return "ok";
          if (l === "ERROR" || l.indexOf("+CME ERROR") === 0 || l.indexOf("+CMS ERROR") === 0) return "err";
          for (var i = 0; i < URCS.length; i++) if (l.indexOf(URCS[i]) === 0) return "urc";
          return "resp";
        },
        // Quote-aware CSV split: '"a,b",c' -> ['a,b','c'] (AT responses quote text).
        splitFields(s) {
          var out = [], cur = "", inQ = false;
          for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (ch === '"') {
              inQ = !inQ;
              cur += ch;
            } else if (ch === "," && !inQ) {
              out.push(cur);
              cur = "";
            } else cur += ch;
          }
          out.push(cur);
          return out.map(function(x) {
            return x.trim().replace(/^"|"$/g, "");
          });
        },
        // Label matched response lines with the entry's decode fields. `entry` may
        // be null (free-typed): fall back to an exact cmd match in the library.
        //
        // `decode` is either one schema `{prefix, fields, …}` or an **array** of
        // schemas (issue #2: NSA QENG returns a header line + separate LTE /
        // NR5G-NSA lines, each with its own prefix and field map). Optional
        // `min_fields` skips a match whose value list is shorter (header-only
        // `+QENG: "servingcell","NOCONN"` has one field after the prefix).
        applyDecode(entry, cmd, resp) {
          var e = entry && entry.cmd === cmd ? entry : null;
          if (!e) {
            e = (this.lib || []).filter(function(x) {
              return x.cmd === cmd;
            })[0] || null;
          }
          if (!e || !e.decode) {
            this.decodeRows = null;
            this.decodeSrc = "";
            return;
          }
          var schemas = Array.isArray(e.decode) ? e.decode : [e.decode];
          var self = this, rows = [];
          resp.replace(/\r/g, "\n").split("\n").forEach(function(line) {
            line = line.trim();
            if (!line) return;
            for (var si = 0; si < schemas.length; si++) {
              var d = schemas[si];
              if (!d || !d.prefix || line.indexOf(d.prefix) !== 0) continue;
              var rest = line.slice(d.prefix.length).replace(/^[,\s]+/, "");
              var parts = self.splitFields(rest);
              var n = parts.length === 1 && parts[0] === "" ? 0 : parts.length;
              if (d.min_fields != null && n < d.min_fields) continue;
              rows.push(d.fields.map(function(f, i) {
                var v = parts[i] !== void 0 && parts[i] !== "" ? parts[i] : "—";
                var en = (d.enums || {})[f];
                if (en && en[v] !== void 0) v = en[v];
                return { f, v, hi: (d.hi || []).indexOf(f) !== -1 };
              }));
              break;
            }
          });
          this.decodeRows = rows.length ? rows : null;
          this.decodeSrc = e.id;
        },
        send() {
          var self = this;
          var entry = this.sel;
          var steps = this.stepLines;
          if (!steps.length || this.sending) return;
          if (steps.some(function(s) {
            return /\{\{/.test(s);
          })) {
            this.note("fill in every parameter before sending");
            return;
          }
          if (this.gateBlocked) {
            this.note("this is a " + entry.risk + ' entry — tick "Enable higher-risk commands" in the banner to send it');
            return;
          }
          var wire = steps.join("\n");
          steps.forEach(function(s) {
            self.push("cmd", s);
          });
          this.history.push(wire);
          this.histIdx = null;
          if (this.history.length > HISTORY_MAX) this.history.splice(0, this.history.length - HISTORY_MAX);
          this.decodeRows = null;
          if (!hasRpc()) {
            this.push("err", "RPC unavailable");
            return;
          }
          var TOOL_T = 8;
          var SLICE_MS = 35e3;
          this.sending = true;
          var shown = 0, combined = "";
          var show = function(r) {
            if (r && (r.transport === "gl" || r.transport === "direct")) {
              STORE.transport = self.transport = r.transport;
            }
            var got = r && Array.isArray(r.steps) ? r.steps : [];
            got.slice(shown).forEach(function(st) {
              var resp = st.response || "";
              combined += resp + "\n";
              resp.replace(/\r/g, "\n").split("\n").forEach(function(l) {
                l = l.trim();
                if (l) self.push(self.classifyLine(l), l);
              });
              if (st.status === "timeout") {
                self.push("err", "no terminator after " + TOOL_T + "s — " + (self.transport === "direct" ? "the response may still arrive; until it does (or is given up on), the next send waits for it or reports the channel busy" : "GL's AT service stopped waiting; it drops a late answer before the next command, so nothing gets mixed up"));
              }
            });
            if (got.length > shown) shown = got.length;
          };
          var step = function(r) {
            if (r && r.error) {
              self.sending = false;
              self.push("err", r.error);
              return;
            }
            show(r);
            if (r && r.pending && r.id != null) {
              return rpc("at_result", { id: r.id }, { timeout: SLICE_MS }).then(step);
            }
            self.sending = false;
            if (r && r.aborted) {
              var skipped = (r.requested || steps.length) - (r.ran || shown);
              for (var i = 0; i < skipped; i++) self.note("skipped — previous step failed");
            }
            self.applyDecode(entry, wire, combined);
          };
          return rpc("at_console", { cmd: wire, timeout: TOOL_T }, { timeout: SLICE_MS }).then(step).catch(function(e) {
            self.sending = false;
            self.push("err", e && (e.message || e.type) || "request failed");
          });
        },
        // navigator.clipboard exists only on HTTPS; the admin is usually plain http://192.168.8.1, so
        // fall back to a hidden textarea + execCommand, and always say what happened.
        copyTranscript() {
          var self = this;
          var txt = this.lines.map(function(l) {
            return l.t + "  " + l.text;
          }).join("\n");
          var done = function(ok) {
            self.copyNote = ok ? "Copied" : "Copy failed - select the text to copy it";
            clearTimeout(self._copyTimer);
            self._copyTimer = setTimeout(function() {
              self.copyNote = "";
            }, 2500);
          };
          var legacy = function() {
            if (typeof document === "undefined") return done(false);
            var ta = document.createElement("textarea");
            ta.value = txt;
            ta.setAttribute("readonly", "");
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try {
              ok = document.execCommand("copy");
            } catch (e) {
              ok = false;
            }
            document.body.removeChild(ta);
            done(ok);
          };
          if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(function() {
              done(true);
            }, legacy);
          } else legacy();
        },
        clearTranscript() {
          this.lines.splice(0, this.lines.length);
          this.stickBottom = true;
        },
        onTermScroll(e) {
          var el = e && e.target;
          if (el) this.stickBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        },
        riskText(r) {
          return {
            read: "safe — reads only",
            set: "changes runtime state — gone on reboot",
            nv: "WRITES MODEM NV — survives factory reset"
          }[r] || r;
        },
        injectStyle() {
          if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
          var css = ".mmc{color:var(--text-regular)}.mmc-caution{display:flex;gap:8px;align-items:baseline;background:var(--error-background);border:1px solid var(--error-disabled);border-radius:3px;padding:8px 10px;font-size:11.5px;color:var(--error-hover);margin-bottom:11px;flex-wrap:wrap}.mmc-caution b{color:var(--error);flex:none}.mmc-gate{margin-left:auto;display:flex;gap:5px;align-items:center;white-space:nowrap;cursor:pointer;font-size:11.5px}.mmc-split{display:grid;grid-template-columns:270px minmax(0,1fr);gap:10px}.mmc-split>*{min-width:0}@media(max-width:820px){.mmc-split{grid-template-columns:minmax(0,1fr)}}.mmc-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px var(--shadow);padding:11px 12px}.mmc-sect{font-size:13px;font-weight:600;color:var(--text-title)}.mmc-hint{font-size:11.5px;color:var(--text-badge)}.mmc-row{display:flex;justify-content:space-between;align-items:center;gap:12px}.mmc-search{width:100%;box-sizing:border-box;font:12px inherit;padding:5px 9px;border:1px solid var(--border);border-radius:3px;background:var(--background-card);color:var(--text-regular);margin-top:8px}.mmc-search:focus{outline:0;border-color:var(--primary)}.mmc-libbody{overflow-y:auto;max-height:430px;margin:6px -12px 0;padding:0}.mmc-cat{font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-badge);padding:8px 12px 4px}.mmc-snip{display:block;width:100%;text-align:left;background:none;border:0;cursor:pointer;padding:6px 12px;border-left:2px solid transparent;font:inherit;color:inherit}.mmc-snip:hover{background:var(--background-title)}.mmc-snip.on{background:var(--primary-background);border-left-color:var(--primary)}.mmc-snip:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}.mmc-snip-t{display:flex;align-items:center;gap:6px}.mmc-snip-t b{font-size:12px;font-weight:600;color:var(--text-title)}.mmc-snip code{display:block;font-family:monospace;font-size:10.5px;color:var(--text-weak);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mmc-risk{font-size:8.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-radius:2px;padding:1px 4px;flex:none}.mmc-risk.read{background:var(--success-background);color:var(--success-hover);border:1px solid var(--success-disabled)}.mmc-risk.set{background:var(--warning-background);color:var(--warning-hover);border:1px solid var(--warning-disabled)}.mmc-risk.nv{background:var(--error-background);color:var(--error-hover);border:1px solid var(--error-disabled)}.mmc-term{background:var(--background-title);border:1px solid var(--divider);border-radius:3px;padding:9px 11px;font-family:monospace;font-size:11.5px;line-height:1.6;height:224px;overflow:auto;margin-top:9px}.mmc-l-cmd{color:var(--primary)}.mmc-l-ok{color:var(--success-hover)}.mmc-l-err{color:var(--error)}.mmc-l-resp{color:var(--text-weak)}.mmc-l-urc{color:var(--text-hint)}.mmc-l-note{color:var(--warning-hover)}.mmc-t{color:var(--text-hint);margin-right:6px}.mmc-urctag{font-size:8.5px;border:1px solid var(--divider);border-radius:2px;padding:0 3px;margin-left:5px;color:var(--text-hint)}.mmc-pstrip{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.mmc-pstrip label{display:flex;flex-direction:column;gap:2px;font-size:10px;color:var(--text-badge)}.mmc-pstrip input,.mmc-pstrip select{font-family:monospace;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:3px;background:var(--background-card);color:var(--text-regular);width:130px}.mmc-prompt{display:flex;gap:7px;margin-top:9px}.mmc-prompt>span{font-family:monospace;font-size:12px;color:var(--primary);padding-top:6px}.mmc-prompt input{flex:1;font-family:monospace;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:3px;background:var(--background-card);color:var(--text-regular)}.mmc-prompt input:focus{outline:0;border-color:var(--primary)}.mmc-send{font-size:11.5px;font-weight:600;background:var(--primary);color:#fff;border:1px solid var(--primary);border-radius:3px;padding:6px 13px;cursor:pointer;font-family:inherit}.mmc-send:disabled{opacity:.5;cursor:default}.mmc-send:focus-visible{outline:2px solid var(--primary);outline-offset:2px}.mmc-dec{margin-top:9px;border:1px solid var(--divider);border-radius:3px;overflow:hidden}.mmc-dec-h{background:var(--background-title);padding:5px 10px;display:flex;justify-content:space-between;align-items:center}.mmc-dec-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:1px;background:var(--divider)}.mmc-dc{background:var(--background-card);padding:6px 9px}.mmc-dc span{display:block;font-size:8.5px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}.mmc-dc b{font-size:12px;font-weight:600;font-family:monospace;color:var(--text-title)}.mmc-dc.hi b{color:var(--success)}.mmc-detail{margin-top:10px}.mmc-meta{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}.mmc-meta span{display:block;font-size:9px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}.mmc-meta b{font-size:11.5px;font-weight:600;color:var(--text-title)}.mmc-warn{color:var(--error-hover)}.mmc-ta{flex:1;font-family:monospace;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:3px;background:var(--background-card);color:var(--text-regular);resize:vertical;line-height:1.5}.mmc-ta:focus{outline:0;border-color:var(--primary)}.mmc-steps{margin-top:8px;display:flex;flex-direction:column;gap:3px}.mmc-step{font-family:monospace;font-size:11px;color:var(--text-weak);background:var(--background-title);border-radius:3px;padding:4px 8px}.mmc-librow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:11.5px}.mmc-libupd{font-weight:600;color:var(--primary)}.mmc-refresh{font-size:11px;font-weight:600;background:var(--primary);color:#fff;border:1px solid var(--primary);border-radius:3px;padding:3px 9px;cursor:pointer;font-family:inherit}.mmc-refresh:disabled{opacity:.5;cursor:default}@media(prefers-reduced-motion:reduce){.mmc *{transition:none!important}}";
          var el = document.createElement("style");
          el.id = this.styleId;
          el.textContent = css;
          document.head.appendChild(el);
        }
      },
      render(h) {
        var self = this;
        var banner = h("div", { staticClass: "mmc-caution" }, [
          h("b", "Sharp edge."),
          h("span", t(
            "Commands go straight to the {modem}. Nothing is validated. Entries marked nv write modem memory that survives a factory reset.",
            { modem: this.cell && this.cell.modem || t("modem") }
          )),
          h("label", { staticClass: "mmc-gate" }, [
            h("input", {
              attrs: { type: "checkbox", checked: this.riskOK },
              domProps: { checked: this.riskOK },
              on: { change: function() {
                self.toggleGate();
              } }
            }),
            "Enable higher-risk commands"
          ])
        ]);
        var libKids = [
          h("div", { staticClass: "mmc-row" }, [
            h("span", { staticClass: "mmc-sect" }, "Library"),
            h(
              "span",
              { staticClass: "mmc-hint" },
              this.lib ? t("{n} commands", { n: this.entries.length }) : ""
            )
          ]),
          function() {
            var st = self.libStatus, kids = [];
            if (st) {
              var rev = st.local_revision || "unknown";
              if (st.checked && st.update_available) {
                kids.push(h("span", { staticClass: "mmc-libupd" }, "Update available"));
                kids.push(h("button", {
                  staticClass: "mmc-refresh",
                  attrs: { disabled: self.refreshing },
                  on: { click: function() {
                    self.refreshLibrary();
                  } }
                }, self.refreshing ? "Refreshing…" : "Refresh now"));
              } else if (st.checked) {
                kids.push(h("span", { staticClass: "mmc-hint" }, t("Up to date · rev {rev}", { rev })));
              } else {
                kids.push(h("span", { staticClass: "mmc-hint" }, t("rev {rev}", { rev })));
              }
            }
            if (self.refreshMsg) kids.push(h("span", { staticClass: "mmc-hint" }, self.refreshMsg));
            return kids.length ? h("div", { staticClass: "mmc-librow" }, kids) : null;
          }(),
          h("input", {
            staticClass: "mmc-search",
            attrs: { placeholder: "Search — band, lock, signal…", "aria-label": "Search library" },
            domProps: { value: this.q },
            on: { input: function(ev) {
              self.q = ev.target.value;
            } }
          })
        ];
        var body;
        if (this.libLoading) {
          body = h("div", { staticClass: "mmc-hint", staticStyle: { padding: "10px 0" } }, "Loading the library…");
        } else if (this.libErr) {
          body = h("div", { staticStyle: { padding: "10px 0" } }, [
            h("div", { staticClass: "mmc-hint" }, t("Couldn't load the library: {err}", { err: this.libErr }) + " "),
            h("button", {
              staticClass: "mmc-send",
              staticStyle: { marginTop: "6px" },
              on: { click: function() {
                self.fetchLib();
              } }
            }, "Retry")
          ]);
        } else if (!this.lib) {
          body = h("div", { staticClass: "mmc-hint", staticStyle: { padding: "10px 0" } }, "Library not loaded.");
        } else if (!this.entries.length) {
          body = h("div", { staticClass: "mmc-hint", staticStyle: { padding: "10px 0" } }, "No matches.");
        } else {
          var items = [];
          this.cats.forEach(function(cat) {
            items.push(h("div", { staticClass: "mmc-cat", key: "cat-" + cat }, cat));
            self.entries.filter(function(e2) {
              return e2.cat === cat;
            }).forEach(function(e2) {
              items.push(h("button", {
                key: e2.id,
                staticClass: "mmc-snip" + (self.selId === e2.id ? " on" : ""),
                on: { click: function() {
                  self.pick(e2);
                } }
              }, [
                h("span", { staticClass: "mmc-snip-t" }, [
                  h("b", e2.title),
                  h("span", { staticClass: "mmc-risk " + e2.risk }, e2.risk)
                ]),
                h("code", e2.cmd)
              ]));
            });
          });
          body = h("div", { staticClass: "mmc-libbody" }, items);
        }
        libKids.push(body);
        var rail = h("div", { staticClass: "mmc-card" }, libKids.filter(Boolean));
        var termKids = this.lines.length ? this.lines.map(function(l, i) {
          return h("div", { key: i, staticClass: "mmc-l-" + l.kind }, [
            h("span", { staticClass: "mmc-t" }, l.t),
            l.text,
            l.kind === "urc" ? h("span", { staticClass: "mmc-urctag" }, "URC") : null
          ]);
        }) : [h(
          "div",
          { staticClass: "mmc-hint" },
          "ready. Pick a command from the library, or type one."
        )];
        var term = h("div", { staticClass: "mmc-term", ref: "term", on: { scroll: this.onTermScroll } }, termKids);
        var pstrip = null;
        if (this.paramMode) {
          pstrip = h("div", { staticClass: "mmc-pstrip" }, this.selParams.map(function(p) {
            var field;
            if (p.values && p.values.length) {
              field = h("select", {
                domProps: { value: self.params[p.name] || "" },
                on: { change: function(ev) {
                  self.params[p.name] = ev.target.value;
                } }
              }, [h("option", { attrs: { value: "" } }, "—")].concat(
                p.values.map(function(v) {
                  return h("option", { attrs: { value: v }, key: v }, v);
                })
              ));
            } else {
              field = h("input", {
                attrs: { placeholder: p.example || "", title: p.hint },
                domProps: { value: self.params[p.name] || "" },
                on: { input: function(ev) {
                  self.params[p.name] = ev.target.value;
                } }
              });
            }
            return h("label", { key: p.name }, [p.name + " — " + p.hint, field]);
          }));
        }
        var multi = this.promptMultiline;
        var promptCtl = h(multi ? "textarea" : "input", {
          staticClass: multi ? "mmc-ta" : "",
          attrs: {
            placeholder: "AT+…",
            "aria-label": "AT command",
            readonly: this.paramMode || null,
            rows: multi ? Math.min(8, Math.max(2, this.stepLines.length)) : null
          },
          domProps: { value: this.paramMode ? this.assembled : this.prompt },
          on: {
            input: function(ev) {
              if (!self.paramMode) self.onPromptInput(ev.target.value);
            },
            keydown: function(ev) {
              self.promptKey(ev);
            }
          }
        });
        var promptRow = h("div", { staticClass: "mmc-prompt" }, [
          h("span", ">"),
          promptCtl,
          h("button", {
            staticClass: "mmc-send",
            attrs: { disabled: this.sending || this.paramMode && !this.paramsFilled },
            on: { click: function() {
              self.send();
            } }
          }, this.sending ? "Sending…" : "Send")
        ]);
        var dec = null;
        if (this.decodeRows) {
          dec = h("div", { staticClass: "mmc-dec" }, [
            h("div", { staticClass: "mmc-dec-h" }, [
              h("span", { staticClass: "mmc-hint" }, "Decoded — field names from the library entry"),
              h("span", { staticClass: "mmc-hint" }, this.decodeSrc)
            ])
          ].concat(this.decodeRows.map(function(row, ri) {
            return h("div", { staticClass: "mmc-dec-g", key: ri }, row.map(function(cell) {
              return h("div", { staticClass: "mmc-dc" + (cell.hi ? " hi" : ""), key: cell.f }, [
                h("span", cell.f.replace(/_/g, " ")),
                h("b", String(cell.v))
              ]);
            }));
          })));
        }
        var con = h("div", { staticClass: "mmc-card" }, [
          h("div", { staticClass: "mmc-row" }, [
            h("span", { staticClass: "mmc-sect" }, "Raw AT"),
            h("span", { staticClass: "mmc-row" }, [
              h("button", {
                staticClass: "mmc-send",
                staticStyle: {
                  background: "transparent",
                  color: "var(--text-weak)",
                  borderColor: "var(--border)",
                  fontWeight: "400"
                },
                attrs: { title: "Copy the transcript" },
                on: { click: function() {
                  self.copyTranscript();
                } }
              }, "Copy"),
              h("button", {
                staticClass: "mmc-send",
                staticStyle: {
                  background: "transparent",
                  color: "var(--text-weak)",
                  borderColor: "var(--border)",
                  fontWeight: "400"
                },
                attrs: { title: "Clear the transcript", disabled: !this.lines.length },
                on: { click: function() {
                  self.clearTranscript();
                } }
              }, "Clear"),
              this.copyNote ? h("span", { staticClass: "mmc-hint" }, this.copyNote) : null,
              h("span", { staticClass: "mmc-hint" }, this.truthLine)
            ])
          ]),
          term,
          pstrip,
          promptRow,
          dec
        ].filter(Boolean));
        var detail = null;
        var e = this.sel;
        if (e) {
          detail = h("div", { staticClass: "mmc-card mmc-detail" }, [
            h("div", { staticClass: "mmc-row" }, [
              h("span", { staticClass: "mmc-sect" }, e.title),
              h("span", [
                h("span", { staticClass: "mmc-risk " + e.risk }, e.risk),
                h(
                  "span",
                  { staticClass: "mmc-hint", staticStyle: { marginLeft: "6px" } },
                  this.riskText(e.risk)
                )
              ])
            ]),
            h("div", { staticClass: "mmc-hint", staticStyle: { marginTop: "3px", fontSize: "12px" } }, [
              e.summary + " ",
              e.warn ? h("span", { staticClass: "mmc-warn" }, e.warn) : null
            ]),
            e.steps ? h("div", { staticClass: "mmc-steps" }, e.steps.map(function(s, i) {
              return h("code", { key: i, staticClass: "mmc-step" }, s);
            })) : null,
            h("div", { staticClass: "mmc-meta" }, [
              h("div", [h("span", "Vendor"), h("b", e.vendor)]),
              h("div", [
                h("span", "Verified on"),
                h("b", e.verified && e.verified.length ? e.verified.join(", ") : "— nobody yet")
              ]),
              h("div", [h("span", "Source"), h("b", e.source)]),
              h("div", [h("span", "Contributed by"), h("b", e.by)])
            ])
          ].filter(Boolean));
        }
        return h("div", { staticClass: "mmc" }, [
          banner,
          h("div", { staticClass: "mmc-split" }, [rail, con]),
          detail
        ].filter(Boolean));
      }
    };
  }());
  return __toCommonJS(console_exports);
})();
return __mm.default;
})();

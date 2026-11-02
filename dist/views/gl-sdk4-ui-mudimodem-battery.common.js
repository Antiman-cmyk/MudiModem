/* MudiModem — built from src/web/tabs/battery.js by tools/build-web.mjs. Do not edit: run npm run build:web. */
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

  // src/web/tabs/battery.js
  var battery_exports = {};
  __export(battery_exports, {
    default: () => battery_default
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
    "Each test uses about {mib} MiB of data — about {day} a day at this interval.": "每次测速约消耗 {mib} MiB 流量 — 按当前间隔每天约 {day}。",
    "Earlier battery history didn't load — showing samples since the tab opened; retrying every {s} s.": "更早的电池历史没能加载 — 只显示打开本页以来的采样；每 {s} 秒重试一次。",
    "Earlier history didn't load — showing live samples since the page opened; retrying every {s} s.": "更早的历史没能加载 — 只显示打开页面以来的实时采样；每 {s} 秒重试一次。",
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
    "Latency": "延迟",
    "Latest result": "最近结果",
    "Library": "命令库",
    "Library not loaded.": "命令库未加载。",
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
    "Low-level: target {target}, current {cur}": "底层：目标 {target}，当前 {cur}",
    "Mbps down": "Mbps 下载",
    "Mbps up": "Mbps 上传",
    "Model": "型号",
    "Modem": "Modem",
    "Modem crash": "Modem 崩溃",
    "MudiModem (version unknown)": "MudiModem（版本未知）",
    "Nearby cells": "附近基站",
    "Neighbour cells": "邻区",
    "Network": "网络",
    "Network mode": "网络模式",
    "Network mode — open Bands": "网络模式 — 打开频段页",
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
    "Offline": "断网",
    "On battery": "电池供电",
    "PAUSED": "已暂停",
    "Pin the modem to the cell it is using now - the safest lock target.": "把 Modem 固定在当前使用的基站上 - 最安全的锁定目标。",
    "Ping": "Ping",
    "RPC helper unavailable": "RPC 不可用",
    "RPC unavailable": "RPC 不可用",
    "RSRP · dBm": "RSRP · dBm",
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
    "SCS {scs} kHz is assumed from the band.": "SCS {scs} kHz 是根据频段推定的。",
    "SIM {slot} (active) is not registered on a network right now - {carrier}.": "SIM {slot}（当前使用）目前未注册到网络 - {carrier}。",
    "SIM {slot} (active) is not registered on a network right now.": "SIM {slot}（当前使用）目前未注册到网络。",
    "SINR · dB": "SINR · dB",
    "Sampled every 10s by the MudiModem collector (pushed live), last {n} minutes": "由 MudiModem 采集器每 10 秒采样并实时推送，显示最近 {n} 分钟",
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
    "Target": "目标",
    "Target must be 20–100 % GL UI Reported Charge": "目标必须在 20–100 %（GL 界面电量）之间",
    "Target too low — the charge IC needs at least 50 % IC Reported Charge (about 50 % GL UI Reported Charge)": "目标太低 — 充电芯片至少需要 50 %（电量芯片读数，约合 GL 界面电量 50 %）",
    "Temp": "温度",
    "Temperature · °C": "温度 · °C",
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
    "could not save schedule": "无法保存计划",
    "could not start": "无法启动",
    "couldn't reach the router": "无法连接路由器",
    "default: band filtering off, mode Auto": "默认：关闭频段过滤，模式自动",
    "direct port /dev/at_mdm0 (GL's AT service is down) · active SIM: {who}": "直连端口 /dev/at_mdm0（GL 的 AT 服务不可用）· 当前 SIM 卡：{who}",
    "fill in every parameter before sending": "发送前请填写所有参数",
    "filtering off + Auto": "关闭过滤 + 自动",
    "from the last {n} min": "依据最近 {n} 分钟",
    "high band, fast + short range": "高频，速度快、覆盖近",
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
    "{name} is not connected": "{name} 未连接",
    "{n} GiB": "{n} GiB",
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

  // src/web/tabs/battery.js
  var battery_default = localize(function() {
    "use strict";
    var LANES = [
      {
        key: "capGui",
        label: "GL UI Reported Charge · %",
        unit: "%",
        h: 96,
        dec: 0,
        color: "var(--primary)",
        fixed: [0, 100]
      },
      {
        key: "cur",
        label: "Current · mA",
        unit: "mA",
        h: 64,
        dec: 0,
        color: "var(--success)",
        zero: true
      },
      {
        key: "voltV",
        label: "Voltage · V",
        unit: "V",
        h: 64,
        dec: 2,
        color: "var(--secondary)",
        fixed: [3.3, 4.3]
      },
      // not --info-hover: equals --text-hint in the dark theme
      {
        key: "temp",
        label: "Temperature · °C",
        unit: "°C",
        h: 64,
        dec: 1,
        color: "var(--warning)",
        minSpan: 5
      }
    ];
    var RANGES = [[15, "15 m"], [60, "1 h"], [360, "6 h"], [1440, "24 h"]];
    var TICKSTEP = { 15: 2, 60: 10, 360: 60, 1440: 240 };
    var GAP_MS = 6e4;
    var FAIL_NOTE_AFTER = 3;
    var STALL_MS = 6e4;
    var HOLE_MS = 5e4;
    var RETRY_BASE_MS = 2e3, RETRY_MAX_MS = 3e4;
    var BL_REFRESH_MS = 6e4;
    var PADL = 8, PADR = 42, LANE_GAP = 16, BAND_H = 9, TOP = 24, PLOT_INSET = 5;
    var FS_LANE = 11.5, FS_SCALE = 10.5, FS_TICK = 10.5, FS_AXIS = 11, FS_READOUT = 14;
    var GUI_M = 13867, GUI_B = 189300;
    var LIMIT_MIN = 50, LIMIT_MAX = 100;
    var EST_WINDOW_MS = 60 * 6e4, EST_MIN_SPAN_MIN = 8, EST_MIN_DELTA_PCT = 2;
    var EST_MAX_MIN = 48 * 60;
    var AVG_WINDOW_MS = 6e4;
    var STATE_COLOR = {
      charging: "var(--success)",
      // A genuinely full battery on mains is a healthy, unremarkable state —
      // same token as charging, not the `blocked` warning colour.
      full: "var(--success)",
      blocked: "var(--warning)",
      draining: "var(--error)",
      discharging: "var(--text-hint)",
      // Plugged in, 0 mA, and the limiter is NOT the reason — something else
      // stopped the charge (thermal, fault, a charger that just terminated).
      idle: "var(--text-hint)",
      unknown: "var(--text-hint)"
    };
    var STATE_LABEL = {
      charging: "Charging",
      full: "Full",
      blocked: "Charge blocked (limit)",
      draining: "Draining on power",
      discharging: "On battery",
      idle: "Not charging",
      unknown: "Unknown"
    };
    var component = {
      name: "mudimodem-battery",
      // `embedded` is set when the main Modem page renders us inside its Battery
      // tab (the only caller today); it drops our own heading.
      props: { embedded: { type: Boolean, default: false } },
      data: function() {
        return {
          winW: 15,
          samples: [],
          lastT: 0,
          serverNow: 0,
          serverNowAt: 0,
          loading: true,
          err: "",
          fetching: false,
          loadedFrom: null,
          // Poll health. `okCount` distinguishes "the collector has nothing yet"
          // from "we have never reached the box"; `failStreak` keeps one dropped
          // poll on a flaky cellular link from raising an alarm.
          okCount: 0,
          failStreak: 0,
          lastGoodAt: 0,
          // browser clock of the last successful fetch/push (stale-note arithmetic)
          // Bumped on every fetchHistory call; late replies for a superseded
          // range request are dropped so a 24 h click mid-15 m load cannot
          // repaint the short window (jayck88 requestSeq pattern).
          histRequestSeq: 0,
          pendingWindow: null,
          poll: null,
          tick: 0,
          live: true,
          pushSeenAt: 0,
          // pinnedT: the pinned slice as an ABSOLUTE box-clock sample time (a
          // minutes-relative pin slid to a newer sample on every push).
          width: 900,
          styleId: "mmb-css-v4",
          cursor: null,
          pinnedT: null,
          // preloaded: a WINDOW load has succeeded at least once (pushes alone
          // only carry what happened after the tab opened). loadFails/retryMs
          // drive the backoff and the note; missingSince is the start of a tail
          // (hole backfill) that failed or was dropped — the next push re-asks.
          preloaded: false,
          loadFails: 0,
          retryMs: 0,
          missingSince: null,
          // charge-limit form state (moved here from the Config tab)
          bl: null,
          blBusy: false,
          blErr: "",
          blDraft: 80,
          blFetchedAt: 0
          // browser clock of the last get_battlimit (the slow refresh cadence)
        };
      },
      computed: {
        // The collector's battery pushes (mudimodem.battery) land in the SPA's
        // status store; watching them is how this chart stays live.
        pushedSample: function() {
          var g = this.$store && this.$store.getters;
          var s = g && g.moduleStatus ? g.moduleStatus("mudimodem.battery") : null;
          return s && s.t ? s : null;
        }
      },
      watch: {
        "pushedSample.t": function() {
          this.onPush(this.pushedSample);
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
        this._alive = true;
        this.fetchBattLimit();
        this.fetchHistory();
        this.pushSeenAt = Date.now();
        this.poll = setInterval(function() {
          if (self.live && Date.now() - self.pushSeenAt > STALL_MS) self.fetchHistory({ since: self.lastT, merge: true });
          if (Date.now() - self.blFetchedAt >= BL_REFRESH_MS) self.refreshBattLimit();
        }, 3e4);
      },
      updated: function() {
        this.measure();
      },
      beforeDestroy: function() {
        this._alive = false;
        if (this._retryTimer) {
          clearTimeout(this._retryTimer);
          this._retryTimer = null;
        }
        if (this.poll) clearInterval(this.poll);
        if (typeof window !== "undefined" && this._onResize)
          window.removeEventListener("resize", this._onResize);
      },
      methods: {
        // ---- data ----
        // POST to /rpc via $axios DIRECTLY, not $rpcRequest: $rpcRequest's axios
        // interceptor pops GL's global error banner on any failure BEFORE our
        // .catch runs — unacceptable for a silent 10 s background poll on a flaky
        // cellular link. Fails silently; a bad poll just retries next tick.
        //
        // ⚠️ It RESOLVES `null` on every failure and never rejects — that is the
        // contract, and it is why attaching a .catch to it is pointless (there
        // was one here once; it was dead code and `this.err` could never be set,
        // so a dead /rpc showed "No battery history yet" forever). Silent to GL's
        // banner is NOT the same as silent to the user: the caller must treat a
        // `null` resolution as the failure it is. See fetchHistory.
        rpcSilent: function(method, params, timeout) {
          return rpcSilent(method, params, timeout || 2e4);
        },
        // opts = { window: <minutes>, since: <ms>, merge: <bool> }.
        // ⚠️ A window goes to the box as a DURATION (window_ms), never as a
        // browser-computed absolute cutoff: the two clocks disagree on a travel
        // router, and an absolute cutoff mis-sizes the window by exactly the skew.
        // The poll's `since` is exempt — it is a timestamp the BOX stamped.
        //
        // Every reply MERGES into what is held (dedupe by t, sort) — including a
        // window load: pushes may have landed while it was in flight, or while it
        // was failing and being retried, and replacing would drop them.
        fetchHistory: function(opts) {
          opts = opts || {};
          var self = this;
          if (typeof window === "undefined" || !window.$axios) {
            self.loading = false;
            return;
          }
          var merge = !!opts.merge;
          var incremental = opts.since != null && opts.since > 0;
          if (self.fetching && merge) {
            if (incremental) self.noteMissing(opts.since);
            return;
          }
          self.fetching = true;
          var requestSeq = ++self.histRequestSeq;
          var winMs = (opts.window || self.winW) * 6e4;
          var params = incremental ? { since: Math.floor(opts.since) } : { window_ms: winMs };
          return this.rpcSilent("get_battery_history", params).then(function(res) {
            if (requestSeq !== self.histRequestSeq) return;
            self.fetching = false;
            if (self._alive === false) return;
            if (!res) {
              self.failStreak++;
              if (self.failStreak >= FAIL_NOTE_AFTER) {
                var stale = self.lastGoodAt ? Math.round((Date.now() - self.lastGoodAt) / 1e3) : 0;
                self.err = stale ? t(
                  "Can't reach the router — battery history stopped updating {age} ago.",
                  { age: stale >= 120 ? t("{n} min", { n: Math.round(stale / 60) }) : t("{n} s", { n: stale }) }
                ) : t("Can't reach the router — battery history stopped updating.");
              }
              if (incremental) {
                self.noteMissing(opts.since);
              } else {
                self.loadFails++;
                self.retryMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, self.loadFails - 1));
                self.scheduleRetry();
              }
              self.loading = false;
              self.tick++;
              self.drainPending();
              return;
            }
            self.okCount++;
            self.failStreak = 0;
            self.lastGoodAt = Date.now();
            var ns = res.samples || [];
            var merged = ns;
            if (self.samples && self.samples.length) {
              var haveT = {};
              for (var i = 0; i < self.samples.length; i++) haveT[self.samples[i].t] = 1;
              merged = self.samples.concat(ns.filter(function(x) {
                return x && x.t && !haveT[x.t];
              })).sort(function(a, b) {
                return a.t - b.t;
              });
            }
            if (incremental) {
              if (self.missingSince != null && opts.since <= self.missingSince) self.missingSince = null;
            } else {
              self.preloaded = true;
              self.loadFails = 0;
              self.retryMs = 0;
              if (self._retryTimer) {
                clearTimeout(self._retryTimer);
                self._retryTimer = null;
              }
            }
            self.serverNow = res.now || Date.now();
            self.serverNowAt = Date.now();
            var cut = self.serverNow - 24 * 3600 * 1e3;
            merged = merged.filter(function(s) {
              return s.t >= cut;
            });
            self.samples = typeof Object.freeze === "function" ? Object.freeze(merged) : merged;
            if (self.samples.length) self.lastT = self.samples[self.samples.length - 1].t;
            var reached = incremental ? opts.since : self.serverNow - winMs;
            self.loadedFrom = self.loadedFrom == null ? reached : Math.min(self.loadedFrom, reached);
            self.err = "";
            self.tick++;
            self.loading = false;
            self.drainPending();
          });
        },
        noteMissing: function(since) {
          this.missingSince = this.missingSince == null ? since : Math.min(this.missingSince, since);
        },
        // One pending retry at a time, only while mounted. It asks for the range
        // shown NOW (the user may have changed it since the failure).
        scheduleRetry: function() {
          var self = this;
          if (!this._alive || this._retryTimer) return;
          this._retryTimer = setTimeout(function() {
            self._retryTimer = null;
            if (self._alive) self.fetchHistory({ window: self.winW });
          }, this.retryMs || RETRY_BASE_MS);
        },
        drainPending: function() {
          if (this.pendingWindow == null) return;
          var w = this.pendingWindow;
          this.pendingWindow = null;
          this.fetchHistory({ window: w });
        },
        // A live battery sample (mudimodem.battery push): append it exactly as an
        // incremental fetch would have; a push also proves the box is reachable,
        // so it clears the stale-history note.
        onPush: function(s) {
          if (!s || !s.t || s.t <= this.lastT) return;
          var prevT = this.lastT;
          var prev = this.samples.length ? this.samples[this.samples.length - 1] : null;
          this.pushSeenAt = Date.now();
          this.lastGoodAt = Date.now();
          var merged = this.samples.concat([s]);
          var cut = s.t - 24 * 3600 * 1e3;
          if (merged.length && merged[0].t < cut) merged = merged.filter(function(x) {
            return x.t >= cut;
          });
          this.samples = typeof Object.freeze === "function" ? Object.freeze(merged) : merged;
          this.lastT = s.t;
          this.serverNow = s.t;
          this.serverNowAt = Date.now();
          this.okCount++;
          this.failStreak = 0;
          this.err = "";
          this.tick++;
          var from = prevT > 0 && s.t - prevT > HOLE_MS ? prevT : null;
          if (this.missingSince != null) from = from == null ? this.missingSince : Math.min(from, this.missingSince);
          if (from != null) this.fetchHistory({ since: from, merge: true });
          if (prev && this.limiterStateChanged(prev, s)) this.refreshBattLimit();
        },
        // Did anything the limit card describes change between two samples?
        // Charger online, the watcher alive (`lim`), its gauge target.
        limiterStateChanged: function(a, b) {
          var n = function(v) {
            return v == null ? null : Number(v);
          };
          return !!a.online !== !!b.online || n(a.lim) !== n(b.lim) || n(a.lim_gauge) !== n(b.lim_gauge);
        },
        setRange: function(w) {
          this.winW = w;
          this.pinnedT = null;
          this.cursor = null;
          var cutoff = this.nowMs() - w * 6e4;
          if (this.loadedFrom == null || cutoff < this.loadedFrom - 1e3)
            this.fetchHistory({ window: w });
        },
        // ---- charge limit (user-initiated => $rpcRequest is correct here) ----
        // Clamp a stored target into the slider's range so the thumb cannot
        // misrepresent a stored value below the floor. Deliberately does NOT
        // write the clamped value back: silently rewriting a user's setting
        // because the UI changed shape is worse than a clamped thumb. The next
        // deliberate interaction saves a valid value.
        clampDraft: function(v) {
          return Math.max(LIMIT_MIN, Math.min(LIMIT_MAX, v));
        },
        fetchBattLimit: function() {
          var self = this;
          if (!hasRpc()) return Promise.resolve();
          this.blFetchedAt = Date.now();
          return rpc("get_battlimit", {}, { timeout: 8e3 }).then(function(r) {
            self.bl = r || null;
            if (r && typeof r.limit_gui === "number") self.blDraft = self.clampDraft(r.limit_gui);
            self.blErr = r && r.error || "";
            self._blErrBg = false;
          }).catch(function(e) {
            self.blErr = e && (e.message || e.type) || "request failed";
            self._blErrBg = false;
          });
        },
        // Background re-read of the same snapshot (a push showed the charger or
        // the limiter changed, or BL_REFRESH_MS passed). SILENT transport — a
        // background call must never raise GL's banner — and fail-soft: a failed
        // re-read keeps the snapshot we have instead of blanking the card.
        refreshBattLimit: function() {
          var self = this;
          if (this.blBusy || this._blRefreshing) return Promise.resolve();
          this._blRefreshing = true;
          this.blFetchedAt = Date.now();
          return this.rpcSilent("get_battlimit", {}).then(function(r) {
            self._blRefreshing = false;
            if (self._alive === false || self.blBusy) return;
            if (!r || !(typeof r.available === "boolean" || typeof r.limit_gui === "number")) return;
            var prev = self.bl;
            self.bl = r;
            if (typeof r.limit_gui === "number" && (!prev || typeof prev.limit_gui !== "number" || self.blDraft === self.clampDraft(prev.limit_gui)))
              self.blDraft = self.clampDraft(r.limit_gui);
            if (r.error) {
              self.blErr = r.error;
              self._blErrBg = true;
            } else if (self._blErrBg) {
              self.blErr = "";
              self._blErrBg = false;
            }
          });
        },
        applyBattLimit: function(patch) {
          var self = this;
          if (this.blBusy || !hasRpc()) return;
          var cur = this.bl || { enabled: false, limit_gui: 80 };
          var enabled = patch && typeof patch.enabled === "boolean" ? patch.enabled : !!cur.enabled;
          var limit_gui = patch && patch.limit_gui != null ? Number(patch.limit_gui) : Number(this.blDraft || cur.limit_gui);
          if (!(limit_gui >= 20 && limit_gui <= 100)) {
            this.blErr = t("Target must be 20–100 % GL UI Reported Charge");
            return;
          }
          var gauge = this.gaugeOf(limit_gui);
          if (gauge < 50 || gauge > 100) {
            this.blErr = t("Target too low — the charge IC needs at least 50 % IC Reported Charge (about 50 % GL UI Reported Charge)");
            return;
          }
          this.blBusy = true;
          this.blErr = "";
          this._blErrBg = false;
          return rpc(
            "set_battlimit",
            { enabled, limit_gui },
            { timeout: 15e3 }
          ).then(function(r) {
            self.blBusy = false;
            self.blFetchedAt = Date.now();
            if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number")) {
              self.bl = r;
              if (typeof r.limit_gui === "number") self.blDraft = r.limit_gui;
            }
            if (r && r.error) self.blErr = r.error;
            else if (r && (typeof r.available === "boolean" || typeof r.limit_gui === "number"))
              self.blErr = "";
          }).catch(function(e) {
            self.blBusy = false;
            self.blErr = e && (e.message || e.type) || "request failed";
          });
        },
        // ---- scales + derived series ----
        measure: function() {
          if (this.$refs && this.$refs.lanes && this.$refs.lanes.clientWidth)
            this.width = this.$refs.lanes.clientWidth;
        },
        // skew-corrected box-now: server clock advanced by browser elapsed time.
        nowMs: function() {
          if (this.serverNow) return this.serverNow + (Date.now() - this.serverNowAt);
          return Date.now();
        },
        mOf: function(t2) {
          return -((this.nowMs() - t2) / 6e4);
        },
        // Plot domain in box-clock ms. When retained history is shorter than the
        // selected range, raise `start` to the first sample so the real data
        // spans the full plot (jayck88 partial-window stretch) instead of sitting
        // in a stub on the right of an empty 24 h canvas.
        chartBounds: function(ss) {
          var end = this.nowMs();
          var start = end - this.winW * 6e4;
          if (ss && ss.length) {
            for (var i = 0; i < ss.length; i++) {
              if (ss[i] && ss[i].t != null && isFinite(ss[i].t)) {
                if (ss[i].t > start) start = ss[i].t;
                break;
              }
            }
          }
          if (start >= end) start = end - 6e4;
          return { start, end };
        },
        // Minutes of the *plotted* span (may be < winW on a short history).
        spanMin: function(bounds) {
          return Math.max(1 / 60, (bounds.end - bounds.start) / 6e4);
        },
        xOf: function(m, bounds) {
          var plotW = this.width - PADL - PADR;
          var span = bounds ? this.spanMin(bounds) : this.winW;
          return PADL + (m + span) / span * plotW;
        },
        xOfT: function(t2, bounds) {
          var plotW = this.width - PADL - PADR;
          var span = Math.max(1, bounds.end - bounds.start);
          return PADL + (t2 - bounds.start) / span * plotW;
        },
        // Window min–max for a metric, as a label fragment (e.g. "72.0–84.1").
        observedRange: function(ss, key, dec) {
          var lo = null, hi = null;
          for (var i = 0; i < (ss ? ss.length : 0); i++) {
            var v = ss[i][key];
            if (v == null || !isFinite(Number(v))) continue;
            v = Number(v);
            if (lo === null || v < lo) lo = v;
            if (hi === null || v > hi) hi = v;
          }
          if (lo === null) return "—";
          if (lo === hi) return Number(lo).toFixed(dec);
          return Number(lo).toFixed(dec) + "–" + Number(hi).toFixed(dec);
        },
        fmtAgo: function(t2) {
          if (t2 == null) return "—";
          var seconds = Math.max(0, Math.round((this.nowMs() - t2) / 1e3));
          if (seconds < 60) return t("{n}s ago", { n: seconds });
          var minutes = Math.round(seconds / 60);
          if (minutes < 60) return t("{n} min ago", { n: minutes });
          var hours = Math.round(minutes / 60);
          return t("{n} h ago", { n: hours });
        },
        // gauge % -> GL's "GUI" %, using the constants get_battlimit serves so the
        // fit lives in exactly one place (the Lua backend).
        // GUI % -> gauge %, the inverse of guiOf and byte-for-byte the integer
        // formula the Lua backend's gui_to_gauge uses, so the UI and the box
        // never disagree about what a target means. Same served-constants-with-
        // fallback rule as guiOf.
        gaugeOf: function(gui) {
          if (gui == null) return null;
          var bl = this.bl || {};
          var m = bl.gui_m || GUI_M, b = bl.gui_b || GUI_B;
          return Math.floor((gui * 1e4 + b + m / 2) / m);
        },
        guiOf: function(gauge) {
          if (gauge == null) return null;
          var bl = this.bl || {};
          var m = bl.gui_m || GUI_M, b = bl.gui_b || GUI_B;
          var v = Math.round((gauge * m - b) / 1e3) / 10;
          return Math.max(0, Math.min(100, v));
        },
        // Samples inside the window, ascending, de-duplicated, decorated with the
        // derived fields the lanes plot. Incremental polling concats, which can
        // leave this.samples out of order or with duplicate t — a backward point
        // would draw one long line across the whole plot. Sort/dedupe HERE, the
        // single choke point every consumer goes through.
        winSamples: function() {
          var cutoff = this.nowMs() - this.winW * 6e4, self = this;
          var win = this.samples.filter(function(s) {
            return s.t >= cutoff;
          }).map(function(s) {
            return Object.assign({}, s, {
              m: self.mOf(s.t),
              capGui: self.guiOf(s.cap),
              voltV: s.volt == null ? null : Math.round(s.volt) / 1e3
            });
          });
          win.sort(function(a, b) {
            return a.t - b.t;
          });
          var out = [], prev = null;
          for (var i = 0; i < win.length; i++) {
            if (prev !== null && win[i].t === prev) continue;
            out.push(win[i]);
            prev = win[i].t;
          }
          return out;
        },
        // Contiguous runs of a metric: split on a null value AND on a time hole
        // bigger than GAP_MS, so an outage renders as a break rather than a
        // straight line pretending the battery held steady through it.
        //
        // ⚠️ PERFORMANCE: winSamples() is O(n log n) over the whole retained
        // array (filter + map + sort + dedupe). Everything below therefore comes
        // in a `*From(ss, …)` flavour that takes an ALREADY-COMPUTED window, so
        // one render computes the window ONCE and hands it down (the pattern
        // mudimodem-tracking.js:342 uses). The zero-argument wrappers are kept
        // for callers outside a render pass (and for the tests); never call them
        // per point or per lane. See the render-budget test in
        // test/battery-chunk.test.js.
        segmentsFrom: function(ss, key) {
          var segs = [], cur = [];
          for (var i = 0; i < ss.length; i++) {
            var s = ss[i];
            if (i > 0 && s.t - ss[i - 1].t > GAP_MS) {
              if (cur.length) segs.push(cur);
              cur = [];
            }
            var v = s[key];
            if (v == null) {
              if (cur.length) segs.push(cur);
              cur = [];
              continue;
            }
            cur.push({ m: s.m, v, t: s.t });
          }
          if (cur.length) segs.push(cur);
          return segs;
        },
        segments: function(key) {
          return this.segmentsFrom(this.winSamples(), key);
        },
        // Min/max-preserving reduction to roughly `cols` columns.
        // ⚠️ NEVER average. Averaging smears the Current lane's exact 0 (the
        // charge limit engaging) into a small non-zero number and erases the one
        // reading this whole feature exists to show.
        // ⚠️ min/max alone is NOT the same as "0 survives": a bucket straddling
        // zero (e.g. charging (+) -> blocked (0) -> discharging (-)) has the 0
        // as neither its min nor its max, so it must be tracked and kept
        // EXPLICITLY, not assumed to fall out of the lo/hi selection.
        reduce: function(pts, cols) {
          if (!pts.length || pts.length <= cols) return pts;
          var span = (pts[pts.length - 1].m - pts[0].m) / cols;
          if (!(span > 0)) return pts;
          var out = [], i = 0;
          while (i < pts.length) {
            var edge = pts[i].m + span, lo = pts[i], hi = pts[i], zero = null, j = i;
            while (j < pts.length && pts[j].m < edge) {
              if (pts[j].v < lo.v) lo = pts[j];
              if (pts[j].v > hi.v) hi = pts[j];
              if (pts[j].v === 0 && zero === null) zero = pts[j];
              j++;
            }
            if (j === i) j = i + 1;
            if (lo === hi) {
              out.push(lo);
            } else {
              var keep = [lo, hi];
              if (zero !== null && zero !== lo && zero !== hi) keep.push(zero);
              keep.sort(function(a, b) {
                return a.m - b.m;
              });
              for (var k = 0; k < keep.length; k++) out.push(keep[k]);
            }
            i = j;
          }
          return out;
        },
        domainFrom: function(ss, lane) {
          var lo = null, hi = null;
          this.segmentsFrom(ss, lane.key).forEach(function(seg) {
            seg.forEach(function(p) {
              if (lo === null || p.v < lo) lo = p.v;
              if (hi === null || p.v > hi) hi = p.v;
            });
          });
          if (lane.fixed) {
            var d0 = lane.fixed[0], d1 = lane.fixed[1];
            if (lo !== null && lo < d0) d0 = lo;
            if (hi !== null && hi > d1) d1 = hi;
            return [d0, d1];
          }
          if (lo === null) return [0, 1];
          if (lane.zero) {
            lo = Math.min(lo, 0);
            hi = Math.max(hi, 0);
          }
          var span = hi - lo, min = lane.minSpan || 0;
          if (span < min) {
            var mid = (lo + hi) / 2;
            lo = mid - min / 2;
            hi = mid + min / 2;
          } else if (span === 0) {
            lo -= 1;
            hi += 1;
          } else {
            var pad = span * 0.08;
            lo -= pad;
            hi += pad;
          }
          if (lane.zero) {
            lo = Math.min(lo, 0);
            hi = Math.max(hi, 0);
          }
          return [lo, hi];
        },
        domainFor: function(lane) {
          return this.domainFrom(this.winSamples(), lane);
        },
        // `dom` is the lane's ALREADY-RESOLVED [lo, hi]. A render resolves it once
        // per lane and passes it in — computing it here would put a full
        // winSamples()+segments() pass behind every plotted point (the O(n²)
        // freeze that made the 6 h and 24 h ranges unusable). The fallback is for
        // one-off callers outside a render pass only.
        yIn: function(lane, top, v, dom) {
          var d = dom || this.domainFor(lane), d0 = d[0], d1 = d[1];
          var h = Math.max(1, lane.h - 2 * PLOT_INSET);
          if (d1 === d0) return top + PLOT_INSET + h / 2;
          var t2 = (Math.max(d0, Math.min(d1, v)) - d0) / (d1 - d0);
          return top + PLOT_INSET + h - t2 * h;
        },
        // Is the charge limiter itself holding this sample's charge off?
        //
        // ⚠️⚠️ READ THIS BEFORE "FIXING" chargeState AGAIN. The charger reports
        // `status = Full`, `charge_type = Trickle` when the limiter is engaged —
        // because glbattlimit blocks charging by writing the buck's `vreg` BELOW
        // the current cell voltage (src/sbin/glbattlimit `gate_on`), which is
        // exactly the condition a charger calls "charge complete". Verified on
        // the box 2026-07-28 at gauge 71 = gui_to_gauge(80), i.e. sitting on the
        // configured target with the watcher alive: cur=0, online=1,
        // status=Full, ctype=Trickle, charge_en=0, vreg=3900000 (factory
        // 4400000). So `status === "Full"` is the LIMITER'S SIGNATURE, not
        // evidence of a full cell, and keying "full" off it inverts the label
        // precisely when the feature has something to show.
        //
        // The discriminator is the limiter's own state, recorded PER SAMPLE by
        // mudimodem-collectd (`lim` = watcher alive, `lim_gauge` = its gauge
        // target). Per-sample, not from the live get_battlimit snapshot: the
        // snapshot describes NOW, and a 24 h window routinely spans a settings
        // change that would otherwise relabel history retroactively.
        limiterHeld: function(s) {
          if (s.lim !== 1) return false;
          if (s.lim_gauge == null || s.cap == null) return true;
          return s.cap >= s.lim_gauge;
        },
        // What the charger is doing, per sample.
        // Mean current over the trailing `windowMs`. `ss` is the already-computed
        // window (same no-requadratic discipline as runEstimate).
        //
        // Why this exists: the instantaneous reading is close to unreadable. Over
        // 40 min of real history it spanned 758 mA (stdev 139); at 20 s sampling a
        // 60 s mean is only ~3 samples, but it brings stdev to ~100.
        //
        // ⚠️ The window is anchored on the NEWEST SAMPLE'S timestamp, not
        // Date.now(). If the collector stalls, this then reports the mean of the
        // last 60 s of data that actually exists, instead of averaging an empty
        // window because wall-clock time moved on without it.
        avgCurrent: function(ss, windowMs) {
          if (!ss || !ss.length) return null;
          var edge = ss[ss.length - 1].t - windowMs;
          var sum = 0, n = 0;
          for (var i = ss.length - 1; i >= 0; i--) {
            if (ss[i].t < edge) break;
            if (ss[i].cur == null) continue;
            sum += ss[i].cur;
            n++;
          }
          return n ? Math.round(sum / n) : null;
        },
        // ---- runtime / charge-time estimate -------------------------------
        // Spec: docs/design/2026-07-28-battery-runtime-estimate-design.md
        //
        // ⚠️ SoC-slope based, and it has to be: the box exposes NO charge_full /
        // charge_now / energy_* node, so the pack's capacity in mAh does not
        // exist anywhere on the device. "remaining mAh / current mA" is not
        // available without inventing a nameplate figure.
        // Spot current is useless anyway — measured live it swings −449…−985 mA.
        // Which way the battery is going, collapsed from chargeState().
        estDirection: function(s) {
          var st = this.chargeState(s);
          if (st === "discharging" || st === "draining") return "down";
          if (st === "charging") return "up";
          if (st === "blocked") return "hold";
          if (st === "full") return "full";
          return "none";
        },
        // Pure. `ss` is the ALREADY-COMPUTED sample window (see the C1 regression
        // in the 2026-07-27 final review — a helper that recomputes the window
        // internally is what made the chart quadratic). Returns:
        //   { kind, minutes, targetPct, spanMin, deltaPct }
        // `minutes` is null whenever we cannot honestly produce a figure.
        runEstimate: function(ss, bl) {
          var none = { kind: "none", minutes: null, targetPct: null, spanMin: 0, deltaPct: 0 };
          if (!ss || !ss.length) return none;
          var last = ss[ss.length - 1];
          var dir = this.estDirection(last);
          if (dir === "hold" || dir === "full" || dir === "none")
            return { kind: dir, minutes: null, targetPct: null, spanMin: 0, deltaPct: 0 };
          var seg = [], edge = last.t - EST_WINDOW_MS;
          for (var i = ss.length - 1; i >= 0; i--) {
            if (ss[i].t < edge) break;
            if (this.estDirection(ss[i]) !== dir) break;
            if (ss[i].capGui == null) break;
            seg.push(ss[i]);
          }
          seg.reverse();
          var spanMin = seg.length > 1 ? (seg[seg.length - 1].t - seg[0].t) / 6e4 : 0;
          var deltaPct = seg.length > 1 ? seg[seg.length - 1].capGui - seg[0].capGui : 0;
          var out = {
            kind: dir,
            minutes: null,
            targetPct: null,
            spanMin,
            deltaPct
          };
          out.targetPct = dir === "down" ? 0 : bl && bl.enabled && typeof bl.limit_gui === "number" ? bl.limit_gui : 100;
          if (spanMin < EST_MIN_SPAN_MIN) return out;
          if (Math.abs(deltaPct) < EST_MIN_DELTA_PCT) return out;
          var n = seg.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
          for (var j = 0; j < n; j++) {
            var x = seg[j].t - seg[0].t, y = seg[j].capGui;
            sx += x;
            sy += y;
            sxx += x * x;
            sxy += x * y;
          }
          var denom = n * sxx - sx * sx;
          if (!denom) return out;
          var slope = (n * sxy - sx * sy) / denom;
          if (!slope) return out;
          if (dir === "down" && slope >= 0) return out;
          if (dir === "up" && slope <= 0) return out;
          var mins = (out.targetPct - last.capGui) / slope / 6e4;
          if (!(mins > 0) || !isFinite(mins)) return out;
          out.minutes = mins;
          return out;
        },
        // Approximations get approximate formatting — false precision on an
        // extrapolation is its own kind of lie.
        fmtEstimate: function(mins) {
          if (mins == null || !isFinite(mins)) return "—";
          if (mins > EST_MAX_MIN) return t("> 2 d");
          var m = Math.round(mins / 5) * 5;
          if (m < 60) return t("~{m} m", { m });
          var hh = Math.floor(m / 60), mm = m % 60;
          return mm ? t("~{h} h {m} m", { h: hh, m: mm }) : t("~{h} h", { h: hh });
        },
        chargeState: function(s) {
          if (!s.online) return "discharging";
          if (s.cur == null) return "unknown";
          if (s.cur > 0) return "charging";
          if (s.cur < 0) return "draining";
          if (this.limiterHeld(s)) return "blocked";
          if (s.lim == null) return "idle";
          var status = (s.status == null ? "" : String(s.status)).trim().toLowerCase();
          if (status === "full") return "full";
          return "idle";
        },
        // Same gap discipline as segments(): a hole bigger than GAP_MS ends the
        // current run rather than extending across it, even when the state on
        // both sides matches — otherwise a multi-hour outage between two
        // "charging" samples paints one solid "charging" band through data we
        // don't have.
        stateRunsFrom: function(ss) {
          var runs = [], self = this;
          for (var i = 0; i < ss.length; i++) {
            var v = self.chargeState(ss[i]), last = runs[runs.length - 1];
            var gap = i > 0 && ss[i].t - ss[i - 1].t > GAP_MS;
            if (last && !gap && last.v === v) {
              last.m1 = ss[i].m;
            } else {
              if (last) last.m1 = gap ? ss[i - 1].m : ss[i].m;
              runs.push({ v, m0: ss[i].m, m1: ss[i].m });
            }
          }
          if (runs.length) {
            var lastS = ss[ss.length - 1];
            runs[runs.length - 1].m1 = this.nowMs() - lastS.t > GAP_MS ? lastS.m : 0;
          }
          return runs;
        },
        stateRuns: function() {
          return this.stateRunsFrom(this.winSamples());
        },
        // Binary search by sample `t`. Cursor `m` is minutes relative to nowMs
        // (negative past → 0 now), same contract as before so existing tests and
        // the pin path keep working.
        nearestSampleIn: function(ss, m) {
          if (!ss || !ss.length) return null;
          var target = this.nowMs() + m * 6e4;
          var lo = 0, hi = ss.length;
          while (lo < hi) {
            var mid = lo + hi >> 1;
            if (ss[mid].t < target) lo = mid + 1;
            else hi = mid;
          }
          var best = null, bestD = Infinity;
          for (var i = Math.max(0, lo - 1); i <= Math.min(ss.length - 1, lo); i++) {
            var d = Math.abs(ss[i].t - target);
            if (d < bestD) {
              best = ss[i];
              bestD = d;
            }
          }
          return best;
        },
        nearestSample: function(m) {
          return this.nearestSampleIn(this.winSamples(), m);
        },
        clock: function(t2) {
          return hhmm(t2);
        },
        clockFull: function(t2) {
          var d = new Date(t2), p = function(n) {
            return (n < 10 ? "0" : "") + n;
          };
          return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
        },
        // ---- interaction ----
        // bounds comes from the last render (_lastBounds) so mousemove does not
        // recompute winSamples on every pixel.
        mFromEvent: function(e, bounds) {
          var el = this.$refs && this.$refs.lanes;
          if (!el) return null;
          var r = el.getBoundingClientRect();
          if (!r.width) return null;
          var ux = (e.clientX - r.left) * this.width / r.width;
          var plotW = this.width - PADL - PADR;
          var span = bounds ? this.spanMin(bounds) : this.winW;
          return -span + (ux - PADL) / plotW * span;
        },
        clampM: function(m, bounds) {
          var span = bounds ? this.spanMin(bounds) : this.winW;
          return Math.max(-span, Math.min(0, m));
        },
        onMove: function(e) {
          if (this.pinnedT != null) return;
          var bounds = this._lastBounds;
          var m = this.mFromEvent(e, bounds);
          if (m == null) return;
          this.cursor = this.clampM(m, bounds);
        },
        onLeave: function() {
          if (this.pinnedT == null) this.cursor = null;
        },
        onClick: function(e) {
          if (this.pinnedT != null) {
            this.pinnedT = null;
            this.cursor = null;
            return;
          }
          var bounds = this._lastBounds;
          var m = this.mFromEvent(e, bounds);
          if (m == null) return;
          m = this.clampM(m, bounds);
          var s = this.nearestSampleIn(this._lastSs || this.winSamples(), m);
          this.pinnedT = s ? s.t : this.nowMs() + m * 6e4;
          this.cursor = this.mOf(this.pinnedT);
        },
        // The pinned sample in window `ss` (exact box time), or null once it
        // has scrolled out of the window.
        pinnedSampleIn: function(ss) {
          if (this.pinnedT == null || !ss) return null;
          for (var i = ss.length - 1; i >= 0; i--) if (ss[i].t === this.pinnedT) return ss[i];
          return null;
        },
        injectStyle: function() {
          if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
          var css = [
            ".mmb{display:flex;flex-direction:column;gap:12px}",
            ".mmb-card{background:var(--background-card);border-radius:8px;padding:12px 14px}",
            ".mmb-h{font-weight:600;margin-bottom:8px;color:var(--text-title)}",
            ".mmb-row{display:flex;flex-wrap:wrap;gap:16px;align-items:baseline}",
            ".mmb-stat{display:flex;flex-direction:column;min-width:84px}",
            ".mmb-stat b{font-size:18px;font-weight:600;color:var(--text-title);line-height:1.25}",
            ".mmb-stat span{font-size:11px;color:var(--text-badge)}",
            ".mmb-seg{display:inline-flex;gap:2px}",
            ".mmb-seg button{border:0;background:var(--background-content);color:var(--text-badge);",
            "padding:3px 10px;font-size:12px;border-radius:4px;cursor:pointer}",
            ".mmb-seg button.on{background:var(--primary);color:#fff}",
            // Chart: HTML lane headers (value + Range) sit above the shared SVG so
            // bold/small render as real text, not as SVG presentation attributes
            // that some WebKits drop when fill=var(--token).
            ".mmb-chart{display:flex;flex-direction:column;gap:10px;width:100%}",
            ".mmb-lane-row{display:flex;flex-direction:column;gap:2px;width:100%}",
            // Single line, left-aligned: name · bold current · Range a–b
            ".mmb-lane-head{display:flex;flex-direction:row;flex-wrap:wrap;",
            "align-items:baseline;gap:8px;padding:0 0 4px;line-height:1.3}",
            ".mmb-lane-name{font-size:12px;color:var(--text-badge)}",
            ".mmb-lane-head b{font-size:14px;font-weight:700;color:var(--text-title);",
            "font-variant-numeric:tabular-nums}",
            ".mmb-lane-head small{font-size:12px;font-weight:400;color:var(--text-hint);",
            "font-variant-numeric:tabular-nums}",
            ".mmb-lanes{width:100%;display:block;cursor:crosshair;overflow:visible}",
            ".mmb-lanes-foot{margin-top:2px}",
            ".mmb-note{font-size:12px;color:var(--text-badge);margin-top:6px}",
            ".mmb-kv{display:flex;align-items:center;gap:10px;margin:6px 0}",
            ".mmb-k{font-size:13px;color:var(--text-badge);min-width:92px}",
            ".mmb-v{font-size:13px;color:var(--text-title)}",
            // accent-color keeps the thumb/track on the GL palette without a hex
            // literal; engines without it fall back to the default control colour.
            ".mmb-v input[type=range]{width:180px;vertical-align:middle;accent-color:var(--primary)}",
            ".mmb-err{font-size:12px;color:var(--error);margin-top:6px}",
            // Attribution: deliberately the quietest text on the card.
            ".mmb-credit{font-size:11px;color:var(--text-hint);margin-top:10px}",
            // Headline estimate: the largest thing on the card, with its own
            // provenance kept deliberately quiet beside it.
            ".mmb-est{display:flex;align-items:baseline;gap:10px;margin-bottom:10px;flex-wrap:wrap}",
            ".mmb-est b{font-size:22px;font-weight:600;color:var(--text-title);line-height:1.2}",
            ".mmb-prov{font-size:11px;color:var(--text-hint)}"
          ].join("");
          var el = document.createElement("style");
          el.id = this.styleId;
          el.textContent = css;
          document.head.appendChild(el);
        },
        // ---- render helpers ----
        // `ss` is the window computed once by render(); the fallback keeps this
        // callable on its own (tests).
        // The headline figure, above the tiles. Formatting only — every decision
        // about whether a number is defensible lives in runEstimate.
        renderEstimate: function(h, ss) {
          ss = ss || this.winSamples();
          var r = this.runEstimate(ss, this.bl);
          var bl = this.bl || {};
          var head;
          if (r.minutes != null && r.kind === "down") {
            head = t("{time} remaining", { time: this.fmtEstimate(r.minutes) });
          } else if (r.minutes != null && r.kind === "up") {
            head = t("{time} to {pct} %", { time: this.fmtEstimate(r.minutes), pct: r.targetPct });
          } else if (r.kind === "hold") {
            head = typeof bl.limit_gui === "number" ? t("Holding at {pct} %", { pct: bl.limit_gui }) : t("Holding at the limit");
          } else if (r.kind === "full") {
            head = "Full";
          } else {
            head = "Estimating…";
          }
          var kids = [h("b", head)];
          if (r.spanMin >= 1) {
            kids.push(h(
              "span",
              { staticClass: "mmb-prov" },
              t("from the last {n} min", { n: Math.round(r.spanMin) })
            ));
          }
          return h("div", { staticClass: "mmb-est" }, kids);
        },
        renderStatusRow: function(h, ss) {
          ss = ss || this.winSamples();
          var s = ss.length ? ss[ss.length - 1] : null;
          var bl = this.bl || {};
          var fmt = function(v, dec, unit) {
            return v == null ? "—" : (dec ? Number(v).toFixed(dec) : String(v)) + unit;
          };
          var stats = [];
          var push = function(label, value) {
            stats.push(h(
              "div",
              { staticClass: "mmb-stat" },
              [h("b", value), h("span", label)]
            ));
          };
          push("GL UI Reported Charge", s ? fmt(s.capGui, 1, " %") : "—");
          push("IC Reported Charge", s ? fmt(s.cap, 0, " %") : "—");
          push("Current", s ? fmt(s.cur, 0, " mA") : "—");
          push("Current 60 s avg", fmt(this.avgCurrent(ss, AVG_WINDOW_MS), 0, " mA"));
          push("Voltage", s ? fmt(s.voltV, 2, " V") : "—");
          push("Temp", s ? fmt(s.temp, 1, " °C") : "—");
          push("State", s ? STATE_LABEL[this.chargeState(s)] : "—");
          push("Limit", bl.available === false ? "n/a" : bl.enabled ? t("{pct} % GL UI", { pct: bl.limit_gui }) : t("Off"));
          return h("div", { staticClass: "mmb-card" }, [
            this.renderEstimate(h, ss),
            h("div", { staticClass: "mmb-row" }, stats)
          ]);
        },
        // Format a focus reading for a lane header: "−360 mA", "80 %", …
        // Leading space before the unit so the bold figure doesn't run into it.
        fmtLaneValue: function(L, sample) {
          if (!sample) return "—";
          var fv = sample[L.key];
          if (fv == null || !isFinite(Number(fv))) return "—";
          return Number(fv).toFixed(L.dec) + " " + L.unit;
        },
        // HTML lane header — one left-aligned line:
        //   Metric name   <bold current>   Range a–b unit
        // Real HTML <b>/<small> so weight and colour are not fighting SVG
        // presentation-attribute rules.
        renderLaneHead: function(h, L, focus, ss) {
          var valueStr = this.fmtLaneValue(L, focus);
          var rangeStr = t("Range {r}", { r: this.observedRange(ss, L.key, L.dec) + " " + L.unit });
          return h("div", { staticClass: "mmb-lane-head" }, [
            h("span", { staticClass: "mmb-lane-name" }, L.label),
            h("b", valueStr),
            h("small", rangeStr)
          ]);
        },
        // `ss` is the sample window, computed ONCE by render() and threaded
        // through everything below. Nothing in here may call winSamples(),
        // segments(), domainFor() or stateRuns() — their zero-argument forms
        // recompute the whole window, and doing that per lane (or worse, per
        // plotted point) is what made 6 h/24 h renders take seconds.
        //
        // Layout (jayck88): each lane is HTML head (name + bold value + Range)
        // immediately above its own plot strip. Cursor state is shared so a
        // hover on any strip updates every head and every crosshair together.
        renderLanes: function(h, ss) {
          var self = this, W = this.width;
          ss = ss || this.winSamples();
          var bounds = this.chartBounds(ss);
          this._lastBounds = bounds;
          this._lastSs = ss;
          var spanM = this.spanMin(bounds);
          var partial = spanM < this.winW - 1;
          var cols = Math.max(40, Math.round((W - PADL - PADR) / 2));
          var near, focusM;
          if (this.pinnedT != null) {
            near = this.pinnedSampleIn(ss);
            focusM = near ? near.m : null;
          } else {
            focusM = this.cursor;
            near = focusM != null ? this.nearestSampleIn(ss, focusM) : null;
          }
          var focus = near || (ss.length ? ss[ss.length - 1] : null);
          var rows = [];
          var measureRefSet = false;
          LANES.forEach(function(L) {
            var d = self.domainFrom(ss, L), d0 = d[0], d1 = d[1];
            var H = L.h;
            var strip = [];
            var plotW = W - PADL - PADR;
            strip.push(h("rect", { attrs: {
              x: PADL,
              y: 0.5,
              width: Math.max(1, plotW),
              height: Math.max(1, H - 1),
              fill: "var(--background-content)",
              stroke: "#999999",
              "stroke-width": 1.5,
              rx: 2
            } }));
            [[d1, 10], [d0, H - 3]].forEach(function(p) {
              strip.push(h(
                "text",
                { attrs: {
                  x: W - PADR + 5,
                  y: p[1],
                  "font-size": FS_SCALE,
                  "text-anchor": "start",
                  fill: "var(--text-hint)"
                } },
                Number(p[0]).toFixed(L.dec)
              ));
            });
            if (L.zero && d0 < 0 && d1 > 0) {
              var yz = self.yIn(L, 0, 0, d);
              strip.push(h("line", { attrs: {
                x1: PADL,
                x2: W - PADR,
                y1: yz,
                y2: yz,
                stroke: "var(--divider)",
                "stroke-width": 1,
                "stroke-dasharray": "2 3"
              } }));
            }
            if (L.key === "capGui" && self.bl && self.bl.enabled && typeof self.bl.limit_gui === "number") {
              var yt = self.yIn(L, 0, self.bl.limit_gui, d);
              strip.push(h("line", { attrs: {
                class: "mmb-target",
                x1: PADL,
                x2: W - PADR,
                y1: yt,
                y2: yt,
                stroke: "var(--warning)",
                "stroke-width": 1.25,
                "stroke-dasharray": "5 3"
              } }));
              strip.push(h(
                "text",
                { attrs: {
                  x: W - PADR,
                  y: Math.max(10, yt - 3),
                  "font-size": FS_TICK,
                  "text-anchor": "end",
                  fill: "var(--warning)"
                } },
                t("target {pct}%", { pct: self.bl.limit_gui })
              ));
            }
            self.segmentsFrom(ss, L.key).forEach(function(seg) {
              var pts = self.reduce(seg, cols), dstr = "";
              pts.forEach(function(p, i) {
                dstr += (i ? "L" : "M") + self.xOfT(p.t, bounds).toFixed(1) + " " + self.yIn(L, 0, p.v, d).toFixed(1) + " ";
              });
              if (dstr) strip.push(h("path", { attrs: {
                fill: "none",
                stroke: L.color,
                "stroke-width": 1.75,
                "stroke-linejoin": "round",
                "stroke-linecap": "round",
                d: dstr.trim()
              } }));
            });
            if (focusM != null) {
              var cx = self.xOf(focusM, bounds);
              strip.push(h("line", { attrs: {
                x1: cx,
                x2: cx,
                y1: 0,
                y2: H,
                stroke: "var(--text-hint)",
                "stroke-width": 1
              } }));
              if (near && near[L.key] != null && isFinite(Number(near[L.key]))) {
                strip.push(h("circle", { attrs: {
                  cx: self.xOfT(near.t, bounds).toFixed(1),
                  cy: self.yIn(L, 0, near[L.key], d).toFixed(1),
                  r: 3.5,
                  fill: L.color,
                  stroke: "var(--background-card)",
                  "stroke-width": 1.5
                } }));
              }
            }
            var svgAttrs = {
              viewBox: "0 0 " + W + " " + H,
              height: H,
              preserveAspectRatio: "none"
            };
            var svgData = {
              staticClass: "mmb-lanes",
              attrs: svgAttrs,
              on: { mousemove: self.onMove, mouseleave: self.onLeave, click: self.onClick }
            };
            if (!measureRefSet) {
              svgData.ref = "lanes";
              measureRefSet = true;
            }
            rows.push(h("div", { staticClass: "mmb-lane-row", key: L.key }, [
              self.renderLaneHead(h, L, focus, ss),
              h("svg", svgData, strip)
            ]));
          });
          var foot = [];
          var bandY = 4;
          var runs = this.stateRunsFrom(ss);
          runs.forEach(function(r) {
            var x0 = self.xOf(r.m0, bounds), x1 = self.xOf(r.m1, bounds);
            foot.push(h("rect", { attrs: {
              x: x0,
              y: bandY,
              width: Math.max(1, x1 - x0),
              height: BAND_H,
              fill: STATE_COLOR[r.v],
              "fill-opacity": 0.55
            } }));
          });
          var axisY = bandY + BAND_H + 13;
          var step = spanM <= 15 ? 2 : spanM <= 60 ? 10 : spanM <= 360 ? 60 : 240;
          var ticks = [];
          for (var m = -spanM; m < -1e-3; m += step) ticks.push(m);
          ticks.push(0);
          for (var ti = 0; ti < ticks.length; ti++) {
            var tm = ticks[ti];
            var tx = this.xOf(tm, bounds);
            var label;
            if (tm === 0) label = "now";
            else if (Math.abs(tm + spanM) < 0.01 && partial) {
              label = spanM >= 60 ? "~" + Math.max(1, Math.round(spanM / 60)) + " h" : "~" + Math.max(1, Math.round(spanM)) + " m";
            } else {
              label = Math.round(tm * 10) / 10 + " m";
            }
            foot.push(h("text", { attrs: {
              x: tx,
              y: axisY,
              "font-size": FS_AXIS,
              "text-anchor": "middle",
              fill: "var(--text-hint)"
            } }, label));
          }
          if (focusM != null && near) {
            var bits = [
              this.fmtAgo(near.t),
              this.clockFull(near.t),
              (near.capGui == null ? "—" : near.capGui.toFixed(1) + "%") + (near.cap == null ? "" : " (IC " + near.cap + "%)"),
              near.cur == null ? "—" : near.cur + " mA",
              near.voltV == null ? "—" : near.voltV.toFixed(2) + " V",
              near.temp == null ? "—" : near.temp.toFixed(1) + " °C",
              STATE_LABEL[this.chargeState(near)]
            ];
            foot.push(h("text", { attrs: {
              x: PADL,
              y: axisY + 16,
              "font-size": FS_READOUT,
              fill: "var(--text-title)"
            } }, bits.join("  ·  ")));
          }
          var footH = axisY + 24;
          rows.push(h("svg", {
            staticClass: "mmb-lanes mmb-lanes-foot",
            attrs: {
              viewBox: "0 0 " + W + " " + footH,
              height: footH,
              preserveAspectRatio: "none"
            },
            on: { mousemove: this.onMove, mouseleave: this.onLeave, click: this.onClick }
          }, foot));
          return h("div", { staticClass: "mmb-chart" }, rows);
        },
        renderLimitCard: function(h) {
          var self = this, bl = this.bl, kids = [h("div", { staticClass: "mmb-h" }, "Battery charge limit")];
          if (!bl) {
            kids.push(h("div", { staticClass: "mmb-note" }, this.blErr || "Loading…"));
          } else if (bl.available === false) {
            kids.push(h("div", { staticClass: "mmb-note" }, "Charge limit not available on this device."));
            if (this.blErr) kids.push(h("div", { staticClass: "mmb-err" }, this.blErr));
          } else {
            kids.push(h("div", { staticClass: "mmb-kv" }, [
              h("label", { staticClass: "mmb-k" }, [
                h("input", {
                  attrs: { type: "checkbox", disabled: !!self.blBusy },
                  domProps: { checked: !!bl.enabled },
                  on: { change: function(e) {
                    var el = e && e.target;
                    var p = self.applyBattLimit({ enabled: !!(el && el.checked) });
                    Promise.resolve(p).then(function() {
                      if (el) el.checked = !!(self.bl && self.bl.enabled);
                    });
                  } }
                }),
                " Limit charging"
              ])
            ]));
            kids.push(h("div", { staticClass: "mmb-kv" }, [
              h("span", { staticClass: "mmb-k" }, "Target"),
              h("span", { staticClass: "mmb-v" }, [
                // A SLIDER, floored at LIMIT_MIN: the backend refuses anything
                // below it (gauge < 50), so the old number input's 20–49 range
                // was values it would accept and then reject. Unreachable beats
                // validated-against.
                h("input", {
                  attrs: {
                    type: "range",
                    min: LIMIT_MIN,
                    max: LIMIT_MAX,
                    step: 1,
                    disabled: !bl.enabled || !!self.blBusy
                  },
                  domProps: { value: self.blDraft },
                  on: {
                    // `input` fires per drag-pixel: update the label only. Each
                    // save spawns a process on the router, so committing here
                    // would hammer it. `change` fires once, on release.
                    input: function(e) {
                      self.blDraft = Number(e.target && e.target.value);
                    },
                    change: function() {
                      self.applyBattLimit({ limit_gui: self.blDraft });
                    }
                  }
                }),
                " " + t("{pct} % GL UI Reported Charge", { pct: self.blDraft }),
                // Tracks the DRAFT, not bl.limit_gauge — the latter is the SAVED
                // value and would lag the thumb during a drag.
                h(
                  "span",
                  { staticClass: "mmb-note" },
                  "  (" + t("≈ {pct} % IC Reported Charge", { pct: self.gaugeOf(self.blDraft) }) + ")"
                )
              ])
            ]));
            var last = this.samples && this.samples.length ? this.samples[this.samples.length - 1] : null;
            var sampleFresh = !!(last && last.t && Math.abs(this.nowMs() - last.t) <= 3e4);
            var chargeStopped = !!(bl.active && sampleFresh && last.online && last.cur != null && Math.abs(Number(last.cur)) <= 10);
            var targetGui = typeof bl.limit_gui === "number" ? bl.limit_gui + "%" : "—";
            var currentGui = typeof bl.capacity_gui === "number" ? "~" + bl.capacity_gui + "%" : "—";
            var statusLine;
            if (bl.active) {
              statusLine = t("Active · target {target} GL UI · current {cur}", { target: targetGui, cur: currentGui });
              if (chargeStopped) statusLine += " · " + t("Charging stopped");
            } else if (bl.enabled && !bl.charger_online) {
              statusLine = t("Armed · target {target} · will apply when the charger connects · current {cur}", { target: targetGui, cur: currentGui });
            } else if (bl.enabled && bl.charger_online) {
              statusLine = t("Enabled · not active · target {target} · current {cur}", { target: targetGui, cur: currentGui });
            } else {
              statusLine = t("Off · current {cur}", { cur: currentGui });
            }
            kids.push(h("div", { staticClass: "mmb-kv" }, [
              h("span", { staticClass: "mmb-k" }, "Status"),
              h("span", { staticClass: "mmb-v" }, statusLine)
            ]));
            if (bl.active_gauge != null || bl.capacity_gauge != null) {
              kids.push(h(
                "div",
                { staticClass: "mmb-note" },
                t("Low-level: target {target}, current {cur}", {
                  target: bl.limit_gauge != null ? bl.limit_gauge + "% IC" : "—",
                  cur: bl.capacity_gauge != null ? bl.capacity_gauge + "% IC" : "—"
                })
              ));
            }
            if (this.blErr) kids.push(h("div", { staticClass: "mmb-err" }, this.blErr));
          }
          kids.push(h(
            "div",
            { staticClass: "mmb-credit" },
            "Based on ChiliApple's battery control scripts"
          ));
          return h("div", { staticClass: "mmb-card" }, kids);
        }
      },
      render: function(h) {
        var self = this;
        this.tick;
        var kids = [];
        var ss = this.winSamples();
        if (!this.embedded) kids.push(h("div", { staticClass: "mmb-h" }, "Battery"));
        kids.push(this.renderStatusRow(h, ss));
        var chartKids = [
          h("div", { staticClass: "mmb-row" }, [
            h("div", { staticClass: "mmb-h" }, "History"),
            h("span", { staticClass: "mmb-seg" }, RANGES.map(function(r) {
              return h("button", {
                key: r[0],
                staticClass: self.winW === r[0] ? "on" : "",
                on: { click: function() {
                  self.setRange(r[0]);
                } }
              }, r[1]);
            }))
          ])
        ];
        var every = Math.round((this.retryMs || RETRY_BASE_MS) / 1e3);
        var failing = this.loadFails > 0;
        if (this.loading) {
          chartKids.push(h("div", { staticClass: "mmb-note" }, "Loading battery history…"));
        } else if (!ss.length) {
          chartKids.push(h(
            "div",
            { staticClass: "mmb-note" },
            failing && !this.preloaded ? t("Couldn't reach the router — retrying every {s} s.", { s: every }) : "No battery history yet — sampling starts within 20 s."
          ));
          if (this.err) chartKids.push(h("div", { staticClass: "mmb-err" }, this.err));
        } else {
          chartKids.push(this.renderLanes(h, ss));
          if (failing)
            chartKids.push(h("div", { staticClass: "mmb-note" }, t(this.preloaded ? "Couldn't load the wider range yet; retrying every {s} s." : "Earlier battery history didn't load — showing samples since the tab opened; retrying every {s} s.", { s: every })));
          if (this.err) chartKids.push(h("div", { staticClass: "mmb-err" }, this.err));
        }
        kids.push(h("div", { staticClass: "mmb-card" }, chartKids));
        kids.push(this.renderLimitCard(h));
        return h("div", { staticClass: "mmb" }, kids);
      }
    };
    component.LANES = LANES;
    component.RANGES = RANGES;
    component.TICKSTEP = TICKSTEP;
    component.GAP_MS = GAP_MS;
    component.PLOT_INSET = PLOT_INSET;
    component.FAIL_NOTE_AFTER = FAIL_NOTE_AFTER;
    component.STATE_LABEL = STATE_LABEL;
    return component;
  }());
  return __toCommonJS(battery_exports);
})();
return __mm.default;
})();

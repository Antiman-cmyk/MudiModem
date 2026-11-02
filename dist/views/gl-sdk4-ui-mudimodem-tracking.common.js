/* MudiModem — built from src/web/tabs/tracking.js by tools/build-web.mjs. Do not edit: run npm run build:web. */
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

  // src/web/tabs/tracking.js
  var tracking_exports = {};
  __export(tracking_exports, {
    default: () => tracking_default
  });

  // src/web/kit/rpc.js
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

  // src/web/kit/fmt.js
  function p2(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function hhmm(t2) {
    var d = new Date(t2);
    return p2(d.getHours()) + ":" + p2(d.getMinutes());
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
    "5G SA exposes no neighbour list - only the serving cell is visible without a scan, and a scan takes the modem offline for up to ~10 minutes.": "5G SA 不提供邻区列表 - 不扫描只能看到当前服务小区，而扫描会让 Modem 离线最长约 10 分钟。",
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
    "Auto": "自动",
    "Auto or 4G only": "自动或仅 4G",
    "Auto or 5G only": "自动或仅 5G",
    "Auto-revert FAILED": "自动恢复失败",
    "Auto-revert fired": "已自动恢复",
    "Auto-reverts in 60s unless kept.": "60 秒内不保留则自动恢复。",
    "Automatic background tests": "后台自动测速",
    "BAND": "频段",
    "BW": "带宽",
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
    "MudiModem (version unknown)": "MudiModem（版本未知）",
    "Nearby cells": "附近基站",
    "Network": "网络",
    "Network mode": "网络模式",
    "Network mode — open Bands": "网络模式 — 打开频段页",
    "No band changes, handovers or failovers recorded yet.": "还没有记录到频段修改、基站切换或 SIM 卡切换。",
    "No battery history yet — sampling starts within 20 s.": "还没有电池历史 — 20 秒内开始采样。",
    "No changes": "没有修改",
    "No matches.": "没有匹配项。",
    "No results yet for this interface. Run a speed test above.": "这个接口还没有结果。请在上方开始测速。",
    "No samples yet. The collector runs on the router and gathers continuously — check back in a minute, or confirm the mudimodem-collectd service is running.": "还没有采样。采集器在路由器上持续运行 — 请稍后再看，或确认 mudimodem-collectd 服务正在运行。",
    "None": "全不选",
    "Not charging": "未充电",
    "Off": "关闭",
    "Off under {mode} - 5G selections are not sent (GL clears them under 4G-only). Set the mode to {need} to use them.": "在“{mode}”模式下不生效 - 5G 的选择不会下发（仅 4G 时 GL 会清空它们）。要使用请把模式设为“{need}”。",
    "Off under {mode} - these won't apply. Set the mode to {need} to use them.": "在“{mode}”模式下不生效 - 这些选择不会应用。要使用请把模式设为“{need}”。",
    "Off · current {cur}": "关闭 · 当前 {cur}",
    "On battery": "电池供电",
    "PAUSED": "已暂停",
    "Pin the modem to the cell it is using now - the safest lock target.": "把 Modem 固定在当前使用的基站上 - 最安全的锁定目标。",
    "RPC helper unavailable": "RPC 不可用",
    "RPC unavailable": "RPC 不可用",
    "RSRP · dBm": "RSRP · dBm",
    "RSRP · last sample {age} ago": "RSRP · 最后一次采样在 {age} 前",
    "RSRP · last {n} min": "RSRP · 最近 {n} 分钟",
    "RSRQ · dB": "RSRQ · dB",
    "Range {r}": "范围 {r}",
    "Raw AT": "AT 命令",
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
    "nv": "nv",
    "one clock, all three metrics — hover for a slice, click to pin": "同一时间轴上的三个指标 — 悬停查看某一时刻，点击固定",
    "permitted, not active": "允许但未生效",
    "permitted, not selected": "允许但未选择",
    "pinned": "已固定",
    "read": "只读",
    "read before locking": "锁定前请先阅读",
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
    "scan failed": "扫描失败",
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

  // src/web/tabs/tracking.js
  var tracking_default = localize(function() {
    "use strict";
    var LINES = [
      { key: "rsrp", label: "RSRP · dBm", dom: [-120, -80], color: "var(--primary)", lvl: "rsrp_level" },
      { key: "sinr", label: "SINR · dB", dom: [-10, 30], color: "var(--success)", lvl: "sinr_level" },
      { key: "rsrq", label: "RSRQ · dB", dom: [-20, -3], color: "var(--error)", lvl: "rsrq_level" }
    ];
    var BUSES = [{ key: "band", label: "BAND" }, { key: "id", label: "CELL" }, { key: "sim", label: "SIM" }];
    var FREQ_N = {
      2: 1900,
      5: 850,
      7: 2600,
      12: 700,
      13: 750,
      14: 700,
      25: 1900,
      26: 850,
      29: 700,
      30: 2300,
      38: 2600,
      41: 2500,
      48: 3500,
      66: 1700,
      70: 1700,
      71: 600,
      77: 3700,
      78: 3500,
      79: 4700
    };
    var RANGES = [[15, "15 m"], [60, "1 h"], [360, "6 h"], [1440, "24 h"]];
    var TICKSTEP = { 15: 2, 60: 10, 360: 60, 1440: 240 };
    var USER_PRE_MS = 5e3, USER_POST_MS = 4e4;
    var NO_RADIO_EVENT = { Kept: 1 };
    var STALL_MS = 45e3;
    var HOLE_MS = 25e3;
    var GAP_MS = 45e3;
    var RETRY_BASE_MS = 2e3, RETRY_MAX_MS = 3e4;
    var PADL = 42, PADR = 36, BUS_H = 20, PLOT_H = 230;
    var Y_INTERVALS = 4;
    var component = {
      name: "mudimodem-tracking",
      // `embedded` is set when the main Modem page renders us inside its own
      // "Tracking" tab (vs. the standalone /mudimodem-tracking route). When
      // embedded we drop the "← Modem" breadcrumb — the tab bar is right above us.
      props: { embedded: { type: Boolean, default: false } },
      data: function() {
        return {
          winW: 15,
          pinnedT: null,
          hashPinM: null,
          tick: 0,
          live: true,
          frozenAt: null,
          width: 900,
          styleId: "mmt-css",
          cursor: null,
          poll: null,
          pushSeenAt: 0,
          samples: [],
          events: [],
          lastT: 0,
          serverNow: 0,
          serverNowAt: 0,
          loading: true,
          err: "",
          fetching: false,
          // how far back we've fetched (epoch ms, BOX clock); null = nothing yet.
          // A larger range only refetches when it reaches earlier than this.
          // pendingWindow holds a range request (in minutes) that arrived while a
          // fetch was in flight.
          loadedFrom: null,
          pendingWindow: null,
          // preloaded: a WINDOW load has succeeded at least once. Pushes alone
          // never set it — they only carry what happened after the page opened.
          // loadFails/retryMs drive the backoff and the honest message.
          // missingSince: the start of a tail (hole backfill) that failed or
          // was dropped mid-flight; the next push asks for it again.
          preloaded: false,
          loadFails: 0,
          retryMs: 0,
          missingSince: null
        };
      },
      computed: {
        // The collector's pushes (mudimodem.collect / mudimodem.event) land in the
        // SPA's status store; watching them is how this page stays live.
        pushedSample: function() {
          var g = this.$store && this.$store.getters;
          var s = g && g.moduleStatus ? g.moduleStatus("mudimodem.collect") : null;
          return s && s.t ? s : null;
        },
        pushedEvent: function() {
          var g = this.$store && this.$store.getters;
          var e = g && g.moduleStatus ? g.moduleStatus("mudimodem.event") : null;
          return e && e.t ? e : null;
        },
        // handover/failover ticks derived from the sample stream, merged with the
        // server's user/watchdog events, newest last. Depends on `tick` for polling.
        allEvents: function() {
          this.tick;
          var derived = this.deriveNetEventsIncremental(this.samples, this.events);
          return this.events.concat(derived).sort(function(a, b) {
            return a.t - b.t;
          });
        }
      },
      watch: {
        "pushedSample.t": function() {
          this.onPush(this.pushedSample);
        },
        // Deep, on the object: event `t` is whole-second (os.time()*1000 in the
        // backend, date +%s in the watchdog), so two events stamped in the same
        // second share a `t` and a `.t` watcher would never fire for the second
        // one. onEventPush dedupes replays by (t, label) itself.
        "pushedEvent": { deep: true, handler: function(e) {
          this.onEventPush(e);
        } }
      },
      created: function() {
        this.injectStyle();
        this._derived = null;
      },
      mounted: function() {
        var self = this;
        if (typeof window === "undefined") return;
        this.measure();
        this.parseHash();
        this._onResize = function() {
          self.measure();
        };
        window.addEventListener("resize", this._onResize);
        this._alive = true;
        this.fetchHistory();
        this.pushSeenAt = Date.now();
        this.poll = setInterval(function() {
          if (Date.now() - self.pushSeenAt > STALL_MS) self.fetchHistory({ since: self.lastT, merge: true });
        }, 3e4);
      },
      // Keep the viewBox width in sync with the rendered width. At mount the lanes
      // element is usually absent (loading state), so the initial measure() no-ops
      // and this.width stays at its default until data arrives and the SVG renders.
      // Re-measuring here makes the SVG scale ≈ 1 (no stretched text) and keeps the
      // pointer→time mapping exact. measure() only sets when clientWidth is truthy,
      // and Vue skips the reactive write when unchanged, so this converges — no loop.
      updated: function() {
        this.measure();
      },
      beforeDestroy: function() {
        this._alive = false;
        if (this.poll) clearInterval(this.poll);
        if (this._retryTimer) {
          clearTimeout(this._retryTimer);
          this._retryTimer = null;
        }
        if (typeof window !== "undefined" && this._onResize) window.removeEventListener("resize", this._onResize);
      },
      methods: {
        // ---- data ----
        // Post to /rpc via $axios DIRECTLY, not $rpcRequest. $rpcRequest's axios
        // interceptor pops GL's global "Unknown error" banner on any 500 or
        // JSON-RPC error BEFORE our .catch can run — unacceptable for a silent 10s
        // background poll on a flaky cellular link (GL exempts only its own "alive"
        // heartbeat). We handle the envelope ourselves and fail silently: a bad
        // poll just retries next tick. Returns the result object, or null.
        rpcSilent: function(method, params, timeout) {
          return rpcSilent(method, params, timeout || 2e4);
        },
        // opts = { window, since, merge }. Default (no opts) = the initial load:
        // fetch the visible window, replacing. A poll passes { since: lastT,
        // merge: true } to append just the new tail. Backfill (a wider range)
        // passes { window: minutes } to replace with the wider window.
        // Fetching only the shown window keeps first paint small: the full 24h is
        // ~1.4 MB uncompressed, the 1h default ~85 KB.
        //
        // ⚠️ A window is sent to the box as a DURATION (window_ms), never as a
        // browser-computed `Date.now() - winW`. The two clocks can disagree — this
        // is a travel router — and an absolute cutoff mis-sizes the window by
        // exactly that skew: 10 minutes slow asked for 25 minutes of history, 10
        // minutes fast drew a nearly empty graph. (Not a timezone problem: both
        // Date.now() and the box's os.time() are UTC epoch. Absolute skew.) The
        // poll's `since` is exempt — lastT is a timestamp the BOX stamped on a
        // sample, so it needs no clock agreement at either end.
        //
        // Every reply MERGES into what is held (dedupe by t, sort) — including
        // the window preload: pushes may have landed while it was in flight (or
        // while it was failing and being retried), and replacing would drop them.
        //
        // ⚠️ rpcSilent RESOLVES null on every failure and never rejects, so the
        // failure path lives inside .then (a .catch here was dead code once, and
        // with it a failed preload was never retried nor reported).
        fetchHistory: function(opts) {
          opts = opts || {};
          var self = this;
          if (typeof window === "undefined" || !window.$axios) {
            self.loading = false;
            return;
          }
          var incremental = opts.since != null && opts.since > 0;
          if (self.fetching) {
            if (opts.window != null && !opts.merge)
              self.pendingWindow = self.pendingWindow == null ? opts.window : Math.max(self.pendingWindow, opts.window);
            else if (incremental) self.noteMissing(opts.since);
            return;
          }
          self.fetching = true;
          var winMs = (opts.window || self.winW) * 6e4;
          var params = incremental ? { since: Math.floor(opts.since) } : { window_ms: winMs };
          this.rpcSilent("get_history", params).then(function(res) {
            self.fetching = false;
            if (self._alive === false) return;
            if (res) {
              self.mergeHistory(res.samples || [], res.events || []);
              self.serverNow = res.now || Date.now();
              self.serverNowAt = Date.now();
              var cut = self.serverNow - 24 * 3600 * 1e3;
              self.samples = self.samples.filter(function(s) {
                return s.t >= cut;
              });
              self.events = self.events.filter(function(e) {
                return e.t >= cut;
              });
              if (self.samples.length) self.lastT = self.samples[self.samples.length - 1].t;
              var reached = incremental ? opts.since : self.serverNow - winMs;
              self.loadedFrom = self.loadedFrom == null ? reached : Math.min(self.loadedFrom, reached);
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
                if (self.hashPinM != null) {
                  var near = self.nearestByT(self.samples, self.serverNow + self.hashPinM * 6e4);
                  if (near) self.pinnedT = near.t;
                  self.hashPinM = null;
                }
              }
              self.err = "";
              self.tick++;
            } else if (incremental) {
              self.noteMissing(opts.since);
            } else {
              self.loadFails++;
              self.retryMs = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, self.loadFails - 1));
              self.err = "couldn't reach the router";
              self.scheduleRetry();
              self.tick++;
            }
            self.loading = false;
            self.drainPending();
          });
        },
        // Merge a reply into the held samples/events: skip what is already held
        // (a push that landed meanwhile, or the one that revealed a hole) and keep
        // time order — a hole backfill or a late preload is OLDER than the newest
        // pushed sample.
        mergeHistory: function(ns, ne) {
          var haveT = {};
          for (var i = 0; i < this.samples.length; i++) haveT[this.samples[i].t] = 1;
          var add = ns.filter(function(x) {
            return x && x.t && !haveT[x.t];
          });
          if (add.length) {
            this.samples = this.samples.concat(add).sort(function(a, b) {
              return a.t - b.t;
            });
            this._derived = null;
          }
          var haveE = {};
          for (var j = 0; j < this.events.length; j++) haveE[this.events[j].t + "|" + this.events[j].label] = 1;
          var addE = ne.filter(function(e) {
            return e && !haveE[e.t + "|" + e.label];
          });
          if (addE.length) this.events = this.events.concat(addE);
        },
        noteMissing: function(since) {
          this.missingSince = this.missingSince == null ? since : Math.min(this.missingSince, since);
        },
        // One pending retry at a time, only while mounted. It asks for whatever
        // the view needs NOW (the range may have changed since the failure).
        scheduleRetry: function() {
          var self = this;
          if (!this._alive || this._retryTimer) return;
          this._retryTimer = setTimeout(function() {
            self._retryTimer = null;
            if (self._alive) self.fetchHistory({ window: self.neededWindowMin(self.winW) });
          }, this.retryMs || RETRY_BASE_MS);
        },
        drainPending: function() {
          if (this.pendingWindow == null) return;
          var w = this.pendingWindow;
          this.pendingWindow = null;
          this.fetchHistory({ window: w });
        },
        // A live collector sample (mudimodem.collect push): append it exactly as
        // an incremental fetch would have. The box stamped `t`, so it also
        // advances the box-clock reference without a round-trip. While PAUSED it
        // is still collected — only the view is frozen (see viewNow).
        onPush: function(s) {
          if (!s || !s.t || s.t <= this.lastT) return;
          var prevT = this.lastT;
          this.pushSeenAt = Date.now();
          this.samples.push(s);
          this.lastT = s.t;
          this.serverNow = s.t;
          this.serverNowAt = Date.now();
          var cut = s.t - 24 * 3600 * 1e3;
          while (this.samples.length && this.samples[0].t < cut) this.samples.shift();
          this.tick++;
          var from = prevT > 0 && s.t - prevT > HOLE_MS ? prevT : null;
          if (this.missingSince != null) from = from == null ? this.missingSince : Math.min(from, this.missingSince);
          if (from != null) this.fetchHistory({ since: from, merge: true });
        },
        // A user/watchdog event (mudimodem.event push) — Keep, Revert, auto-revert.
        onEventPush: function(e) {
          if (!e || !e.t) return;
          for (var i = this.events.length - 1; i >= 0 && this.events[i].t >= e.t; i--) {
            if (this.events[i].t === e.t && this.events[i].label === e.label) return;
          }
          this.events = this.events.concat([e]);
          this.tick++;
        },
        // Incremental front for deriveNetEvents: a push adds ONE sample, so only
        // that sample needs deriving — re-deriving all 8,640 on every push was the
        // page's one O(n)-per-10 s cost. The cache resumes from the last sample
        // it processed (found by identity from the tail, so head trimming does not
        // invalidate it); a change to the known events resets it, since those
        // suppress derived ticks retroactively (the USER_PRE/POST_MS window).
        deriveNetEventsIncremental: function(samples, known) {
          var c = this._derived;
          if (c && c.known === known && c.knownLen === known.length && c.lastSample && samples.length && samples[samples.length - 1] !== c.lastSample) {
            var i = samples.length - 1;
            while (i >= 0 && samples[i] !== c.lastSample) i--;
            if (i >= 0) {
              var r = this.deriveNetEvents(samples, known, { from: i + 1, last: c.last, out: c.out });
              var cutT = samples[0].t;
              c.out = r.out.filter(function(e) {
                return e.t >= cutT;
              });
              c.last = r.last;
              c.lastSample = samples[samples.length - 1];
              return c.out.slice();
            }
          }
          if (c && c.known === known && c.knownLen === known.length && c.lastSample && samples.length && samples[samples.length - 1] === c.lastSample) return c.out.slice();
          var full = this.deriveNetEvents(samples, known, { withState: true });
          this._derived = {
            known,
            knownLen: known.length,
            out: full.out,
            last: full.last,
            lastSample: samples.length ? samples[samples.length - 1] : null
          };
          return full.out.slice();
        },
        // pure: derive net (handover/failover) events from consecutive samples,
        // suppressing any inside the attribution window of a known user/watchdog
        // event (USER_PRE_MS before .. USER_POST_MS after) so a change WE applied
        // isn't double-counted as a network event.
        // With `state` ({from, last, out} or {withState:true}) it resumes from a
        // prior run and returns {out, last}; without it, the plain event array.
        deriveNetEvents: function(samples, known, state) {
          var self = this;
          var out = state && state.out ? state.out.slice() : [], last = state && state.last || null;
          var start = state && state.from || 0;
          var recentUser = function(t2) {
            for (var i2 = 0; i2 < known.length; i2++) {
              var k = known[i2];
              if (k.kind !== "user" && k.kind !== "dog") continue;
              var post = NO_RADIO_EVENT[k.label] ? USER_PRE_MS : USER_POST_MS;
              if (t2 >= k.t - USER_PRE_MS && t2 <= k.t + post) return true;
            }
            return false;
          };
          var pcc = function(x) {
            return Array.isArray(x.signals) && x.signals[0] || x;
          };
          var ratKey = function(x) {
            var nt = x.network_type;
            if (nt === 41 || nt === "41") nt = 4;
            if (nt != null) return String(nt);
            return String(x.mode || "").replace(/\+$/, "");
          };
          var sig = function(x) {
            if (x.id == null) return null;
            var c = pcc(x);
            return [x.id, ratKey(x), c.band, c.pci, c.earfcn != null ? c.earfcn : x.tx_channel].join(":");
          };
          for (var i = start; i < samples.length; i++) {
            var s = samples[i];
            if (last && !recentUser(s.t)) {
              if (String(s.slot) !== String(last.slot)) {
                out.push({
                  t: s.t,
                  kind: "net",
                  label: "Failover",
                  detail: t("Data now on SIM {slot}", { slot: s.slot }) + (s.carrier ? " · " + s.carrier : "")
                });
                last = s;
                continue;
              } else {
                var a = sig(last), b = sig(s);
                if (a && b && a !== b) {
                  var fmt = function(x) {
                    var c = pcc(x);
                    return c.band != null ? (/NR5G/.test(self.carrierRat(x)) ? " n" : " B") + c.band : "";
                  };
                  out.push({
                    t: s.t,
                    kind: "net",
                    label: "Handover",
                    detail: t("Cell {from} → {to}", { from: last.id, to: s.id }) + fmt(s) + (b.split(":")[0] === a.split(":")[0] ? " " + t("(carrier change)") : "")
                  });
                }
              }
            }
            if (s.id != null) last = s;
            else if (!last) last = s;
          }
          if (state) return { out, last };
          return out;
        },
        measure: function() {
          if (this.$refs && this.$refs.lanes && this.$refs.lanes.clientWidth)
            this.width = this.$refs.lanes.clientWidth;
        },
        // skew-corrected box-now: server clock advanced by browser elapsed time.
        // Before the first fetch, fall back to the local clock (Date is universal).
        nowMs: function() {
          if (this.serverNow) return this.serverNow + (Date.now() - this.serverNowAt);
          return Date.now();
        },
        // The VIEW's now: frozen at the moment PAUSED was pressed, the live box
        // clock otherwise. Everything drawn (window, x-axis, clock labels, slice)
        // is relative to this; collection keeps using the real clock.
        viewNow: function() {
          return this.frozenAt != null ? this.frozenAt : this.nowMs();
        },
        // Minutes a window fetch must ask for so the VIEW's window is covered:
        // while paused the box has moved on past the frozen edge.
        neededWindowMin: function(w) {
          var extra = this.frozenAt != null ? Math.ceil((this.nowMs() - this.frozenAt) / 6e4) : 0;
          return Math.min(1440, w + Math.max(0, extra));
        },
        togglePause: function() {
          if (this.live) {
            this.live = false;
            this.frozenAt = this.nowMs();
          } else {
            this.live = true;
            this.frozenAt = null;
          }
          this.tick++;
        },
        // Samples collected after the freeze, waiting for RESUME. Walks the tail
        // only (the array is ascending).
        heldCount: function() {
          if (this.frozenAt == null) return 0;
          var n = 0;
          for (var i = this.samples.length - 1; i >= 0 && this.samples[i].t > this.frozenAt; i--) n++;
          return n;
        },
        qFromLevel: function(l) {
          return { 1: "poor", 2: "fair", 3: "good", 4: "excellent" }[l] || "none";
        },
        qColor: function(q) {
          return {
            poor: "var(--error)",
            fair: "var(--warning)",
            good: "var(--secondary)",
            excellent: "var(--success)",
            none: "var(--text-hint)"
          }[q];
        },
        clock: function(t2) {
          return hhmm(t2);
        },
        freqOf: function(b) {
          return FREQ_N[b];
        },
        // The PRIMARY carrier's own RAT — "LTE" for an NSA anchor, while `mode`
        // is the cell's (NR5G-NSA). Same rule as the parent's servingRat():
        // pcc_rat (4.10 collector) -> signals[0].rat -> mode (older samples).
        carrierRat: function(s) {
          if (!s) return "";
          var sig = Array.isArray(s.signals) && s.signals[0];
          return s.pcc_rat || sig && sig.rat || s.mode || "";
        },
        bandLabel: function(s) {
          var pre = /NR5G/.test(this.carrierRat(s)) ? "n" : "B";
          return s.band == null || s.band === "" ? "—" : pre + s.band;
        },
        mOf: function(t2) {
          return -((this.viewNow() - t2) / 6e4);
        },
        xOf: function(m) {
          var plotW = this.width - PADL - PADR;
          return PADL + (m + this.winW) / this.winW * plotW;
        },
        winSamples: function() {
          var now = this.viewNow(), cutoff = now - this.winW * 6e4;
          var top = this.frozenAt != null ? this.frozenAt : Infinity;
          var win = this.samples.filter(function(s) {
            return s.t >= cutoff && s.t <= top;
          }).map(function(s) {
            return Object.assign({ m: -((now - s.t) / 6e4) }, s);
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
        // Fixed base domain from L.dom, expanded for out-of-range samples in `ss`
        // (window samples). Never shrinks to the series min/max — in-range data
        // keeps the absolute field-test scale. Pass `ss` once per render so legend
        // + y-map share one pass over the same array.
        domainFor: function(L, ss) {
          var d0 = L.dom[0], d1 = L.dom[1], key = L.key;
          for (var i = 0; i < ss.length; i++) {
            var v = ss[i][key];
            if (v == null || v === "" || isNaN(v)) continue;
            v = +v;
            if (v < d0) d0 = v;
            if (v > d1) d1 = v;
          }
          return [d0, d1];
        },
        // Y-axis tick values, top→bottom inclusive. Evenly spaced across the
        // effective domain (which may have expanded past the metric's fixed base).
        yTicks: function(d0, d1) {
          var out = [], n = Y_INTERVALS, span = d1 - d0;
          for (var i = 0; i <= n; i++) out.push(d1 - span * i / n);
          return out;
        },
        fmtTick: function(v) {
          if (v == null || isNaN(v)) return "";
          var r = Math.round(v);
          return Math.abs(v - r) < 0.05 ? String(r) : v.toFixed(1);
        },
        // Paint one metric's y-axis into `kids`. `side` is "left" (RSRP) or
        // "right" (SINR). Only the left axis draws interior gridlines — two sets
        // at different absolute positions would fight, and RSRP is the headline.
        // The two axes do NOT share a scale; colour + name + unit make that explicit.
        paintYAxis: function(h, kids, opts) {
          var self = this;
          var d0 = opts.d0, d1 = opts.d1, span = d1 - d0;
          var plotTop = opts.plotTop, plotBot = opts.plotBot, W = opts.W;
          var left = opts.side === "left";
          var xLab = left ? PADL - 5 : W - PADR + 5;
          var anchor = left ? "end" : "start";
          var yOf = function(v) {
            if (!span) return plotTop + PLOT_H / 2;
            return plotBot - (Math.max(d0, Math.min(d1, v)) - d0) / span * PLOT_H;
          };
          kids.push(h("text", { attrs: {
            x: xLab,
            y: plotTop - 6,
            "text-anchor": anchor,
            "font-size": 9.5,
            "font-weight": 600,
            fill: opts.color,
            "font-family": "var(--mono,ui-monospace,monospace)"
          } }, opts.name));
          self.yTicks(d0, d1).forEach(function(tv, i, arr) {
            var yy = yOf(tv);
            if (left && i > 0 && i < arr.length - 1) {
              kids.push(h("line", { attrs: {
                x1: PADL,
                x2: W - PADR,
                y1: yy,
                y2: yy,
                stroke: "var(--divider)",
                "stroke-width": 1,
                "stroke-dasharray": "2 3"
              } }));
            }
            var dy = i === 0 ? 10 : i === arr.length - 1 ? -3 : 3;
            kids.push(h("text", { attrs: {
              x: xLab,
              y: yy + dy,
              "text-anchor": anchor,
              "font-size": 9.5,
              fill: opts.color,
              "font-family": "var(--mono,ui-monospace,monospace)"
            } }, self.fmtTick(tv)));
          });
          kids.push(h("text", { attrs: {
            x: xLab,
            y: plotTop + 20,
            "text-anchor": anchor,
            "font-size": 8,
            fill: "var(--text-badge)",
            "font-family": "var(--mono,ui-monospace,monospace)"
          } }, opts.unit));
        },
        winEvents: function() {
          var now = this.viewNow(), cutoff = now - this.winW * 6e4, self = this;
          var top = this.frozenAt != null ? this.frozenAt : Infinity;
          return this.allEvents.filter(function(e) {
            return e.t >= cutoff && e.t <= top;
          }).map(function(e) {
            return Object.assign({ m: self.mOf(e.t) }, e);
          });
        },
        // Closest sample to box time `t` in an ascending array, or null.
        nearestByT: function(ss, t2) {
          if (!ss || !ss.length) return null;
          var best = ss[0];
          for (var i = 1; i < ss.length; i++)
            if (Math.abs(ss[i].t - t2) < Math.abs(best.t - t2)) best = ss[i];
          return best;
        },
        nearestSample: function(m) {
          return this.nearestByT(this.winSamples(), this.viewNow() + m * 6e4);
        },
        // Where the slice line sits (minutes, view-relative): the pinned
        // sample's own time when pinned, the hover position otherwise.
        cursorM: function() {
          if (this.pinnedT != null) return this.mOf(this.pinnedT);
          return this.cursor;
        },
        // The sample the readout describes. A pin is an absolute SAMPLE time, so
        // it keeps describing that sample however many pushes land after it; it
        // shows nothing once that sample has left the visible window.
        focusSample: function() {
          if (this.pinnedT != null) {
            var pm = this.mOf(this.pinnedT);
            if (pm < -this.winW || pm > 0) return null;
            return this.nearestByT(this.winSamples(), this.pinnedT);
          }
          return this.cursor == null ? null : this.nearestSample(this.cursor);
        },
        busRuns: function(key) {
          var ss = this.winSamples(), runs = [], self = this;
          var label = function(s) {
            return key === "band" ? self.bandLabel(s) : key === "id" ? s.id == null ? "—" : String(s.id) : s.carrier ? s.carrier + " · SIM " + s.slot : "SIM " + s.slot;
          };
          for (var i = 0; i < ss.length; i++) {
            var v = label(ss[i]), lastRun = runs[runs.length - 1];
            var sameSim = i === 0 || String(ss[i].slot) === String(ss[i - 1].slot);
            if (lastRun && sameSim && lastRun.v === v) lastRun.m1 = ss[i].m;
            else {
              if (lastRun) lastRun.m1 = ss[i].m;
              runs.push({ v, m0: ss[i].m, m1: ss[i].m, s: ss[i] });
            }
          }
          if (runs.length) {
            var lastS = ss[ss.length - 1];
            runs[runs.length - 1].m1 = this.viewNow() - lastS.t > GAP_MS ? lastS.m : 0;
          }
          return runs;
        },
        // ---- interaction ----
        mFromEvent: function(e) {
          var el = this.$refs.lanes;
          if (!el) return null;
          var r = el.getBoundingClientRect();
          if (!r.width) return null;
          var ux = (e.clientX - r.left) * this.width / r.width;
          var plotW = this.width - PADL - PADR;
          return -this.winW + (ux - PADL) / plotW * this.winW;
        },
        clampM: function(m) {
          return Math.max(-this.winW, Math.min(0, m));
        },
        onMove: function(e) {
          if (this.pinnedT != null) return;
          var m = this.mFromEvent(e);
          if (m == null) return;
          this.cursor = this.clampM(m);
        },
        onLeave: function() {
          if (this.pinnedT == null) this.cursor = null;
        },
        onClick: function(e) {
          this.hashPinM = null;
          if (this.pinnedT != null && this.focusSample()) {
            this.pinnedT = null;
            this.cursor = null;
            return;
          }
          var m = this.mFromEvent(e);
          if (m == null) return;
          m = this.clampM(m);
          var s = this.nearestSample(m);
          this.pinnedT = s ? s.t : this.viewNow() + m * 6e4;
          this.cursor = this.mOf(this.pinnedT);
        },
        setRange: function(w) {
          this.winW = w;
          this.pinnedT = null;
          this.hashPinM = null;
          this.cursor = null;
          var cutoff = this.viewNow() - w * 6e4;
          if (this.loadedFrom == null || cutoff < this.loadedFrom - 1e3)
            this.fetchHistory({ window: this.neededWindowMin(w) });
        },
        parseHash: function() {
          if (typeof window === "undefined" || !window.location) return;
          var q = {};
          (window.location.hash || "").replace(/^#/, "").split("&").forEach(function(kv) {
            var p = kv.split("=");
            if (p[0]) q[p[0]] = p[1];
          });
          var w = parseInt(q.w, 10);
          if ([15, 60, 360, 1440].indexOf(w) !== -1) this.winW = w;
          var m = parseFloat(q.m);
          if (!isNaN(m)) {
            m = this.clampM(m);
            this.hashPinM = m;
            this.pinnedT = this.viewNow() + m * 6e4;
            this.cursor = m;
          }
        },
        // ---- render helpers ----
        renderLanes: function(h) {
          var self = this, W = this.width, kids = [];
          var ss = this.winSamples();
          var doms = LINES.map(function(L) {
            return self.domainFor(L, ss);
          });
          var lx = PADL;
          LINES.forEach(function(L, i) {
            var dom = doms[i];
            var lab = L.label + "  " + dom[0] + "…" + dom[1];
            kids.push(h("rect", { attrs: { x: lx, y: 3, width: 13, height: 3, rx: 1.5, fill: L.color } }));
            kids.push(h("text", { attrs: {
              x: lx + 18,
              y: 9,
              "font-size": 9.5,
              fill: "var(--text-badge)"
            } }, lab));
            lx += 18 + String(lab).length * 5.7 + 20;
          });
          var plotTop = 22, plotBot = plotTop + PLOT_H;
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
          self.paintYAxis(h, kids, {
            side: "left",
            d0: doms[0][0],
            d1: doms[0][1],
            name: "RSRP",
            color: LINES[0].color,
            unit: "dBm",
            plotTop,
            plotBot,
            W
          });
          self.paintYAxis(h, kids, {
            side: "right",
            d0: doms[1][0],
            d1: doms[1][1],
            name: "SINR",
            color: LINES[1].color,
            unit: "dB",
            plotTop,
            plotBot,
            W
          });
          LINES.forEach(function(L, i) {
            var d0 = doms[i][0], d1 = doms[i][1], span = d1 - d0;
            var yv = function(v) {
              if (!span) return plotTop + PLOT_H / 2;
              return plotBot - (Math.max(d0, Math.min(d1, v)) - d0) / span * PLOT_H;
            };
            var d = "", pen = false, prevT = null, prevSlot = null;
            ss.forEach(function(s) {
              var v = s[L.key];
              var slot = s.slot == null ? null : String(s.slot);
              if (prevSlot !== null && slot !== prevSlot) pen = false;
              prevSlot = slot;
              if (v == null) {
                pen = false;
                prevT = s.t != null ? s.t : prevT;
                return;
              }
              if (prevT != null && s.t != null && s.t - prevT > GAP_MS) pen = false;
              d += (pen ? "L" : "M") + self.xOf(s.m).toFixed(1) + " " + yv(v).toFixed(1) + " ";
              pen = true;
              prevT = s.t != null ? s.t : prevT;
            });
            if (d) kids.push(h("path", { attrs: {
              fill: "none",
              stroke: L.color,
              "stroke-width": 1.75,
              "stroke-linejoin": "round",
              "stroke-linecap": "round",
              d: d.trim()
            } }));
          });
          var y = plotBot + 12;
          BUSES.forEach(function(B) {
            kids.push(h("text", { attrs: {
              x: 6,
              y: y + BUS_H / 2 + 3,
              "font-size": 9,
              fill: "var(--text-badge)"
            } }, B.label));
            self.busRuns(B.key).forEach(function(r) {
              var x0 = Math.max(PADL, self.xOf(r.m0)), x1 = Math.min(W - PADR, self.xOf(r.m1));
              var w = x1 - x0;
              if (w < 1.2) return;
              kids.push(h("rect", { attrs: {
                x: x0.toFixed(1),
                y,
                width: w.toFixed(1),
                height: BUS_H,
                rx: 2,
                fill: "var(--background-title,#f2f2f7)",
                stroke: "var(--border)",
                "stroke-width": 1
              } }));
              var lab = r.v;
              if (B.key === "band" && self.freqOf(r.s.band)) lab += " · " + self.freqOf(r.s.band) + " MHz";
              if (w > String(lab).length * 6.2 + 10)
                kids.push(h("text", { attrs: {
                  x: ((x0 + x1) / 2).toFixed(1),
                  y: y + BUS_H / 2 + 3.5,
                  "text-anchor": "middle",
                  "font-size": 10,
                  fill: "var(--text-weak)",
                  "font-family": "var(--mono,ui-monospace,monospace)"
                } }, lab));
            });
            y += BUS_H + 7;
          });
          var evTop = plotTop, evBot = y - 7;
          this.winEvents().forEach(function(e) {
            var col = e.kind === "user" ? "var(--primary)" : e.kind === "dog" ? "var(--warning)" : "var(--text-hint)";
            var ex = self.xOf(e.m);
            kids.push(h("line", { attrs: {
              x1: ex.toFixed(1),
              x2: ex.toFixed(1),
              y1: evTop,
              y2: evBot,
              stroke: col,
              "stroke-width": 1,
              "stroke-dasharray": "3 3"
            } }));
          });
          var step = TICKSTEP[this.winW];
          for (var m = -this.winW; m <= 0; m += step) {
            var xx = self.xOf(m);
            kids.push(h("line", { attrs: {
              x1: xx.toFixed(1),
              x2: xx.toFixed(1),
              y1: y,
              y2: y + 4,
              stroke: "var(--divider)",
              "stroke-width": 1
            } }));
            kids.push(h(
              "text",
              { attrs: {
                x: xx.toFixed(1),
                y: y + 14,
                "text-anchor": "middle",
                "font-size": 9,
                fill: "var(--text-badge)",
                "font-family": "var(--mono,ui-monospace,monospace)"
              } },
              this.clock(this.viewNow() + m * 6e4)
            ));
          }
          y += 22;
          var cm = this.cursorM();
          if (cm != null && cm >= -this.winW && cm <= 0) {
            var cx = this.xOf(cm);
            kids.push(h("line", { attrs: {
              x1: cx.toFixed(1),
              x2: cx.toFixed(1),
              y1: evTop,
              y2: evBot,
              stroke: this.pinnedT != null ? "var(--primary)" : "var(--text-weak)",
              "stroke-width": this.pinnedT != null ? 1.25 : 1
            } }));
          }
          return h("svg", { ref: "svg", attrs: {
            viewBox: "0 0 " + W + " " + y,
            width: W,
            height: y,
            preserveAspectRatio: "none"
          } }, kids);
        },
        sliceReadout: function(h) {
          var s = this.focusSample();
          if (!s) return null;
          var self = this, cx = this.xOf(s.m), near = null, evs = this.winEvents();
          for (var i = 0; i < evs.length; i++)
            if (Math.abs(this.xOf(evs[i].m) - cx) < 6) near = evs[i];
          var val = function(v) {
            return v == null ? "—" : String(v);
          };
          var row = function(k, v, u, q) {
            return h("tr", [
              h("td", { staticClass: "k" }, k),
              h(
                "td",
                { staticClass: "v", staticStyle: q ? { color: self.qColor(q) } : {} },
                val(v) + (u ? " " + u : "")
              )
            ]);
          };
          var rows = [
            row("RSRP", s.rsrp, "dBm", this.qFromLevel(s.rsrp_level)),
            row("SINR", s.sinr, "dB", this.qFromLevel(s.sinr_level)),
            row("RSRQ", s.rsrq, "dB", this.qFromLevel(s.rsrq_level)),
            row("Band", this.bandLabel(s), this.freqOf(s.band) ? "· " + this.freqOf(s.band) + " MHz" : "", null),
            row("Cell", s.id == null ? "—" : s.id, "", null),
            row("SIM", (s.carrier || "SIM") + " · " + s.slot, "", null)
          ];
          var kids = [h(
            "div",
            { staticClass: "t" },
            this.clock(s.t) + (this.pinnedT != null ? " · " + t("pinned") : "")
          )];
          if (near) kids.push(h(
            "div",
            {
              staticClass: "e",
              staticStyle: { color: near.kind === "user" ? "var(--primary)" : near.kind === "dog" ? "var(--warning-hover,#c4851c)" : "var(--text-weak)" }
            },
            near.label + " — " + near.detail
          ));
          kids.push(h("table", rows));
          return h("div", { staticClass: "mmt-tip" }, kids);
        },
        renderLog: function(h) {
          var self = this, top = this.frozenAt;
          var evs = (top == null ? this.allEvents.slice() : this.allEvents.filter(function(e) {
            return e.t <= top;
          })).reverse();
          var rows = evs.map(function(e, i) {
            var src = { user: "User", dog: "Watchdog", net: "Network" }[e.kind];
            return h("tr", { key: i }, [
              h("td", { staticClass: "tm" }, self.clock(e.t)),
              h("td", [h("span", { staticClass: "mmt-chip " + e.kind }, src)]),
              h("td", { staticStyle: { fontWeight: "600", color: "var(--text-title)" } }, e.label),
              h("td", { staticStyle: { color: "var(--text-weak)" } }, e.detail || "")
            ]);
          });
          return h("div", { staticClass: "mmt-card" }, [
            h("div", { staticClass: "mmt-head" }, [
              h("span", { staticClass: "mmt-title" }, "Event log"),
              h("span", { staticClass: "mmt-hint" }, "newest first")
            ]),
            rows.length ? h("table", { staticClass: "mmt-log" }, [
              h("thead", [h("tr", [h("th", "Time"), h("th", "Source"), h("th", "Event"), h("th", "Detail")])]),
              h("tbody", rows)
            ]) : h("div", { staticClass: "mmt-empty" }, "No band changes, handovers or failovers recorded yet.")
          ]);
        },
        renderPage: function(h) {
          var self = this;
          var hasData = this.winSamples().length > 0;
          var head = h("div", { staticClass: "mmt-head" }, [
            this.embedded ? null : h("button", { staticClass: "mmt-crumb", on: { click: function() {
              if (self.$router) self.$router.push("/mudimodem");
            } } }, "← Modem"),
            h("span", { staticClass: "mmt-title" }, "Tracking"),
            h("span", { staticClass: "mmt-hint" }, "one clock, all three metrics — hover for a slice, click to pin"),
            h("span", { staticClass: "mmt-sp" }),
            h("span", { staticClass: "mmt-seg" }, RANGES.map(function(r) {
              return h("button", {
                key: r[0],
                staticClass: self.winW === r[0] ? "on" : "",
                on: { click: function() {
                  self.setRange(r[0]);
                } }
              }, r[1]);
            })),
            // PAUSED freezes the view (window, axis, slice, log); pushes keep
            // being collected underneath and appear on resume.
            self.live ? null : h("span", { staticClass: "mmt-held" }, function() {
              var n = self.heldCount();
              return n ? t(n === 1 ? "{n} new sample held — resume to show" : "{n} new samples held — resume to show", { n }) : t("view frozen");
            }()),
            h(
              "button",
              {
                staticClass: "mmt-live" + (self.live ? "" : " off"),
                on: { click: function() {
                  self.togglePause();
                } }
              },
              [h("span", { staticClass: "d" }), self.live ? "LIVE" : "PAUSED"]
            )
          ]);
          var every = Math.round((this.retryMs || RETRY_BASE_MS) / 1e3);
          var body, note = null;
          if (hasData) {
            body = h(
              "div",
              {
                ref: "lanes",
                staticClass: "mmt-lanes",
                on: { mousemove: this.onMove, mouseleave: this.onLeave, click: this.onClick }
              },
              [this.renderLanes(h), this.cursorM() != null ? this.sliceReadout(h) : null]
            );
            if (this.loadFails > 0)
              note = h("div", { staticClass: "mmt-note" }, t(this.preloaded ? "Couldn't load the wider range yet; retrying every {s} s." : "Earlier history didn't load — showing live samples since the page opened; retrying every {s} s.", { s: every }));
          } else {
            var msg = this.loadFails > 0 && this.err ? t("Couldn't load history: {err} — retrying every {s} s.", { err: this.err, s: every }) : this.loading ? "Loading history from the router…" : "No samples yet. The collector runs on the router and gathers continuously — check back in a minute, or confirm the mudimodem-collectd service is running.";
            body = h("div", { staticClass: "mmt-empty" }, msg);
          }
          var foot = h("div", { staticClass: "mmt-foot" }, [
            h("span", { staticClass: "mmt-lg" }, "■ User"),
            h("span", { staticClass: "mmt-lg" }, "▲ Watchdog"),
            h("span", { staticClass: "mmt-lg" }, "○ Network"),
            h("span", "a tick marks the moment — everything to its right is the radio's answer")
          ]);
          return h("div", { staticClass: "mmt" }, [
            h("div", { staticClass: "mmt-card" }, [head, note, body, foot]),
            this.renderLog(h)
          ]);
        },
        injectStyle: function() {
          if (typeof document === "undefined" || document.getElementById(this.styleId)) return;
          var css = ".mmt{color:var(--text-regular);font-variant-numeric:tabular-nums}.mmt-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);margin-bottom:11px}.mmt-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px 10px}.mmt-title{font-size:14px;font-weight:600;color:var(--text-title)}.mmt-hint{font-size:11.5px;color:var(--text-badge)}.mmt-sp{flex:1}.mmt-crumb{background:none;border:0;font:inherit;font-size:12px;color:var(--primary);cursor:pointer;padding:0}.mmt-seg{display:inline-flex;border:1px solid var(--border);border-radius:3px;overflow:hidden}.mmt-seg button{font:inherit;font-size:11.5px;background:transparent;border:0;padding:5px 12px;cursor:pointer;color:var(--text-weak);border-right:1px solid var(--border)}.mmt-seg button:last-child{border-right:0}.mmt-seg button.on{background:var(--primary);color:#fff;font-weight:600}.mmt-live{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--success);cursor:pointer;background:none;border:1px solid var(--border);border-radius:3px;padding:5px 10px}.mmt-live .d{width:7px;height:7px;border-radius:50%;background:var(--success)}.mmt-live.off{color:var(--text-badge)}.mmt-live.off .d{background:var(--text-hint)}.mmt-held{font-size:11px;color:var(--text-badge)}.mmt-note{font-size:11.5px;color:var(--warning-hover,#c4851c);padding:0 14px 8px}.mmt-lanes{position:relative;padding:2px 0 6px;cursor:crosshair}.mmt-lanes svg{display:block;width:100%;overflow:visible}.mmt-foot{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:8px 14px 11px;border-top:1px solid var(--divider);font-size:11px;color:var(--text-badge)}.mmt-lg{display:inline-flex;align-items:center;gap:5px}.mmt-tip{position:absolute;top:26px;left:8px;pointer-events:none;z-index:5;background:var(--background-card);border:1px solid var(--border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:8px 10px;width:184px;height:158px;overflow:hidden}.mmt-tip .t{font-size:10.5px;color:var(--text-badge);margin-bottom:5px}.mmt-tip .e{font-size:11px;font-weight:600;margin:-1px 0 5px;padding-bottom:5px;border-bottom:1px solid var(--divider);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mmt-tip table{border-collapse:collapse;width:100%}.mmt-tip td{padding:1px 0;font-size:11.5px}.mmt-tip td.k{color:var(--text-badge);font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding-right:10px}.mmt-tip td.v{font-weight:600;color:var(--text-title);text-align:right;white-space:nowrap}.mmt-empty{padding:30px 14px;text-align:center;color:var(--text-hint);font-size:12.5px;line-height:1.6}.mmt-log{width:100%;border-collapse:collapse}.mmt-log th{font-size:10px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge);text-align:left;padding:7px 14px 6px;border-bottom:1px solid var(--divider)}.mmt-log td{font-size:12px;padding:6px 14px;border-bottom:1px solid var(--divider);color:var(--text-regular)}.mmt-log td.tm{font-family:var(--mono,ui-monospace,monospace);font-size:11px;color:var(--text-weak);white-space:nowrap}.mmt-chip{display:inline-block;font-size:10px;font-weight:600;border-radius:2px;padding:1px 6px}.mmt-chip.user{background:var(--primary-background,#eef1fe);color:var(--primary)}.mmt-chip.dog{background:var(--warning-background,#fef6e9);color:var(--warning-hover,#c4851c)}.mmt-chip.net{background:var(--background-title,#f2f2f7);color:var(--text-badge)}@media(max-width:720px){.mmt-hint{display:none}}";
          var el = document.createElement("style");
          el.id = this.styleId;
          el.textContent = css;
          document.head.appendChild(el);
        }
      },
      render: function(h) {
        return this.renderPage(h);
      }
    };
    return component;
  }());
  return __toCommonJS(tracking_exports);
})();
return __mm.default;
})();

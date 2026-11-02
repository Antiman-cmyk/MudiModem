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
    "Cell": "小区",
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
    "Clear history": "清除历史",
    "Clear it": "清除",
    "Commands go straight to the {modem}. Nothing is validated. Entries marked nv write modem memory that survives a factory reset.": "命令会直接发给 {modem}，不做任何校验。标记为 nv 的条目会写入 Modem 的存储，恢复出厂设置后仍然存在。",
    "Config": "配置",
    "Confirm": "确认",
    "Connection dropped while applying the lock - checking whether it took...": "锁定时连接中断 - 正在确认是否已生效…",
    "Connection dropped while locking and hasn't recovered yet - refresh once you're back to see the current lock state.": "锁定时连接中断且尚未恢复 - 恢复后请刷新以查看当前锁定状态。",
    "Contributed by": "贡献者",
    "Copy": "复制",
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

  // src/web/tabs/speedtest.js
  var speedtest_default = localize(function() {
    "use strict";
    var IFACES = [["cellular", "Cellular"], ["wired", "Wired WAN"]];
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
    function carrierRat(r) {
      var sig = Array.isArray(r.signals) && r.signals[0];
      return r.pcc_rat || sig && sig.rat || r.mode || "";
    }
    function resultDetailRows(r) {
      return [
        ["Latency", r.latency_ms == null ? "—" : r.latency_ms + " ms (±" + (r.jitter_ms == null ? "—" : r.jitter_ms) + ")"],
        ["Carrier", (r.carrier || "—") + " · SIM " + (r.slot == null ? "—" : r.slot)],
        // The prefix follows the carrier: an EN-DC anchor on B2 is "B2", not "n2".
        ["Band", r.band == null ? "—" : (/NR5G/.test(carrierRat(r)) ? "n" : "B") + r.band],
        ["Cell", r.cell_id == null ? "—" : r.cell_id],
        ["RSRP", r.rsrp == null ? "—" : r.rsrp + " dBm"],
        ["SINR", r.sinr == null ? "—" : r.sinr + " dB"],
        ["RSRQ", r.rsrq == null ? "—" : r.rsrq + " dB"]
      ];
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
          cursor: null,
          pinned: null,
          width: 900
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
        this.fetchStatus(true);
      },
      // Torn down (a tab switch destroys us): every async continuation checks
      // _dead first, so a reply landing afterwards can't start an orphan 1 Hz
      // poll that would run until the test ends.
      beforeDestroy: function() {
        this._dead = true;
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
          var err = !this.status.running && this.status.phase === "error" ? h("span", { staticClass: "mms-err" }, this.status.message) : null;
          var ifaceErr = this.ifacesErr ? h("span", { staticClass: "mms-err" }, t("Couldn't check interfaces: {err}", { err: this.ifacesErr })) : null;
          return h("div", { staticClass: "mms-controls" }, [ifaceSel, runBtn, err, ifaceErr].filter(Boolean));
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
          return h("div", { staticClass: "mms-sched" }, [toggle, sel, err].filter(Boolean));
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
          var plotTop = 10, plotBot = plotTop + PLOT_H;
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
          kids.push(h("rect", { attrs: { x: PADL, y: 0, width: 10, height: 3, fill: "var(--primary)" } }));
          kids.push(h("text", { attrs: { x: PADL + 14, y: 6, "font-size": 9.5, fill: "var(--text-badge)" } }, "Download"));
          kids.push(h("rect", { attrs: { x: PADL + 78, y: 0, width: 10, height: 3, fill: "var(--success)" } }));
          kids.push(h("text", { attrs: { x: PADL + 92, y: 6, "font-size": 9.5, fill: "var(--text-badge)" } }, "Upload"));
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
          var svg = h("svg", { ref: "svg", attrs: {
            viewBox: "0 0 " + W + " " + (latBot + 4),
            width: W,
            height: latBot + 4,
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
          var css = ".mms{color:var(--text-regular)}.mms-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);padding:12px 14px;margin-bottom:11px}.mms-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}.mms-crumb{background:none;border:0;font:inherit;font-size:12px;color:var(--primary);cursor:pointer;padding:0}.mms-title{font-size:14px;font-weight:600;color:var(--text-title)}.mms-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.mms-btn{font-size:12px;font-weight:600;border-radius:3px;padding:7px 14px;cursor:pointer;font-family:inherit;border:1px solid var(--border);background:var(--background-card);color:var(--text-regular)}.mms-btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}.mms-btn:disabled{opacity:.6;cursor:default}.mms-err{color:var(--error);font-size:12px}.mms-sched{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:12px}.mms-sched-toggle{display:flex;align-items:center;gap:6px;cursor:pointer}.mms-empty{padding:24px 0;text-align:center;color:var(--text-hint);font-size:12.5px}.mms-graph{position:relative;cursor:crosshair}.mms-graph svg{display:block;width:100%}.mms-tip{position:absolute;top:8px;left:8px;pointer-events:none;z-index:5;background:var(--background-card);border:1px solid var(--border);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:8px 10px;min-width:170px}.mms-tip .t{font-size:10.5px;color:var(--text-badge);margin-bottom:5px}.mms-tip-row{display:flex;justify-content:space-between;gap:14px;font-size:11.5px;padding:1px 0}.mms-tip-row b{font-weight:600;color:var(--text-title)}.mms-latest-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}.mms-latest-when{font-size:11px;color:var(--text-badge)}.mms-latest-big{display:flex;gap:22px;margin-bottom:10px;flex-wrap:wrap}.mms-latest-metric{display:flex;flex-direction:column}.mms-latest-metric .v{font-size:22px;font-weight:700;color:var(--text-title);line-height:1.15}.mms-latest-metric .u{font-size:10.5px;color:var(--text-badge)}";
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
            h("div", { staticClass: "mms-card" }, [head, this.renderControls(h), this.renderSchedule(h)]),
            this.renderLatestResult(h),
            h("div", { staticClass: "mms-card" }, [
              h("div", { staticClass: "mms-controls" }, [
                h("span", "History"),
                ifaceFilterSel,
                slotSel,
                h("button", { staticClass: "mms-btn", on: { click: function() {
                  self.clearHistory();
                } } }, "Clear history")
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

/* MudiModem — built from src/web/main/index.js by tools/build-web.mjs. Do not edit: run npm run build:web. */
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

  // src/web/main/index.js
  var index_exports = {};
  __export(index_exports, {
    default: () => index_default
  });

  // src/web/kit/compose.js
  function compose(shell, parts) {
    var out = Object.assign({}, shell);
    var datas = [shell].concat(parts).map(function(p) {
      return p.data;
    }).filter(Boolean);
    out.data = function() {
      var self = this, all = {};
      datas.forEach(function(d) {
        var o = d.call(self);
        Object.keys(o).forEach(function(k) {
          if (k in all) throw new Error("compose: data key '" + k + "' defined twice");
          all[k] = o[k];
        });
      });
      return all;
    };
    ["computed", "methods", "watch"].forEach(function(kind) {
      var merged = {};
      [shell].concat(parts).forEach(function(p) {
        Object.keys(p[kind] || {}).forEach(function(k) {
          if (k in merged) throw new Error("compose: " + kind + " '" + k + "' defined twice");
          merged[k] = p[kind][k];
        });
      });
      out[kind] = merged;
    });
    parts.forEach(function(p) {
      Object.keys(p).forEach(function(k) {
        if (["data", "computed", "methods", "watch"].indexOf(k) < 0)
          throw new Error("compose: modules may only carry data/computed/methods/watch (got '" + k + "')");
      });
    });
    return out;
  }

  // src/web/locales/zh-cn.js
  var zh_cn_default = {
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
  function tp(en, parts) {
    var tpl = tr(en), out = [], re = /\{(\w+)\}/g, last = 0, m;
    while (m = re.exec(tpl)) {
      if (m.index > last) out.push(tpl.slice(last, m.index));
      out.push(parts && Object.prototype.hasOwnProperty.call(parts, m[1]) ? parts[m[1]] : m[0]);
      last = m.index + m[0].length;
    }
    if (last < tpl.length) out.push(tpl.slice(last));
    return out;
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
  function rpcAt(cmd, timeoutS) {
    var call = function(m, p, ms) {
      return rpc(m, p, { timeout: ms });
    };
    return call("at_console", { cmd, timeout: timeoutS || 8 }, 35e3).then(follow(call, 35e3, "at_result"));
  }
  function rpcSilentJob(method, params, sliceMs) {
    sliceMs = sliceMs || 35e3;
    return rpcSilent(method, params, sliceMs).then(follow(rpcSilent, sliceMs));
  }

  // src/web/main/strip.js
  var strip_default = {
    data() {
      return {
        // ---- status-strip trace: ONE source, the collector ----
        // mudimodem-collectd samples the modem every 10s and keeps 24h of history.
        // The strip PRELOADS the last 15 minutes once (get_history) and is then
        // fed LIVE by the collector's own pushes over the websocket
        // (mudimodem.collect) — no polling. A slow safety poll only fires when
        // no push has arrived for a while (collector restarting, ws hiccup).
        showGlossary: false,
        // the "?" next to the RSRP label: what each reading means
        STRIP_MIN: 15,
        // minutes of history the strip shows
        STRIP_POLL_MS: 3e4,
        // safety-poll cadence (only acts when pushes stalled)
        STRIP_STALL_MS: 45e3,
        // no push for this long => safety poll fetches the tail
        STRIP_GAP_MS: 45e3,
        // a hole wider than this breaks the line, not bridges it
        STRIP_HOLE_MS: 25e3,
        // a push landing this long after the last point => backfill the hole
        pushSeenAt: 0,
        // browser clock of the last collector push
        hist: [],
        // [{t, v, s}] oldest-first, BOX timestamps, rsrp + the sample's SIM slot
        histLastT: 0,
        // newest t held — the incremental `since` cursor
        histPreloaded: false,
        // the 15-min window has been fetched once (gates {since})
        histNow: 0,
        // box clock as of the last reply
        histNowAt: 0,
        // browser clock at that same instant (skew correction)
        histFetching: false,
        // one strip fetch at a time
        histTimer: null
        // strip poll interval handle
      };
    },
    methods: {
      // --- network-type lock conflict ---------------------------------------
      // A cell/tower lock names a RAT (LTE or NR5G). If the network mode excludes
      // that RAT the lock is stranded: stored, reported, but inert (an LTE lock
      // under 5G-only never binds). meta.lock rides on get_bands' feat.tower.
      lockInfo() {
        var lk = this.bands && this.bands.meta && this.bands.meta.lock;
        return lk && lk.active ? lk : null;
      },
      // "LTE B12 / PCI 115" or "5G n71 / PCI 516" for the warning banner + tooltip.
      lockLabel() {
        var lk = this.lockInfo();
        if (!lk) return "";
        var rat = lk.rat === "4g" ? "LTE" : "5G";
        var band = lk.band !== void 0 && lk.band !== null && lk.band !== "" ? " " + (lk.rat === "4g" ? "B" : "n") + lk.band : "";
        var pci = lk.pci !== void 0 && lk.pci !== null ? " / PCI " + lk.pci : "";
        return rat + band + pci;
      },
      // --- banner control-state badges (mode lock + tower lock) ------------
      // Both ride on this.bands (get_bands). Return null until it has loaded, so
      // the strip never asserts a state we don't yet know (a false "Unlocked").
      modeBadge() {
        if (!this.bands) return null;
        var m = this.appliedMode();
        if (m === "LTE") return { text: t("4G only"), active: true };
        if (m === "NR5G") return { text: t("5G only"), active: true };
        return { text: t("Auto"), active: false };
      },
      towerBadge() {
        if (!this.bands) return null;
        var lk = this.lockInfo();
        if (!lk) return { text: t("Unlocked"), locked: false };
        var rat = lk.rat === "4g" ? "LTE" : "5G";
        var tag = lk.band !== void 0 && lk.band !== null && lk.band !== "" ? (lk.rat === "4g" ? "B" : "n") + lk.band : lk.pci !== void 0 && lk.pci !== null ? "PCI " + lk.pci : "";
        return { text: rat + (tag ? " " + tag : ""), locked: true, title: this.lockLabel() };
      },
      // What each reading means, with rough ranges — tap the "?" (works on touch, unlike a title).
      renderGlossary(h) {
        var items = [
          ["RSRP", "Received power from the cell, in dBm. Above −90 is good, −90 to −105 fair, below −110 poor."],
          ["SINR", "Signal against noise and interference, in dB. Above 13 is good, 0 to 13 fair, below 0 poor."],
          ["RSRQ", "Signal quality including how busy the cell is, in dB. Above −10 is good, −10 to −15 fair, below −15 poor."],
          ["Band", "The frequency band in use: n = 5G NR, B = LTE. Low bands reach far; high bands are faster but shorter."],
          ["Cell / Ch", "Which cell the modem is on (its ID) and the channel number with its frequency."],
          ["CA", "Carrier aggregation: several carriers combined for more speed."]
        ];
        return h("div", { staticClass: "mm-gloss" }, items.map(function(it) {
          return h("div", { key: it[0] }, [h("b", it[0]), " ", h("span", it[1])]);
        }));
      },
      // Two clickable status badges for the trace header. Each jumps to its tab.
      renderLockBadges(h) {
        var self = this, mb = this.modeBadge(), tb = this.towerBadge();
        if (!mb && !tb) return h("span");
        var kids = [];
        if (mb) kids.push(h("button", {
          staticClass: "mm-lockbadge" + (mb.active ? " mode" : ""),
          attrs: { type: "button", title: "Network mode — open Bands" },
          on: { click: function() {
            self.tab = "bands";
          } }
        }, mb.text));
        if (tb) kids.push(h("button", {
          staticClass: "mm-lockbadge" + (tb.locked ? " lock" : ""),
          attrs: {
            type: "button",
            title: (tb.locked ? tb.title + " — " : "") + t("Cell lock — open Cell lock tab")
          },
          on: { click: function() {
            self.tab = "lock";
          } }
        }, (tb.locked ? "🔒 " : "🔓 ") + tb.text));
        return h("div", { staticClass: "mm-lockbadges" }, kids);
      },
      // Post to /rpc via $axios DIRECTLY, not $rpcRequest. $rpcRequest's axios
      // interceptor pops GL's global error/timeout banner on any failure BEFORE
      // our .catch can run — unacceptable for a background poll, which on this box
      // is GUARANTEED to hit a dead socket at some point (the self-update restarts
      // nginx; a cellular link drops requests on its own). Same reasoning and shape
      // as the tracking chunk's rpcSilent. Resolves null on any failure: the caller
      // treats that as "no answer yet" and tries again.
      rpcSilent(method, params, timeoutMs) {
        return rpcSilent(method, params, timeoutMs || 15e3);
      },
      stripRpc(params) {
        return this.rpcSilent("get_history", params, 15e3);
      },
      // Preload the whole strip window once (a DURATION, window_ms, never a
      // browser-computed cutoff — box and browser clocks disagree on a travel
      // router). After that, samples arrive as collector pushes (onSamplePush);
      // the incremental {since} form is only used by the stall safety-poll.
      fetchStripHistory(opts) {
        var self = this;
        if (this.histFetching || this.pollStopped) return;
        if (typeof window === "undefined" || !window.$axios) return;
        var span = this.STRIP_MIN * 6e4;
        var params = opts && opts.since > 0 ? { since: opts.since } : this.histPreloaded ? { since: this.histLastT } : { window_ms: span };
        this.histFetching = true;
        this.stripRpc(params).then(function(res) {
          self.histFetching = false;
          if (self.pollStopped || !res) return;
          self.histPreloaded = true;
          var fresh = [];
          var ns = res.samples || [];
          for (var i = 0; i < ns.length; i++) {
            var v = parseFloat(ns[i] && ns[i].rsrp);
            if (!isNaN(v) && ns[i].t) fresh.push({ t: ns[i].t, v, s: ns[i].slot });
          }
          self.histNow = res.now || Date.now();
          self.histNowAt = Date.now();
          var merged = fresh;
          if (params.since) {
            var have = {};
            for (var k = 0; k < self.hist.length; k++) have[self.hist[k].t] = 1;
            merged = self.hist.concat(fresh.filter(function(p) {
              return !have[p.t];
            })).sort(function(a, b) {
              return a.t - b.t;
            });
          }
          var cut = self.histNow - span;
          self.hist = merged.filter(function(p) {
            return p.t >= cut;
          });
          if (ns.length) {
            var newest = ns[ns.length - 1].t;
            if (newest > self.histLastT) self.histLastT = newest;
          }
        });
      },
      // A live sample from the collector (mudimodem.collect push): append it to
      // the strip history exactly as get_history would have returned it. The box
      // stamped `t`, so it slots into the box-time axis directly; the box clock
      // reference advances with it (no round-trip to re-sync).
      onSamplePush(s) {
        if (!s || !s.t) return;
        if (s.t <= this.histLastT) return;
        var prevT = this.histLastT;
        if (!s.stale) this.pushSeenAt = Date.now();
        this.histLastT = s.t;
        this.histNow = s.t;
        this.histNowAt = Date.now();
        var v = parseFloat(s.rsrp);
        if (!isNaN(v)) this.hist.push({ t: s.t, v, s: s.slot });
        var cut = s.t - this.STRIP_MIN * 6e4;
        if (this.hist.length && this.hist[0].t < cut) {
          this.hist = this.hist.filter(function(p) {
            return p.t >= cut;
          });
        }
        if (this.histPreloaded && prevT > 0 && !s.stale && s.t - prevT > this.STRIP_HOLE_MS)
          this.fetchStripHistory({ since: prevT });
      },
      startStrip() {
        var self = this;
        if (this.histTimer || typeof window === "undefined") return;
        this.fetchStripHistory();
        this.histTimer = setInterval(function() {
          if (Date.now() - self.pushSeenAt > self.STRIP_STALL_MS) self.fetchStripHistory();
        }, this.STRIP_POLL_MS);
      },
      startStripPoll() {
        this.startStrip();
      },
      // legacy name (tests),
      stopStripPoll() {
        if (this.histTimer) {
          clearInterval(this.histTimer);
          this.histTimer = null;
        }
      },
      // "Now" on the BOX's clock: the last reply's os.time() advanced by however
      // long ago it landed. Used for both ends of the x-axis so the window is
      // sized in box time, matching the timestamps being plotted.
      stripEnd() {
        if (!this.histNow) return Date.now();
        return this.histNow + (Date.now() - this.histNowAt);
      },
      // Collector points inside the visible window (may be empty: the line is
      // simply not drawn until two samples exist).
      stripPoints() {
        var end = this.stripEnd(), start = end - this.STRIP_MIN * 6e4;
        return this.hist.filter(function(p) {
          return p.t >= start;
        });
      },
      // RSRP field-test base is −120…−80 dBm. Expand (never shrink) when a point
      // sits outside so a strong signal isn't clamped flat to the top of the strip
      // — same rule as Tracking's domainFor. Absolute scale stays absolute for
      // in-range data; noise is not auto-zoomed into a full-height wiggle.
      stripRsrpDomain(vals) {
        var FLOOR = -120, CEIL = -80;
        for (var i = 0; i < vals.length; i++) {
          var v = vals[i];
          if (v == null || v === "" || isNaN(v)) continue;
          v = +v;
          if (v < FLOOR) FLOOR = v;
          if (v > CEIL) CEIL = v;
        }
        return [FLOOR, CEIL];
      },
      stripAxisDomain() {
        return this.stripRsrpDomain(this.stripPoints().map(function(p) {
          return p.v;
        }));
      },
      // x (0..320) of a BOX-clock instant on the strip, or null when it is outside the window.
      stripX(tBox) {
        if (tBox == null) return null;
        var span = this.STRIP_MIN * 6e4, end = this.stripEnd(), start = end - span;
        if (tBox < start || tBox > end) return null;
        return (tBox - start) / span * 320;
      },
      // The pending change's moment on the trace: a dashed line, so "did it get better after
      // this?" is answered where the eye already is.
      applyMark(h) {
        var p = this.pending;
        var x = p && !p.done ? this.stripX(p.appliedBox) : null;
        if (x == null) return null;
        return h("line", { attrs: {
          x1: x.toFixed(1),
          x2: x.toFixed(1),
          y1: "0",
          y2: "40",
          stroke: "var(--warning)",
          "stroke-width": "1",
          "stroke-dasharray": "3 2",
          "vector-effect": "non-scaling-stroke"
        } });
      },
      tracePath() {
        var pts = this.stripPoints();
        return pts.length >= 2 ? this.tracePathTimed(pts) : "";
      },
      // Daemon path: x is real time across [now-window, now], so an outage or a
      // stopped collector leaves a visible hole instead of a straight line drawn
      // across it.
      tracePathTimed(pts) {
        var dom = this.stripRsrpDomain(pts.map(function(p) {
          return p.v;
        }));
        var FLOOR = dom[0], CEIL = dom[1], W = 320, H = 40, ySpan = CEIL - FLOOR;
        var span = this.STRIP_MIN * 6e4, end = this.stripEnd(), start = end - span;
        var d = "", prev = null, prevSim = null;
        for (var i = 0; i < pts.length; i++) {
          var t2 = pts[i].t, sim = pts[i].s;
          var x = (t2 - start) / span * W;
          if (x < 0) x = 0;
          else if (x > W) x = W;
          var cl = Math.max(FLOOR, Math.min(CEIL, pts[i].v));
          var y = ySpan ? H - (cl - FLOOR) / ySpan * H : H / 2;
          var newSim = sim != null && prevSim != null && String(sim) !== String(prevSim);
          d += (prev === null || t2 - prev > this.STRIP_GAP_MS || newSim ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
          prev = t2;
          if (sim != null) prevSim = sim;
        }
        return d;
      }
    }
  };

  // src/web/main/change.js
  function modeName(m) {
    return t({ AUTO: "Auto", NR5G: "5G only", LTE: "4G only" }[m] || m);
  }
  var change_default = {
    data() {
      return {
        pending: null,
        // { kind, window, applied, remaining } after Apply/Lock
        cdTimer: null
        // countdown interval handle
      };
    },
    methods: {
      // kind defaults to "bands" so the existing bands call sites keep working
      // unchanged; the cell-lock flow passes "cell" so the banner + refetch land
      // on the right tab (§renderRevert / renderBands / renderLock).
      // ---- confirm-or-revert, as the BOX sees it ----------------------------------------------
      // The countdown runs to the watchdog's real deadline on the box clock (change_status /
      // set_* replies carry `deadline` + `now`), so it survives a reload, a tab switch and a phone
      // that slept; Keep / Revert report what actually happened instead of assuming.
      startCountdown(window_s, applied, kind, clock) {
        var self = this;
        this.clearCountdown();
        var w = window_s || 60;
        var end = Date.now() + w * 1e3;
        var appliedBox = null;
        if (clock && typeof clock.deadline === "number" && typeof clock.now === "number") {
          end = Date.now() + (clock.deadline - clock.now) * 1e3;
          appliedBox = (clock.deadline - w) * 1e3;
        } else if (this.histNow) appliedBox = Date.now() + (this.histNow - this.histNowAt);
        var before = clock && clock.before || this.pictureOf(this.serving);
        this.pending = {
          kind: kind || "bands",
          window: w,
          applied,
          done: false,
          end,
          appliedBox,
          before,
          remaining: Math.max(0, Math.ceil((end - Date.now()) / 1e3)),
          keeping: false,
          reverting: false,
          expiring: false,
          keepError: "",
          revertError: ""
        };
        this.cdTimer = setInterval(function() {
          var p = self.pending;
          if (!p || p.done || p.end == null) return;
          p.remaining = Math.max(0, Math.ceil((p.end - Date.now()) / 1e3));
          if (p.remaining <= 0 && !p.expiring) {
            self.patchPending({ expiring: true });
            self.awaitWatchdog(0);
          }
        }, 1e3);
      },
      clearCountdown() {
        if (this.cdTimer) {
          clearInterval(this.cdTimer);
          this.cdTimer = null;
        }
      },
      patchPending(o) {
        if (this.pending) this.pending = Object.assign({}, this.pending, o);
      },
      refetchAfterChange(kind) {
        if (kind === "cell") {
          this.fetchLock();
          this.fetchBands({ light: true });
        } else this.fetchBands();
      },
      // The deadline passed: ask the box what the watchdog did instead of assuming it reverted.
      awaitWatchdog(tries) {
        var self = this;
        if (typeof window === "undefined" || !window.$axios) {
          var k0 = this.pending && this.pending.kind;
          this.clearCountdown();
          this.pending = { kind: k0, done: true, unknown: true };
          return;
        }
        this.rpcSilent("change_status", {}, 8e3).then(function(res) {
          var p = self.pending;
          if (!p || p.done || self.pollStopped) return;
          if ((!res || res.pending) && tries < 10) {
            self.patchPending({ reverting: true });
            self.watchdogTimer = setTimeout(function() {
              self.awaitWatchdog(tries + 1);
            }, 3e3);
            return;
          }
          if (res && res.pending) {
            self.patchPending({ reverting: false, revertError: t("The auto-revert has not finished after 30 s - use Revert now, or the ssh panic restore.") });
            return;
          }
          var k = p.kind;
          self.clearCountdown();
          self.pending = { kind: k, done: true, reverted: !!res, unknown: !res };
          self.refetchAfterChange(k);
          self.doneTimer = setTimeout(function() {
            if (self.pending && self.pending.done) self.pending = null;
          }, 5e3);
        });
      },
      // Pick up a change that is pending on the box (page load, another tab, a dropped reply).
      // `tries` > 0 keeps asking while the box is unreachable (the apply's redial drops the link).
      restoreChange(tries) {
        var self = this;
        if (typeof window === "undefined" || !window.$axios) return;
        this.rpcSilent("change_status", {}, 8e3).then(function(res) {
          if (self.pollStopped) return;
          if (!res) {
            if (tries > 0) self.restoreTimer = setTimeout(function() {
              self.restoreChange(tries - 1);
            }, 2500);
            return;
          }
          var q = res.pending, p = self.pending;
          if (q) {
            if (p && !p.done && p.end != null) return;
            if (typeof q.deadline === "number")
              self.startCountdown(
                q.window || 60,
                q.applied || p && p.applied || {},
                q.kind,
                { deadline: q.deadline, now: res.now, before: q.before }
              );
            else if (!p)
              self.pending = { kind: q.kind, applied: q.applied || {}, uncertain: true, window: 60, remaining: 60 };
          } else if (p && p.uncertain) {
            self.pending = null;
            self.applyError = t("The connection dropped while applying, and nothing is pending on the router now - the change did not take, or was already reverted.");
          }
        });
      },
      keepBands() {
        var self = this, p = this.pending;
        if (!p || p.done || p.keeping || p.reverting) return;
        var k = p.kind;
        this.patchPending({ keeping: true, keepError: "" });
        rpc("confirm", {}).then(function(res) {
          self.clearCountdown();
          if (res && res.was_pending === false) {
            self.pending = { kind: k, done: true, tooLate: true };
            self.doneTimer = setTimeout(function() {
              if (self.pending && self.pending.done) self.pending = null;
            }, 8e3);
          } else {
            self.pending = null;
          }
          self.refetchAfterChange(k);
        }).catch(function(e) {
          self.patchPending({ keeping: false, keepError: t(
            "Couldn't reach the router to keep it ({err}). The countdown is still running - press Keep again.",
            { err: e && (e.type || e.message) || "error" }
          ) });
        });
      },
      revertBands() {
        var self = this, p = this.pending;
        if (!p || p.done || p.keeping || p.reverting) return;
        var k = p.kind;
        this.patchPending({ reverting: true, revertError: "" });
        rpcJob("revert_now", {}).then(function(res) {
          if (res && res.error) {
            self.patchPending({ reverting: false, revertError: res.error });
            return;
          }
          self.clearCountdown();
          self.pending = { kind: k, done: true, reverted: true };
          self.refetchAfterChange(k);
          self.doneTimer = setTimeout(function() {
            if (self.pending && self.pending.done) self.pending = null;
          }, 4e3);
        }).catch(function(e) {
          self.patchPending({ reverting: false, revertError: t(
            "Couldn't reach the router to revert ({err}). The auto-revert is still armed.",
            { err: e && (e.type || e.message) || "error" }
          ) });
        });
      },
      // A sample reduced to what the banner compares: {t, registered, rat, band, pci, rsrp, sinr},
      // or null when there is none. Same shape as the router's BEFORE record.
      pictureOf(s) {
        if (!s || !s.t) return null;
        var num = function(v) {
          return v === null || v === void 0 || v === "" || isNaN(Number(v)) ? void 0 : Number(v);
        };
        return {
          t: s.t,
          registered: num(s.rsrp) !== void 0,
          rat: s.pcc_rat || s.mode,
          mode: s.mode,
          band: num(s.band),
          pci: num(s.pci),
          rsrp: num(s.rsrp),
          sinr: num(s.sinr)
        };
      },
      pictureText(x) {
        if (!x.registered) return t("no service");
        return [
          this.formatBand(x.rat, x.band),
          x.rsrp !== void 0 ? "RSRP " + x.rsrp : "",
          x.sinr !== void 0 ? "SINR " + x.sinr : "",
          x.pci !== void 0 ? "PCI " + x.pci : ""
        ].filter(function(v) {
          return v && v !== "—";
        }).join(" · ");
      },
      // "Before n71 · RSRP -99 · SINR 4 → now B66 · RSRP -105 · SINR 2": the change's effect in one
      // line, so judging Keep vs Revert needs no reading of the trace. "Now" is a sample taken
      // AFTER the change went out (until one arrives, the line says so).
      renderBeforeNow(h) {
        var p = this.pending, before = p.before;
        var s = this.serving, live = s && s.t && !s.stale && (p.appliedBox == null || s.t > p.appliedBox) ? this.pictureOf(s) : null;
        var now = live ? this.pictureText(live) : t("waiting for the next sample...");
        return h(
          "div",
          { staticClass: "mm-hint mm-beforenow", staticStyle: { marginTop: "6px" } },
          before ? tp("Before {b}  →  now {n}", { b: h("b", this.pictureText(before)), n: h("b", now) }) : tp("Now {n}", { n: h("b", now) })
        );
      },
      // Confirm-or-revert banner: page-wide, above the tab bar (render in index.js).
      revertButtons(h) {
        var self = this, p = this.pending, busy = p.keeping || p.reverting;
        return h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
          h("button", {
            staticClass: "mm-btn danger",
            attrs: { disabled: busy },
            on: { click: function() {
              self.revertBands();
            } }
          }, p.reverting ? "Reverting..." : "Revert now"),
          h("button", {
            staticClass: "mm-btn keep",
            attrs: { disabled: busy },
            on: { click: function() {
              self.keepBands();
            } }
          }, p.keeping ? "Keeping..." : "Keep")
        ]);
      },
      revertErrors(h) {
        var p = this.pending, msg = p.keepError || p.revertError;
        return msg ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--error)", marginTop: "6px" } }, msg) : null;
      },
      renderRevert(h) {
        var self = this, p = this.pending;
        if (p.done) {
          var doneMsg = p.reverting ? "Reverting..." : p.tooLate ? p.kind === "cell" ? "Too late to keep: the auto-revert had already restored your previous cell setting. Apply it again if you want it." : "Too late to keep: the auto-revert had already restored your previous bands. Apply it again if you want it." : p.unknown ? "Couldn't reach the router to see what the auto-revert did - reload once you're back online." : p.reverted ? p.kind === "cell" ? "Reverted - cell lock removed." : "Reverted - restored your previous bands." : "";
          return h("div", { staticClass: "mm-revert" }, [
            h("span", { staticClass: "mm-revert-row" }, doneMsg)
          ]);
        }
        if (p.verifying) {
          return h("div", { staticClass: "mm-revert" }, [
            h(
              "span",
              { staticClass: "mm-revert-row" },
              "Connection dropped while applying the lock - checking whether it took..."
            )
          ]);
        }
        if (p.uncertain) {
          var ua = p.applied || {};
          var what = p.kind === "cell" ? tp(
            "Your connection dropped while applying, but the {lock} did apply.",
            { lock: h("b", t("{rat} lock PCI {pci} / ARFCN {freq}", { rat: ua.rat === "4g" ? "LTE" : "5G", pci: ua.pci, freq: ua.freq })) }
          ) : tp(
            "Your connection dropped while applying, but the band change ({what}) most likely applied.",
            { what: h("b", ua.reset ? t("filtering off + Auto") : [ua.mode ? t("mode {m}", { m: modeName(ua.mode) }) : "", ua.sa ? " SA " + ua.sa : "", ua.nsa ? " NSA " + ua.nsa : "", ua.lte ? " LTE " + ua.lte : ""].join("").trim()) }
          );
          return h("div", { staticClass: "mm-revert" }, [
            h("div", { staticClass: "mm-revert-row" }, [
              h("span", what.concat([" "]).concat(
                tp(
                  "If the auto-revert is still running it will undo this within ~60s - {keep} to make it stick, or {revert} to remove it now.",
                  { keep: h("b", t("Keep")), revert: h("b", t("Revert")) }
                )
              )),
              this.revertButtons(h)
            ]),
            this.revertErrors(h)
          ]);
        }
        var a = p.applied || {}, bits = [];
        if (p.kind === "cell") {
          bits.push(t("{rat} cell PCI {pci} / ARFCN {freq}", { rat: a.rat === "4g" ? "LTE" : "5G", pci: a.pci, freq: a.freq }));
        } else if (a.reset) {
          bits.push(t("default: band filtering off, mode Auto"));
        } else {
          if (a.mode) bits.push(t("mode {m}", { m: modeName(a.mode) }));
          if (a.sa) bits.push("5G-SA " + a.sa.split(":").map(function(b) {
            return "n" + b;
          }).join(" "));
          if (a.nsa) bits.push("5G-NSA " + a.nsa.split(":").map(function(b) {
            return "n" + b;
          }).join(" "));
          if (a.lte) bits.push("LTE " + a.lte.split(":").map(function(b) {
            return "B" + b;
          }).join(" "));
        }
        var pct = Math.max(0, Math.min(100, p.remaining / p.window * 100));
        return h("div", { staticClass: "mm-revert" }, [
          h("div", { staticClass: "mm-revert-row" }, [
            h("span", p.expiring ? tp(
              "Applied {what}. Time's up - the auto-revert is restoring your previous settings...",
              { what: h("b", bits.join("; ") || t("band change")) }
            ) : tp(
              "Applied {what}. Reverting in {s} unless you keep it.",
              {
                what: h("b", bits.join("; ") || t("band change")),
                s: h("b", { staticClass: "mm-cd" }, String(p.remaining) + "s")
              }
            )),
            this.revertButtons(h)
          ]),
          h("div", { staticClass: "mm-bar" }, [h("i", { staticStyle: { width: pct.toFixed(1) + "%" } })]),
          this.renderBeforeNow(h),
          this.revertErrors(h)
        ]);
      }
    }
  };

  // src/web/main/bands.js
  var bands_default = {
    data() {
      return {
        bands: null,
        // get_bands result, once fetched
        bandsLoading: false,
        bandsSeq: 0,
        // bumps per fetch; a reply from an older one is dropped
        seenSlot: null,
        // last real active slot (current_sim_slot) this page saw
        bandsError: "",
        sel: { sa: null, nsa: null, LTE: null },
        // desired allowlists per editable RAT
        selMode: null,
        // desired network mode (AUTO | NR5G | LTE)
        selNr5g: null,
        // desired 5G method: both | nsa (SA off) | sa (NSA off)
        bandSlot: null,
        // null = the SIM in use; a slot number = the standby SIM being edited
        storedNote: "",
        // the note shown after a standby write
        applying: false,
        // Apply in flight
        applyError: "",
        resetNote: "",
        // transient feedback from "Apply defaults"
        resetTimer: null
        // handle clearing resetNote
      };
    },
    methods: {
      // Fetch the three-layer band model from our backend.
      // opts.light: after a cell-lock action only GL's store can have changed
      // (network_mode, the tower badge) — policy/capability (2-3 AT reads) cannot
      // — so ask for config+meta only (zero AT) and merge them into the model
      // already held. Falls back to a full fetch when there is no model yet.
      fetchBands(opts) {
        var self = this;
        var light = !!(opts && opts.light) && !!this.bands;
        if (!hasRpc()) {
          this.bandsError = "RPC helper unavailable";
          return;
        }
        if (!light) {
          this.bandsLoading = true;
          this.bandsError = "";
        }
        this.clearResetNote();
        var seq = ++this.bandsSeq;
        var args = light ? { light: 1 } : {};
        if (this.bandSlot != null) args.slot = this.bandSlot;
        rpc("get_bands", args, { timeout: 15e3 }).then(function(res) {
          if (seq !== self.bandsSeq) return;
          if (!res || res.error || !res.config) {
            if (!light) self.bandsError = res && res.error || "request failed";
            return;
          }
          if (light) {
            if (!self.bands) return;
            self.bands.config = res.config;
            self.bands.meta = Object.assign({}, self.bands.meta, res.meta);
          } else {
            self.bands = res;
          }
          self.sel = { sa: self.seedFor("sa"), nsa: self.seedFor("nsa"), LTE: self.seedFor("LTE") };
          self.selMode = res.meta && res.meta.mode || "AUTO";
          self.selNr5g = res.config && res.config.nr5g || "both";
        }).catch(function(e) {
          if (seq !== self.bandsSeq) return;
          if (!light) self.bandsError = e && (e.type || e.message) || "request failed";
        }).then(function() {
          if (!light && seq === self.bandsSeq) self.bandsLoading = false;
        });
      },
      seedFor(group) {
        var cfg = this.bands.config && this.bands.config[group] || [];
        var pol = this.bands.policy && this.bands.policy[group] || [];
        return (cfg.length ? cfg : pol).slice();
      },
      // The interactive RATs (each maps to a set_bands arg).
      interactive(group) {
        return group === "sa" || group === "nsa" || group === "LTE";
      },
      argKey(group) {
        return group === "LTE" ? "lte" : group;
      },
      // set_bands arg name,
      // Which RATs a given network mode actually enables (NSA needs an LTE anchor).
      modeEnables(group, mode) {
        if (group === "sa") return mode === "AUTO" || mode === "NR5G";
        if (group === "nsa") return mode === "AUTO";
        if (group === "LTE") return mode === "AUTO" || mode === "LTE";
        return false;
      },
      ratActive(group) {
        return this.modeEnables(group, this.selMode);
      },
      appliedMode() {
        return this.bands && this.bands.meta && this.bands.meta.mode || "AUTO";
      },
      // Would `mode` strand the active lock? Reuse the band-group RAT gate:
      // a 4g lock needs LTE enabled, a 5g lock needs SA enabled.
      modeStrands(mode) {
        var lk = this.lockInfo();
        if (!lk) return false;
        return !this.modeEnables(lk.rat === "4g" ? "LTE" : "sa", mode);
      },
      lockConflict() {
        return this.modeStrands(this.appliedMode());
      },
      setMode(m) {
        if (this.pending) return;
        if (this.modeStrands(m) && m !== this.appliedMode()) return;
        this.clearResetNote();
        this.selMode = m;
      },
      modeChanged() {
        return this.bands && this.selMode !== (this.bands.meta && this.bands.meta.mode || "AUTO");
      },
      // The 5G method (SA + NSA / NSA only / SA only): GL turns an empty NR-SA list into
      // nr5g_disable_mode 1 and an empty NR-NSA list into 2 (measured by running GL itself).
      appliedNr5g() {
        return this.bands && this.bands.config && this.bands.config.nr5g || "both";
      },
      nr5gChanged() {
        return !!this.bands && this.selMode !== "LTE" && (this.selNr5g || "both") !== this.appliedNr5g();
      },
      offByMethod(group) {
        return this.selMode !== "LTE" && (this.selNr5g === "nsa" && group === "sa" || this.selNr5g === "sa" && group === "nsa");
      },
      setNr5g(m) {
        if (this.pending) return;
        this.selNr5g = m;
        this.applyError = "";
      },
      // The SIM not in use, when there is one: its bands can be edited and are stored, then applied by
      // GL the next time it connects (SIM switch / failover) — docs/knowledge.md §4.2.
      standbySlot() {
        var self = this;
        var other = (this.networks || []).filter(function(n) {
          return String(n.slot) !== String(self.activeSlot) && (n.iccid || n.imsi);
        })[0];
        return other ? Number(other.slot) : null;
      },
      editStandby(on) {
        if (this.pending || this.applying) return;
        this.bandSlot = on ? this.standbySlot() : null;
        this.storedNote = "";
        this.applyError = "";
        this.bands = null;
        this.fetchBands();
      },
      // Only policy-permitted bands are selectable; blocked ones never take.
      selectable(group, b) {
        if (!this.interactive(group) || !this.bands) return false;
        return (this.bands.policy[group] || []).indexOf(b) !== -1;
      },
      isSelected(group, b) {
        var s = this.sel[group];
        return s && s.indexOf(b) !== -1;
      },
      toggleBand(group, b) {
        if (this.pending || !this.sel[group]) return;
        this.clearResetNote();
        var i = this.sel[group].indexOf(b);
        if (i === -1) this.sel[group].push(b);
        else this.sel[group].splice(i, 1);
      },
      selectAll(group) {
        if (this.pending || !this.bands) return;
        this.clearResetNote();
        this.sel[group] = (this.bands.policy[group] || []).slice();
      },
      selectNone(group) {
        if (this.pending) return;
        this.clearResetNote();
        this.sel[group] = [];
      },
      invertSel(group) {
        if (this.pending || !this.bands) return;
        this.clearResetNote();
        var perm = this.bands.policy[group] || [], cur = this.sel[group] || [];
        this.sel[group] = perm.filter(function(b) {
          return cur.indexOf(b) === -1;
        });
      },
      resetDefault() {
        if (this.applying) return;
        if (this.pending) return this.flashReset("A change is already pending - Keep or Revert it first.");
        if (!this.bands) return this.flashReset("Bands haven't loaded yet - hit refresh.");
        this.applyError = "";
        this.applyBands({ reset: true });
        this.flashReset(this.bands.config && this.bands.config.enable === false && this.appliedMode() === "AUTO" ? "Already at the default - re-sending 'filtering off + Auto' to the modem anyway." : "Sending the default to the modem: band filtering off + Auto mode.");
      },
      // Transient one-line feedback under the Bands footer. Any later edit clears
      // it, so the note never describes a state the user has since moved off.
      flashReset(msg) {
        var self = this;
        this.clearResetNote();
        this.resetNote = msg;
        this.resetTimer = setTimeout(function() {
          self.resetNote = "";
          self.resetTimer = null;
        }, 8e3);
      },
      clearResetNote() {
        if (this.resetTimer) {
          clearTimeout(this.resetTimer);
          this.resetTimer = null;
        }
        this.resetNote = "";
      },
      changed(group) {
        if (!this.bands || !this.sel[group]) return false;
        var cur = this.seedFor(group).sort(function(a, b) {
          return a - b;
        });
        var sel = this.sel[group].slice().sort(function(a, b) {
          return a - b;
        });
        if (cur.length !== sel.length) return true;
        for (var i = 0; i < cur.length; i++) if (cur[i] !== sel[i]) return true;
        return false;
      },
      // A group edit that would actually be SENT: under 4G-only the NR groups are
      // never sent (GL empties them in its store under LTE mode, so "applying"
      // them would be a lie the countdown then repeats). They stay edited in the
      // grid and go out once the mode includes them.
      sendable(group) {
        return this.changed(group) && !(this.selMode === "LTE" && group !== "LTE") && !this.offByMethod(group);
      },
      changedAny() {
        return this.sendable("sa") || this.sendable("nsa") || this.sendable("LTE") || this.modeChanged() || this.nr5gChanged();
      },
      emptyChange() {
        return this.sendable("sa") && this.sel.sa.length === 0 || this.sendable("nsa") && this.sel.nsa.length === 0 || this.sendable("LTE") && this.sel.LTE.length === 0;
      },
      // opts.reset=true sends GL's default (filtering off + AUTO) instead of the
      // grid — the "Apply defaults" contract: press it and the modem is written,
      // so the result is never ambiguous. Still confirm-or-revert. Otherwise only
      // the changed groups + mode go out; the backend keeps the rest as-is.
      applyBands(opts) {
        var self = this;
        var reset = !!(opts && opts.reset);
        if (this.applying || this.pending) return;
        if (!reset && (!this.changedAny() || this.emptyChange())) return;
        if (!hasRpc()) return;
        var payload = {};
        if (reset) payload.reset = true;
        else {
          var include = function(group, key) {
            if (self.sendable(group)) payload[key] = (self.sel[group] || []).slice();
          };
          include("sa", "sa");
          include("nsa", "nsa");
          include("LTE", "lte");
          if (this.modeChanged()) payload.mode = this.selMode;
          if (this.nr5gChanged()) payload.nr5g = this.selNr5g;
        }
        var slot = this.slotOf(this.bands);
        if (slot !== void 0) payload.slot = slot;
        var standby = this.bandSlot != null;
        if (standby) {
          payload.standby = true;
          payload.slot = this.bandSlot;
        }
        this.applying = true;
        this.applyError = "";
        this.clearResetNote();
        rpc("set_bands", payload, { timeout: 2e4 }).then(function(res) {
          if (!res || res.error) {
            self.applyError = res && res.error || "apply failed";
            if (self.onStaleSlot(res)) self.applyError = res.error;
            return;
          }
          if (res.stored) {
            self.storedNote = t("Stored for SIM {n}. GL applies it the next time SIM {n} connects.", { n: res.slot });
            self.fetchBands();
            return;
          }
          self.startCountdown(res.window || 60, res.applied, "bands", res);
        }).catch(function(e) {
          var t2 = e && (e.type || e.message);
          if (t2 === "invalidParams" || t2 === "accessDenied") {
            self.applyError = t2;
            return;
          }
          if (standby) {
            self.applyError = t2 || "request failed";
            return;
          }
          var a = { mode: payload.mode };
          if (payload.reset) a.reset = true;
          if (payload.sa) a.sa = payload.sa.join(":");
          if (payload.nsa) a.nsa = payload.nsa.join(":");
          if (payload.lte) a.lte = payload.lte.join(":");
          self.clearCountdown();
          self.pending = { kind: "bands", applied: a, uncertain: true, window: 60, remaining: 60 };
          self.restoreChange(24);
        }).then(function() {
          self.applying = false;
        });
      },
      // Classify one band for the read-only groups: active / permitted / blocked.
      bandState(group, b) {
        var d = this.bands;
        var has = function(list, x) {
          return (list || []).indexOf(x) !== -1;
        };
        if (has(d.capability[group], b)) return "active";
        if (has(d.policy[group], b)) return "permitted";
        return "blocked";
      },
      // ---- strip trace, fed by mudimodem-collectd via get_history ----,
      // ---- band grid render helpers ----
      // sa + LTE are interactive (set_bands writes them); nsa stays read-only.
      renderGroup(h, group, title) {
        var self = this, d = this.bands;
        var interactive = this.interactive(group);
        var supported = (d.supported[group] || []).slice();
        supported.sort(function(a, b) {
          var fa = self.freqOf(group, a), fb = self.freqOf(group, b);
          if (fa === void 0) fa = 1e9;
          if (fb === void 0) fb = 1e9;
          return fa - fb || a - b;
        });
        if (supported.length === 0) return null;
        var pre = this.prefixOf(group);
        var servingHere = {};
        self.servingBands.forEach(function(sb) {
          if (sb.group === group) servingHere[sb.band] = sb.role;
        });
        var chips = supported.map(function(b) {
          var serving = servingHere[b] !== void 0;
          var f = self.freqOf(group, b);
          var cls, tip;
          if (interactive) {
            if (!self.selectable(group, b)) {
              cls = "blocked";
              tip = t("{b} blocked by carrier policy; selecting has no effect", { b: pre + b });
            } else if (self.isSelected(group, b)) {
              cls = "sel";
              tip = t("{b} allowed (click to remove)", { b: pre + b });
            } else {
              cls = "unsel";
              tip = t("{b} permitted (click to allow)", { b: pre + b });
            }
          } else {
            var st = self.bandState(group, b);
            cls = st;
            tip = pre + b + " " + t({ active: "in use", permitted: "permitted, not active", blocked: "blocked by carrier policy" }[st]);
          }
          var clickable = interactive && cls !== "blocked" && !self.pending;
          if (serving) tip += " — " + t("serving now ({role})", { role: servingHere[b] });
          return h("span", {
            key: b,
            staticClass: "mm-band " + cls + (serving ? " serving" : "") + (clickable ? " clickable" : ""),
            attrs: { title: tip },
            on: clickable ? { click: function() {
              self.toggleBand(group, b);
            } } : {}
          }, [h("b", pre + b), h("s", f ? String(f) : " ")]);
        });
        var actions = null;
        if (interactive && !this.pending) {
          var mkAct = function(label, fn) {
            return h("button", { staticClass: "mm-act", on: { click: fn } }, label);
          };
          actions = h("span", { staticClass: "mm-acts" }, [
            mkAct("All", function() {
              self.selectAll(group);
            }),
            mkAct("None", function() {
              self.selectNone(group);
            }),
            mkAct("Invert", function() {
              self.invertSel(group);
            })
          ]);
        }
        var counts = t("{s} supported / {p} permitted / {a} active", {
          s: (d.supported[group] || []).length,
          p: (d.policy[group] || []).length,
          a: (d.capability[group] || []).length
        });
        var gate = null;
        if (interactive && !this.ratActive(group)) {
          var need = t(group === "nsa" ? "Auto" : group === "LTE" ? "Auto or 4G only" : "Auto or 5G only");
          var modeName2 = t({ AUTO: "Auto", NR5G: "5G only", LTE: "4G only" }[this.selMode] || this.selMode);
          gate = h(
            "div",
            { staticClass: "mm-gate" },
            this.selMode === "LTE" && group !== "LTE" ? t("Off under {mode} - 5G selections are not sent (GL clears them under 4G-only). Set the mode to {need} to use them.", { mode: modeName2, need }) : t("Off under {mode} - these won't apply. Set the mode to {need} to use them.", { mode: modeName2, need })
          );
        }
        if (interactive && !gate && this.offByMethod(group)) {
          gate = h("div", { staticClass: "mm-gate" }, this.selNr5g === "nsa" ? "Off: 5G NSA only - SA is turned off, so these bands are not used." : "Off: 5G SA only - NSA is turned off, so these bands are not used.");
        }
        return h("div", { staticClass: "mm-grp" + (gate ? " mm-grp-off" : ""), key: group }, [
          h("div", { staticClass: "mm-grp-h" }, [
            h("span", { staticClass: "mm-grp-t" }, interactive ? t(title) : t("{title} (read-only)", { title: t(title) })),
            // interactive groups show the counts on their own line below; never twice
            actions || (interactive ? null : h("span", { staticClass: "mm-hint" }, counts))
          ]),
          interactive ? h("div", { staticClass: "mm-hint", staticStyle: { margin: "-3px 0 6px" } }, counts) : null,
          gate,
          h("div", { staticClass: "mm-wrap" }, chips),
          h("div", { staticClass: "mm-axis2" }, [
            h("span", "low band, reaches far"),
            h("span", "high band, fast + short range")
          ])
        ]);
      },
      // The network-mode selector (Auto / 5G only / 4G only).
      renderMode(h) {
        var self = this, cur = this.selMode;
        var opts = [["AUTO", "Auto"], ["NR5G", "5G only"], ["LTE", "4G only"]];
        return h("div", { staticClass: "mm-grp" }, [
          h("div", { staticClass: "mm-grp-h" }, [
            h("span", { staticClass: "mm-grp-t" }, "Network mode"),
            this.modeChanged() ? h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)" } }, "changed") : h("span", { staticClass: "mm-hint" }, "which radios the modem may use")
          ]),
          h("div", { staticClass: "mm-seg" }, opts.map(function(o) {
            var blocked = self.modeStrands(o[0]) && o[0] !== self.appliedMode();
            return h("button", {
              key: o[0],
              staticClass: "mm-seg-b" + (cur === o[0] ? " on" : ""),
              attrs: {
                disabled: !!self.pending || blocked,
                title: blocked ? t("Would strand your {rat} cell lock - clear the lock first", { rat: self.lockInfo().rat === "4g" ? "LTE" : "5G" }) : void 0
              },
              on: { click: function() {
                self.setMode(o[0]);
              } }
            }, o[1]);
          }))
        ]);
      },
      // The 5G method selector. Hidden under 4G-only (no 5G at all); under 5G-only, "NSA only" is
      // refused: GL re-sends mode_pref NR5G after the apply, and NSA needs an LTE anchor.
      renderNr5g(h) {
        var self = this;
        if (this.selMode === "LTE") return null;
        var opts = [["both", "SA + NSA"], ["nsa", "NSA only"], ["sa", "SA only"]];
        return h("div", { staticClass: "mm-grp" }, [
          h("div", { staticClass: "mm-grp-h" }, [
            h("span", { staticClass: "mm-grp-t" }, "5G"),
            this.nr5gChanged() ? h("span", { staticClass: "mm-hint", staticStyle: { color: "var(--warning)" } }, "changed") : h("span", { staticClass: "mm-hint" }, "standalone, non-standalone, or both")
          ]),
          h("div", { staticClass: "mm-seg" }, opts.map(function(o) {
            var blocked = o[0] === "nsa" && self.selMode === "NR5G";
            return h("button", {
              key: o[0],
              staticClass: "mm-seg-b" + ((self.selNr5g || "both") === o[0] ? " on" : ""),
              attrs: {
                disabled: !!self.pending || blocked,
                title: blocked ? t("NSA needs LTE: choose Auto to use NSA only") : void 0
              },
              on: { click: function() {
                self.setNr5g(o[0]);
              } }
            }, o[1]);
          }))
        ]);
      },
      // Which SIM's bands this panel edits: the one in use (confirm-or-revert) or the standby one
      // (stored, applied by GL when that SIM next connects). Only with two SIMs.
      renderSimPick(h) {
        var self = this, other = this.standbySlot();
        if (other == null && this.bandSlot == null) return null;
        var on = this.bandSlot != null;
        return h("div", { staticClass: "mm-seg", staticStyle: { marginBottom: "10px" } }, [
          h("button", {
            staticClass: "mm-seg-b" + (on ? "" : " on"),
            attrs: { disabled: !!this.pending || this.applying },
            on: { click: function() {
              if (on) self.editStandby(false);
            } }
          }, t("SIM {n} (in use)", { n: this.activeSlot })),
          h("button", {
            staticClass: "mm-seg-b" + (on ? " on" : ""),
            attrs: { disabled: !!this.pending || this.applying || other == null },
            on: { click: function() {
              if (!on) self.editStandby(true);
            } }
          }, t("SIM {n} (standby)", { n: on ? this.bandSlot : other }))
        ]);
      },
      renderBands(h) {
        if (this.bandsLoading) return h("div", { staticClass: "mm-empty" }, "Reading band configuration from the modem...");
        if (this.bandsError) return h("div", { staticClass: "mm-empty" }, t("Couldn't read bands: {err}", { err: this.bandsError }));
        if (!this.bands) return h("div", { staticClass: "mm-empty" }, "...");
        var d = this.bands, self = this;
        var groups = [
          this.renderMode(h),
          this.renderNr5g(h),
          this.renderGroup(h, "sa", "5G NR standalone"),
          this.renderGroup(h, "nsa", "5G NR non-standalone"),
          this.renderGroup(h, "LTE", "LTE")
        ].filter(Boolean);
        var op = d.meta && d.meta.plmn ? d.meta.plmn : "";
        var warn = d.meta && d.meta.plmn_matched === false ? h(
          "div",
          { staticClass: "mm-hint", staticStyle: { color: "var(--warning)", marginTop: "2px" } },
          "Couldn't confirm which SIM answered - values may be for the other slot"
        ) : null;
        var modeWarn = d.meta && d.meta.mode_known === false ? h(
          "div",
          { staticClass: "mm-hint", staticStyle: { color: "var(--warning)", marginTop: "2px" } },
          t(`GL reports network mode "{mode}", which this panel doesn't offer - it stays as it is unless you pick a mode below.`, { mode: d.meta.mode_raw })
        ) : null;
        var lockWarn = this.lockConflict() ? h("div", { staticClass: "mm-revert" }, [
          h("div", { staticClass: "mm-revert-row", staticStyle: { display: "block", color: "var(--warning-hover)" } }, [
            h("b", t("⚠ Modem is cell-locked to {lock}, ", { lock: this.lockLabel() })),
            t("but the network mode is {mode} - the lock can't take effect. Set the mode to {need}, or clear the lock on the Cell lock tab.", {
              mode: t({ NR5G: "5G only", LTE: "4G only", AUTO: "Auto" }[this.appliedMode()] || this.appliedMode()),
              need: t(this.lockInfo().rat === "4g" ? "Auto or 4G only" : "Auto or 5G only")
            })
          ])
        ]) : null;
        var head = [
          h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, [
            h("span", { staticClass: "mm-sect" }, "Bands"),
            h("span", [
              h("span", { staticClass: "mm-hint", staticStyle: { marginRight: "10px" } }, op ? t("carrier {plmn}", { plmn: op }) : ""),
              h("button", {
                staticClass: "mm-tab",
                staticStyle: { fontSize: "11.5px", padding: "2px 0", borderBottom: "0" },
                attrs: { disabled: !!this.pending },
                on: { click: function() {
                  if (!self.pending) self.fetchBands();
                } }
              }, self.bandsLoading ? "refreshing..." : "refresh")
            ])
          ]),
          h(
            "div",
            { staticClass: "mm-hint", staticStyle: { margin: "3px 0 12px" } },
            "Choose the network mode and which 5G/LTE bands the modem may use. Blocked bands are ones the module supports but your carrier forbids - they can't be selected because they never take."
          ),
          this.renderSimPick(h),
          this.bandSlot != null ? h("div", { staticClass: "mm-note", staticStyle: { marginBottom: "10px" } }, t("Editing SIM {n}, which is not in use. Changes are stored and GL applies them the next time SIM {n} connects (a SIM switch or failover) - without the 60 s revert, since nothing changes now.", { n: this.bandSlot })) : null,
          warn,
          modeWarn,
          lockWarn,
          null
          // the pending banner is page-wide (render), not per tab
        ];
        var footer = [];
        if (!this.pending) {
          var changed = this.changedAny();
          var empty = this.emptyChange();
          var status;
          if (this.applyError) status = h("span", { staticStyle: { color: "var(--error)" } }, this.applyError);
          else if (empty) status = h("span", { staticStyle: { color: "var(--error)" } }, "Each edited band group needs at least one band");
          else if (changed) {
            var parts = [];
            if (this.modeChanged()) parts.push(t("mode -> {m}", { m: t({ AUTO: "Auto", NR5G: "5G only", LTE: "4G only" }[this.selMode] || this.selMode) }));
            if (this.selMode === "LTE" && (this.changed("sa") || this.changed("nsa")))
              parts.push(t("5G selections held back under 4G-only"));
            if (this.changed("sa")) parts.push(this.sel.sa.length + " SA");
            if (this.changed("nsa")) parts.push(this.sel.nsa.length + " NSA");
            if (this.changed("LTE")) parts.push(this.sel.LTE.length + " LTE");
            if (this.nr5gChanged()) parts.push(t({ both: "5G SA + NSA", nsa: "5G NSA only", sa: "5G SA only" }[this.selNr5g]));
            status = this.bandSlot != null ? t("{what} changed; stored for SIM {n}", { what: parts.join(" + "), n: this.bandSlot }) : t("{what} changed; applies with a 60s revert", { what: parts.join(" + ") }) + " " + t("The link drops for a few seconds while the modem re-registers.");
          } else status = "No changes";
          footer.push(h("div", { staticClass: "mm-foot" }, [
            h("span", { staticClass: "mm-hint" }, [status]),
            h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
              h("button", {
                staticClass: "mm-btn",
                attrs: { disabled: this.applying, title: "Writes GL's default to the modem now: band filtering off + Auto mode (60s revert)" },
                on: { click: function() {
                  self.resetDefault();
                } }
              }, "Apply defaults"),
              h("button", {
                staticClass: "mm-btn primary",
                attrs: { disabled: !changed || this.applying || empty },
                on: { click: function() {
                  self.applyBands();
                } }
              }, this.applying ? "Applying..." : "Apply")
            ])
          ]));
          if (this.resetNote) footer.push(h("div", { staticClass: "mm-note" }, this.resetNote));
          if (this.storedNote) footer.push(h("div", { staticClass: "mm-note" }, this.storedNote));
        }
        var legend = [h("div", { staticClass: "mm-legend" }, [
          h("span", [h("i", { staticStyle: { background: "var(--success)" } }), "allowed"]),
          h("span", [h("i", { staticStyle: { background: "transparent", border: "1px solid var(--border)" } }), "permitted, not selected"]),
          h("span", [h("i", { staticStyle: { background: "var(--text-hint)" } }), "blocked by policy"]),
          h("span", "ring = serving now (every carrier: PCC + SCCs)")
        ])];
        return h("div", { staticClass: "mm-card" }, head.filter(Boolean).concat(groups).concat(footer).concat(legend));
      }
    }
  };

  // src/web/main/lock.js
  var lock_default = {
    data() {
      return {
        lockSeq: 0,
        // same, for get_lock
        lockData: null,
        // get_lock result, once fetched
        lockLoading: false,
        lockError: "",
        lockBusy: false,
        // a lock/unlock RPC in flight
        lockVerifying: false,
        // set_cell_lock dropped mid-flight; probing get_lock
        lockConfirm: null,
        // target awaiting inline confirm ({...target,label})
        scanConfirm: false,
        // explicit confirm gate before firing the disruptive scan
        // Scanned neighbour towers (Task 5 fills the scan card); pinTarget reads
        // scan.towers now to confirm an SCS reading when one is available.
        scan: { towers: [], running: false, error: "", ts: 0, slot: null },
        movedRefetched: "",
        // pci/arfcn of the last handover that triggered a re-read (once per cell)
        lockProbeTimer: null
        // verifyLockAfterDrop's next probe
      };
    },
    computed: {
      // The serving cell as the collector's latest push sees it, built the way get_lock builds its
      // own (rpc serving_from_sample): the PCC, or under EN-DC the NR leg. null when unknown/stale.
      liveCell() {
        var s = this.serving;
        if (!s || !s.t || s.stale) return null;
        if (/NSA/.test(s.rat || s.mode || "")) {
          var nr = (Array.isArray(s.signals) ? s.signals : []).filter(function(g) {
            return g && /NR5G/.test(g.rat || "") && g.pci != null && g.earfcn != null;
          })[0];
          return nr ? { slot: s.slot, pci: Number(nr.pci), arfcn: Number(nr.earfcn) } : null;
        }
        if (s.pci == null || s.tx_channel == null) return null;
        return { slot: s.slot, pci: Number(s.pci), arfcn: Number(s.tx_channel) };
      },
      // The Lock tab's picture names a cell the modem has since left (a handover after get_lock):
      // the cell it is on now, else null. Only for the same SIM — a slot switch re-reads anyway.
      servingMoved() {
        var d = this.lockData, s = d && d.serving, live = this.liveCell;
        if (!s || !live || s.pci == null || s.arfcn == null) return null;
        var slot = this.slotOf(d);
        if (slot !== void 0 && live.slot != null && Number(live.slot) !== slot) return null;
        return Number(s.pci) !== live.pci || Number(s.arfcn) !== live.arfcn ? live : null;
      }
    },
    watch: {
      // A handover while the lock picture is on screen: drop an armed "lock to this cell" and
      // re-read, once per new cell — the pin target must be the cell the modem is on now.
      servingMoved(m) {
        if (!m) return;
        if (this.lockConfirm && this.lockConfirm.pin) this.lockConfirm = null;
        if (this.tab !== "lock" || this.lockLoading || this.lockBusy || this.pending) return;
        var key = m.pci + "/" + m.arfcn;
        if (key === this.movedRefetched) return;
        this.movedRefetched = key;
        this.fetchLock();
      }
    },
    methods: {
      // Fetch the current cell-lock state (serving cell + any existing lock).
      fetchLock() {
        var self = this;
        if (!hasRpc()) {
          this.lockError = "RPC helper unavailable";
          return;
        }
        this.lockLoading = true;
        this.lockError = "";
        var seq = ++this.lockSeq;
        rpc("get_lock", {}, { timeout: 2e4 }).then(function(res) {
          if (seq !== self.lockSeq) return;
          if (!res || res.error) {
            self.lockError = res && res.error || "request failed";
            return;
          }
          self.lockData = res;
          var ls = res.last_scan;
          if (ls && Array.isArray(ls.towers) && !self.scan.running && (ls.ts || 0) > (self.scan.ts || 0))
            self.scan = { towers: ls.towers, running: false, error: "", ts: ls.ts || 0, slot: ls.slot != null ? Number(ls.slot) : null };
        }).catch(function(e) {
          if (seq === self.lockSeq) self.lockError = e && (e.type || e.message) || "request failed";
        }).then(function() {
          if (seq === self.lockSeq) self.lockLoading = false;
        });
      },
      // The slot a picture was read for (get_bands / get_lock meta.slot), sent
      // with every write so the backend can refuse one aimed at a SIM that is no
      // longer active. undefined when unknown (the backend then skips the check).
      slotOf(d) {
        var n = d && d.meta ? Number(d.meta.slot) : NaN;
        return isFinite(n) && n > 0 ? n : void 0;
      },
      // Active SIM changed: everything per-SIM on this page describes the other
      // one. Drop what can't be refetched (a scan, an armed confirm) and re-read
      // the rest. A pending change belongs to the old SIM and its watchdog — the
      // banner stays, and its own Keep/Revert refetch on completion.
      onSlotChange() {
        this.lockConfirm = null;
        this.scanConfirm = false;
        if (!this.scan.running) this.scan = { towers: [], running: false, error: "", ts: 0, slot: null };
        if (!this.nb.running) this.nb = { cells: [], running: false, error: "", ts: 0, slot: null, read: false };
        this.nbConfirm = null;
        this.applyError = "";
        this.clearResetNote();
        if (this.bands || this.bandsLoading) this.fetchBands();
        if (this.lockData || this.lockLoading || this.tab === "lock") this.fetchLock();
      },
      // A write the backend refused because the active SIM changed under the
      // page: re-read so the user sees the SIM that is actually active.
      onStaleSlot(res) {
        if (!res || !res.slot_changed) return false;
        this.onSlotChange();
        return true;
      },
      // Build the lock target for the serving cell. SCS: last scan result for
      // this pci+arfcn if we have one, else the band default (flagged assumed).
      pinTarget() {
        if (this.servingMoved) return null;
        var s = this.lockData && this.lockData.serving;
        if (!s || s.pci == null || s.arfcn == null) return null;
        var isNR = /NR5G/.test(s.rat || "");
        var t2 = {
          rat: isNR ? "5g" : "4g",
          pci: s.pci,
          freq: s.arfcn,
          band: s.band,
          label: "current cell PCI " + s.pci,
          slot: this.slotOf(this.lockData)
        };
        if (isNR) {
          var match = (this.scan.towers || []).filter(function(tw) {
            return String(tw.pci) === String(s.pci) && String(tw.freq) === String(s.arfcn);
          })[0];
          if (match && match.scs !== void 0) {
            t2.scs = Number(match.scs);
            t2.scsAssumed = false;
          } else {
            t2.scs = this.scsFor(s.band);
            t2.scsAssumed = true;
          }
          if (t2.scs === void 0) return null;
        }
        return t2;
      },
      lockCell(target) {
        var self = this;
        if (this.lockBusy || this.pending || !target) return;
        this.lockBusy = true;
        this.lockError = "";
        var args = { rat: target.rat, pci: target.pci, freq: target.freq };
        if (target.scs !== void 0) args.scs = target.scs;
        if (target.band !== void 0) args.band = target.band;
        if (target.extra) args.extra = target.extra;
        if (target.slot !== void 0) args.slot = target.slot;
        rpc("set_cell_lock", args, { timeout: 3e4 }).then(function(res) {
          if (!res || res.error) {
            self.lockError = res && res.error || "lock failed";
            if (self.onStaleSlot(res)) self.lockConfirm = null;
            return;
          }
          self.lockConfirm = null;
          self.startCountdown(res.window || 60, res.applied, "cell", res);
        }).catch(function(e) {
          var t2 = e && (e.type || e.message);
          if (t2 === "invalidParams" || t2 === "accessDenied") {
            self.lockError = t2 || "lock failed";
            return;
          }
          self.verifyLockAfterDrop({ rat: args.rat, pci: args.pci, freq: args.freq });
        }).then(function() {
          if (!self.lockVerifying) self.lockBusy = false;
        });
      },
      // set_cell_lock's reply never arrived (the lock bounced our own tunnel).
      // Find out what actually happened: give the tunnel a moment, then re-query
      // get_lock a few times. If a lock is present / a revert is armed, surface
      // an (uncertain) revert panel so a good lock can still be kept; otherwise
      // report a clean no-op. Owns lockBusy/lockVerifying for its lifetime.
      verifyLockAfterDrop(applied) {
        var self = this;
        this.lockVerifying = true;
        this.lockBusy = true;
        this.lockError = "";
        this.pending = { kind: "cell", verifying: true };
        var attempts = 0, MAX = 6;
        var again = function() {
          self.lockProbeTimer = setTimeout(probe, 2500);
        };
        var probe = function() {
          self.lockProbeTimer = null;
          if (self.pollStopped) return;
          attempts += 1;
          rpc("get_lock", {}, { timeout: 15e3 }).then(function(res) {
            var lk = res && res.lock;
            var locked = lk && lk.l4g && lk.l4g.locked || lk && lk.l5g && lk.l5g.locked;
            var armed = res && res.pending_kind === "cell";
            self.lockData = res;
            if (locked || armed) {
              self.lockConfirm = null;
              self.pending = { kind: "cell", applied, uncertain: true, armed: !!armed };
              self.finishVerify();
              if (armed) self.restoreChange(3);
            } else if (attempts < MAX) {
              again();
            } else {
              self.pending = null;
              self.lockError = "The lock request was cut off by a connection drop and no lock is set - try again.";
              self.finishVerify();
            }
          }).catch(function() {
            if (attempts < MAX) {
              again();
            } else {
              self.pending = null;
              self.lockError = "Connection dropped while locking and hasn't recovered yet - refresh once you're back to see the current lock state.";
              self.finishVerify();
            }
          });
        };
        again();
      },
      finishVerify() {
        this.lockVerifying = false;
        this.lockBusy = false;
      },
      unlockCell() {
        var self = this;
        if (this.lockBusy || this.pending) return;
        this.lockBusy = true;
        this.lockError = "";
        var slot = this.slotOf(this.lockData);
        rpc("clear_cell_lock", slot !== void 0 ? { slot } : {}, { timeout: 3e4 }).then(function(res) {
          if (res && res.error) {
            self.lockError = res.error;
            self.onStaleSlot(res);
            return;
          }
          self.fetchLock();
          self.fetchBands({ light: true });
        }).catch(function(e) {
          self.lockError = e && (e.type || e.message) || "unlock failed";
        }).then(function() {
          self.lockBusy = false;
        });
      },
      // Disruptive network scan (GL's scan_cells): takes the modem offline for
      // up to ~10 minutes. Only ever fired after an explicit scanConfirm. Stores
      // towers UNSORTED — renderScanCard sorts a slice at paint time so the raw
      // fetch order is never mutated under us.
      scanCells() {
        var self = this;
        if (this.scan.running || this.pending || this.lockBusy) return;
        this.scanConfirm = false;
        this.scan.running = true;
        this.scan.error = "";
        rpcJob("scan_cells", {}).then(function(res) {
          if (!res || res.error) {
            self.scan.error = res && res.error || "scan failed";
            return;
          }
          self.scan.towers = res.towers || [];
          self.scan.ts = res.ts || Date.now();
          self.scan.slot = res.slot != null ? Number(res.slot) : null;
        }).catch(function(e) {
          self.scan.error = e && (e.type || e.message) || "scan failed";
        }).then(function() {
          self.scan.running = false;
          self.fetchLock();
        });
      },
      // Lock target from a scan row: GL's own values verbatim, whole row as extra.
      scanTarget(row) {
        var isNR = /5G/.test(row.network_type || "");
        var t2 = {
          rat: isNR ? "5g" : "4g",
          pci: Number(row.pci),
          freq: Number(row.freq),
          band: row.band !== void 0 ? Number(row.band) : void 0,
          label: "scanned cell PCI " + row.pci,
          extra: row,
          slot: this.scan.slot != null ? this.scan.slot : this.slotOf(this.lockData)
        };
        if (isNR) {
          t2.scs = Number(row.scs);
          t2.scsAssumed = false;
        }
        return t2;
      },
      // ---- cell-lock render helpers ----
      renderCurrentCell(h) {
        var self = this, d = this.lockData;
        var s = d.serving || {};
        var l5 = d.lock && d.lock.l5g || {}, l4 = d.lock && d.lock.l4g || {};
        var locked = !!(l5.locked || l4.locked || d.gl && d.gl.locked);
        var rows = [];
        var push = function(k, v) {
          if (v !== void 0 && v !== null && v !== "") rows.push([k, v]);
        };
        push("RAT", s.rat);
        push("PCI", s.pci);
        push("ARFCN", s.arfcn);
        push(t("Band"), s.band != null ? (/NR5G/.test(s.rat || "") ? "n" : "B") + s.band : null);
        push(t("Cell ID"), s.cell_id);
        var moved = this.servingMoved;
        if (!moved) {
          push("RSRP", this.serving.rsrp != null ? this.serving.rsrp + " dBm" : null);
          push("SINR", this.serving.sinr != null ? this.serving.sinr + " dB" : null);
        }
        var action;
        if (locked) {
          var lk = l5.locked ? l5 : l4.locked ? l4 : d.gl && d.gl.tower || {};
          var hasPci = lk.pci !== void 0 && lk.pci !== null;
          var hasFreq = lk.freq !== void 0 && lk.freq !== null;
          var lockedDetail;
          var lkTarget = (hasPci ? "PCI " + lk.pci : "") + (hasPci && hasFreq ? " / " : "") + (hasFreq ? "ARFCN " + lk.freq : "");
          var lkNR = l5.locked || /NR|5G/.test(String(lk.network_type || ""));
          if (lkTarget && lk.band) lkTarget += " (" + (lkNR ? "n" : "B") + lk.band + ")";
          action = h("div", { staticClass: "mm-foot" }, [
            h("span", { staticClass: "mm-hint" }, tp("{locked} to {target}. The modem will not hand over.", {
              locked: h("b", { staticStyle: { color: "var(--success)" } }, t("Locked")),
              target: lkTarget || t("(details unavailable)")
            })),
            h("button", {
              staticClass: "mm-btn danger",
              attrs: { disabled: this.lockBusy || !!this.pending },
              on: { click: function() {
                self.unlockCell();
              } }
            }, this.lockBusy ? "Unlocking..." : "Unlock")
          ]);
        } else {
          var target = this.pinTarget();
          if (moved) {
            action = h("div", { staticClass: "mm-foot" }, [
              h(
                "span",
                { staticClass: "mm-hint", staticStyle: { color: "var(--warning-hover)" } },
                t(
                  this.lockLoading ? "The modem has moved to PCI {pci} / ARFCN {arfcn} since this was read - re-reading..." : "The modem has moved to PCI {pci} / ARFCN {arfcn} since this was read. Refresh before locking.",
                  { pci: moved.pci, arfcn: moved.arfcn }
                )
              ),
              h("button", {
                staticClass: "mm-btn",
                attrs: { disabled: this.lockLoading || this.lockBusy || !!this.pending },
                on: { click: function() {
                  self.fetchLock();
                } }
              }, "Refresh")
            ]);
          } else if (this.lockConfirm && this.lockConfirm.pin && target) {
            action = h("div", { staticClass: "mm-foot" }, [
              h(
                "span",
                { staticClass: "mm-hint", staticStyle: { color: "var(--warning-hover)" } },
                t(target.rat === "5g" ? "Lock to PCI {pci}? Network mode switches to 5G-only until unlocked." : "Lock to PCI {pci}? Network mode switches to 4G-preferred until unlocked.", { pci: target.pci }) + (target.scsAssumed ? " " + t("SCS {scs} kHz is assumed from the band.", { scs: target.scs }) : "") + " " + t("Auto-reverts in 60s unless kept.") + " " + t("The link drops for a few seconds while the modem re-registers.")
              ),
              h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
                h("button", { staticClass: "mm-btn", on: { click: function() {
                  self.lockConfirm = null;
                } } }, "Cancel"),
                h("button", {
                  staticClass: "mm-btn primary",
                  attrs: { disabled: this.lockBusy || !!this.pending },
                  on: { click: function() {
                    self.lockCell(target);
                  } }
                }, this.lockBusy ? "Locking..." : "Lock it")
              ])
            ]);
          } else {
            action = h("div", { staticClass: "mm-foot" }, [
              h(
                "span",
                { staticClass: "mm-hint" },
                "Pin the modem to the cell it is using now - the safest lock target."
              ),
              h("button", {
                staticClass: "mm-btn primary",
                attrs: { disabled: !target || this.lockBusy || !!this.pending },
                on: { click: function() {
                  self.lockConfirm = { pin: true };
                } }
              }, "Lock to this cell")
            ]);
          }
        }
        return h("div", { staticClass: "mm-grp" }, [
          h("div", { staticClass: "mm-grp-h" }, [
            h("span", { staticClass: "mm-grp-t" }, "Current cell"),
            h("span", { staticClass: "mm-hint" }, locked ? "locked" : "serving now")
          ]),
          h("div", { staticClass: "mm-dl" }, rows.map(function(r, i) {
            return h("div", { key: i }, [h("span", { staticClass: "k" }, r[0]), h("b", String(r[1]))]);
          })),
          action
        ]);
      },
      // Nearby-cells scan card. GL's scan_cells is DISRUPTIVE (modem offline up
      // to ~10 minutes), so it never fires without an explicit confirm step. The no-scan neighbour
      // list (neighbours.js) sits above it; on 5G SA that list is always empty.
      renderScanCard(h) {
        var self = this;
        var locked = this.lockData && ((this.lockData.lock.l5g || {}).locked || (this.lockData.lock.l4g || {}).locked);
        var head = h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, "Nearby cells"),
          this.scan.ts ? h("span", { staticClass: "mm-hint" }, this.scan.slot != null ? t("scanned {age} ago · SIM {slot}", { age: this.fmtAge(Math.max(60, (Date.now() - this.scan.ts) / 1e3)), slot: this.scan.slot }) : t("scanned {age} ago", { age: this.fmtAge(Math.max(60, (Date.now() - this.scan.ts) / 1e3)) })) : h("span", { staticClass: "mm-hint" }, "requires a scan")
        ]);
        var body;
        if (this.scan.running) {
          body = h(
            "div",
            { staticClass: "mm-empty" },
            "Scanning... the modem is offline until this finishes (up to ~10 minutes). Watch the strip."
          );
        } else if (this.scan.towers.length) {
          var servingC = this.servingCarrier;
          var simMcc = this.activeSim.mcc, simMnc = this.activeSim.mnc;
          var isOurs = function(t2) {
            if (servingC && t2.carrier && self.nameOverlap(servingC, t2.carrier)) return true;
            return !!simMcc && String(t2.mcc) === String(simMcc) && String(t2.mnc) === String(simMnc);
          };
          var ckey = function(t2) {
            return (t2.carrier || (t2.mcc || "") + "-" + (t2.mnc || "")).toLowerCase();
          };
          var is5g = function(t2) {
            return /5G/.test(t2.network_type || "") ? 0 : 1;
          };
          var sorted = this.scan.towers.slice().sort(function(a, b) {
            var oa = isOurs(a) ? 0 : 1, ob = isOurs(b) ? 0 : 1;
            if (oa !== ob) return oa - ob;
            var ra = is5g(a), rb = is5g(b);
            if (ra !== rb) return ra - rb;
            var ca = ckey(a), cb = ckey(b);
            if (ca !== cb) return ca < cb ? -1 : 1;
            if (a.rsrp === void 0 && b.rsrp === void 0) return 0;
            if (a.rsrp === void 0) return 1;
            if (b.rsrp === void 0) return -1;
            return b.rsrp - a.rsrp;
          });
          var rows = sorted.map(function(tw, i) {
            var q = tw.rsrp !== void 0 ? tw.rsrp >= -95 ? "good" : tw.rsrp >= -105 ? "fair" : "poor" : "none";
            var confirming = self.lockConfirm && self.lockConfirm.scanIdx === i;
            var target = self.scanTarget(tw);
            return h("div", { key: i, staticClass: "mm-scan-row" }, [
              h("span", { staticClass: "mm-scan-badge" }, tw.network_type || "?"),
              h("span", (tw.carrier || (tw.mcc || "") + "-" + (tw.mnc || "")) + "  " + (tw.cellid || "")),
              h("span", (/5G/.test(tw.network_type || "") ? "n" : "B") + (tw.band !== void 0 ? tw.band : "?") + "  ARFCN " + tw.freq + "  PCI " + tw.pci),
              h(
                "span",
                { style: { color: self.qColor(q) } },
                tw.rsrp !== void 0 ? tw.rsrp + " dBm" : ""
              ),
              confirming ? h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
                h("button", { staticClass: "mm-btn", on: { click: function() {
                  self.lockConfirm = null;
                } } }, "Cancel"),
                h(
                  "button",
                  {
                    staticClass: "mm-btn primary",
                    attrs: { disabled: self.lockBusy || !!self.pending },
                    on: { click: function() {
                      self.lockCell(target);
                    } }
                  },
                  self.lockBusy ? "Locking..." : "Confirm"
                )
              ]) : h("button", {
                staticClass: "mm-btn",
                attrs: { disabled: !!self.pending || self.lockBusy || locked || /5G/.test(tw.network_type || "") && tw.scs === void 0 },
                on: { click: function() {
                  self.lockConfirm = { scanIdx: i };
                } }
              }, "Lock")
            ]);
          });
          body = h("div", rows);
        } else {
          body = h("div", { staticClass: "mm-empty" }, this.scan.error ? t("Scan failed: {err}", { err: this.scan.error }) : "No scan yet. A scan lists every cell in range, on every carrier, but takes the modem offline for up to ~10 minutes.");
        }
        var foot;
        if (!this.scan.running) {
          foot = this.scanConfirm ? h("div", { staticClass: "mm-foot" }, [
            h(
              "span",
              { staticClass: "mm-hint", staticStyle: { color: "var(--warning-hover)" } },
              "Scanning takes the modem OFFLINE for up to ~10 minutes. This connection will drop if it runs over cellular."
            ),
            h("span", { staticStyle: { flex: "none", display: "flex", gap: "6px" } }, [
              h("button", { staticClass: "mm-btn", on: { click: function() {
                self.scanConfirm = false;
              } } }, "Cancel"),
              h("button", {
                staticClass: "mm-btn danger",
                attrs: { disabled: !!self.pending || self.lockBusy },
                on: { click: function() {
                  self.scanCells();
                } }
              }, "Scan now")
            ])
          ]) : h("div", { staticClass: "mm-foot" }, [
            h("span", { staticClass: "mm-hint" }, "Find every cell in range, with lockable details."),
            h("button", {
              staticClass: "mm-btn primary",
              attrs: { disabled: !!this.pending || this.lockBusy },
              on: { click: function() {
                self.scanConfirm = true;
              } }
            }, "Scan for cells")
          ]);
        }
        return h("div", { staticClass: "mm-grp" }, [head, body, foot].filter(Boolean));
      },
      renderLock(h) {
        if (this.lockLoading && !this.lockData)
          return h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-empty" }, "Reading lock state from the modem...")]);
        if (this.lockError && !this.lockData)
          return h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-empty" }, t("Couldn't read lock state: {err}", { err: this.lockError }))]);
        if (!this.lockData)
          return h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-empty" }, "...")]);
        var kids = [
          h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, [
            h("span", { staticClass: "mm-sect" }, "Cell lock"),
            h("button", {
              staticClass: "mm-tab",
              staticStyle: { fontSize: "11.5px", padding: "2px 0", borderBottom: "0" },
              attrs: { disabled: !!this.pending },
              on: { click: this.fetchLock }
            }, this.lockLoading ? "refreshing..." : "refresh")
          ]),
          null,
          // the pending banner is page-wide (render), not per tab
          this.lockError && this.lockData ? h("div", { staticClass: "mm-hint", staticStyle: { color: "var(--error)" } }, this.lockError) : null,
          this.lockData.stale ? h("div", { staticClass: "mm-revert" }, [
            h("div", { staticClass: "mm-revert-row" }, [
              h("span", tp(
                "The watchdog reverted a lock, but {gl} still remembers it - GL may re-apply it later. Clear it to reconcile.",
                { gl: h("b", t("GL's stored lock")) }
              )),
              h("button", {
                staticClass: "mm-btn keep",
                attrs: { disabled: this.lockBusy },
                on: { click: this.unlockCell }
              }, "Clear it")
            ])
          ]) : null,
          this.renderCurrentCell(h),
          this.renderNeighbours(h),
          this.renderScanCard(h),
          this.renderRecovery(h)
        ];
        return h("div", { staticClass: "mm-card" }, kids.filter(Boolean));
      },
      renderRecovery(h) {
        return h("div", { staticClass: "mm-grp" }, [
          h("div", { staticClass: "mm-grp-h" }, [
            h("span", { staticClass: "mm-grp-t" }, "Recovery"),
            h("span", { staticClass: "mm-hint" }, "read before locking")
          ]),
          h("div", { staticClass: "mm-hint", staticStyle: { lineHeight: "1.6" } }, tp(
            "A kept cell lock lives in the modem's own NV (survives reboot, reflash and factory reset) and in GL's store. Every lock made here auto-reverts in 60s unless you keep it, and the watchdog fires even if this page is closed. If the router ever becomes unreachable over the web, the ssh way back is: {cmd} - it clears the cell lock on both slots (GL's store and the modem), resets lock persistence and the network mode to Auto, and turns band filtering off.",
            { cmd: h("b", "ssh root@<router> /usr/sbin/mudimodem-revert panic") }
          )),
          h("div", { staticClass: "mm-hint", staticStyle: { lineHeight: "1.6", marginTop: "8px", color: "var(--warning-hover)" } }, tp(
            "{label} applying a lock briefly re-registers the modem, which can drop a remote (Tailscale / VPN) connection to this router for a few seconds. It reconnects on its own - if the request seems to hang or fail, wait a moment; the lock likely applied and this page will offer to keep or revert it once you're back.",
            { label: h("b", t("Remote sessions:")) }
          ))
        ]);
      }
    }
  };

  // src/web/main/neighbours.js
  var LTE_DL = [
    [1, 0, 599],
    [2, 600, 1199],
    [3, 1200, 1949],
    [4, 1950, 2399],
    [5, 2400, 2649],
    [7, 2750, 3449],
    [8, 3450, 3799],
    [12, 5010, 5179],
    [13, 5180, 5279],
    [14, 5280, 5379],
    [17, 5730, 5849],
    [18, 5850, 5999],
    [19, 6e3, 6149],
    [20, 6150, 6449],
    [25, 8040, 8689],
    [26, 8690, 9039],
    [28, 9210, 9659],
    [29, 9660, 9769],
    [30, 9770, 9869],
    [32, 9920, 10359],
    [34, 36200, 36349],
    [38, 37750, 38249],
    [39, 38250, 38649],
    [40, 38650, 39649],
    [41, 39650, 41589],
    [42, 41590, 43589],
    [43, 43590, 45589],
    [46, 46790, 54539],
    [48, 55240, 56739],
    [66, 66436, 67335],
    [71, 68586, 68935]
  ];
  function lteBandOf(earfcn) {
    var n = Number(earfcn);
    if (!isFinite(n)) return void 0;
    for (var i = 0; i < LTE_DL.length; i++) if (n >= LTE_DL[i][1] && n <= LTE_DL[i][2]) return LTE_DL[i][0];
    return void 0;
  }
  function parseNeighbours(text) {
    var cells = [];
    var num = function(v) {
      var s = String(v == null ? "" : v).trim();
      if (s === "" || s === "-") return void 0;
      var n = Number(s);
      return isFinite(n) ? n : void 0;
    };
    String(text || "").replace(/\r/g, "\n").split("\n").forEach(function(l) {
      l = l.trim();
      var m = l.match(/^\+QENG:\s*"neighbourcell ?([a-z]*)"\s*,\s*"LTE"\s*,(.*)$/i);
      if (!m) return;
      var f = m[2].split(",");
      if (num(f[0]) === void 0) return;
      cells.push({
        kind: m[1].toLowerCase() || "?",
        rat: "LTE",
        earfcn: num(f[0]),
        pci: num(f[1]),
        rsrq: num(f[2]),
        rsrp: num(f[3]),
        rssi: num(f[4]),
        sinr: num(f[5]),
        srxlev: num(f[6]),
        band: lteBandOf(f[0])
      });
    });
    return { cells };
  }
  var neighbours_default = {
    data() {
      return {
        // the last read: cells/other from parseNeighbours, the slot it was read for, its time
        nb: { cells: [], running: false, error: "", ts: 0, slot: null, read: false },
        nbConfirm: null
        // index of the row whose Lock awaits confirm
      };
    },
    methods: {
      readNeighbours() {
        var self = this;
        if (this.nb.running || this.scan.running) return;
        var slot = this.slotOf(this.lockData);
        this.nb = { cells: [], running: true, error: "", ts: 0, slot: slot == null ? null : slot, read: false };
        this.nbConfirm = null;
        rpcAt('AT+QENG="neighbourcell"', 8).then(function(r) {
          if (!r || r.error) {
            self.nb.error = r && r.error || "request failed";
            return;
          }
          var st = Array.isArray(r.steps) ? r.steps[0] : null;
          if (!st || st.status !== "ok") {
            self.nb.error = st && st.status === "timeout" ? "the modem did not answer" : "the modem refused the command";
            return;
          }
          var p = parseNeighbours(st.response);
          self.nb.cells = p.cells;
          self.nb.read = true;
          self.nb.ts = Date.now();
        }).catch(function(e) {
          self.nb.error = e && (e.type || e.message) || "request failed";
        }).then(function() {
          self.nb.running = false;
        });
      },
      // Lock target from a neighbour row: a 4G lock is EARFCN + PCI (GL: QNWLOCK "common/4g").
      nbTarget(c) {
        return {
          rat: "4g",
          pci: c.pci,
          freq: c.earfcn,
          band: c.band,
          label: "neighbour cell PCI " + c.pci,
          slot: this.nb.slot != null ? this.nb.slot : this.slotOf(this.lockData)
        };
      },
      renderNeighbours(h) {
        var self = this, nb = this.nb;
        var locked = this.lockData && ((this.lockData.lock.l5g || {}).locked || (this.lockData.lock.l4g || {}).locked);
        var head = h("div", { staticClass: "mm-grp-h" }, [
          h("span", { staticClass: "mm-grp-t" }, "Neighbour cells"),
          h("span", { staticClass: "mm-hint" }, !nb.ts ? "no scan, the link stays up" : Date.now() - nb.ts < 6e4 ? "read just now" : t("read {n} min ago", { n: Math.round((Date.now() - nb.ts) / 6e4) }))
        ]);
        var body = null;
        if (nb.running) body = h("div", { staticClass: "mm-empty" }, "Asking the modem...");
        else if (nb.error) body = h("div", { staticClass: "mm-empty" }, t("Couldn't read neighbours: {err}", { err: t(nb.error) }));
        else if (nb.read && !nb.cells.length)
          body = h(
            "div",
            { staticClass: "mm-empty" },
            "The modem reports no neighbours. On 5G SA it never does - only a scan finds other cells there."
          );
        else if (nb.read) {
          var sorted = nb.cells.slice().sort(function(a, b) {
            if (a.rsrp === void 0) return 1;
            if (b.rsrp === void 0) return -1;
            return b.rsrp - a.rsrp;
          });
          var rows = sorted.map(function(c, i) {
            var q = c.rsrp !== void 0 ? c.rsrp >= -95 ? "good" : c.rsrp >= -105 ? "fair" : "poor" : "none";
            var confirming = self.nbConfirm === i;
            var target = self.nbTarget(c);
            return h("div", { key: "n" + i, staticClass: "mm-scan-row" }, [
              h("span", { staticClass: "mm-scan-badge" }, "LTE"),
              h("span", c.kind === "intra" ? t("same frequency") : c.kind === "inter" ? t("other frequency") : c.kind),
              h("span", (c.band !== void 0 ? "B" + c.band : "B?") + "  EARFCN " + c.earfcn + "  PCI " + c.pci),
              h(
                "span",
                { style: { color: self.qColor(q) } },
                (c.rsrp !== void 0 ? c.rsrp + " dBm" : "") + (c.sinr !== void 0 ? " · SINR " + c.sinr : "")
              ),
              confirming ? h("span", { staticStyle: { display: "flex", gap: "6px" } }, [
                h("button", { staticClass: "mm-btn", on: { click: function() {
                  self.nbConfirm = null;
                } } }, "Cancel"),
                h("button", {
                  staticClass: "mm-btn primary",
                  attrs: { disabled: self.lockBusy || !!self.pending },
                  on: { click: function() {
                    self.lockCell(target);
                  } }
                }, self.lockBusy ? "Locking..." : "Confirm")
              ]) : h("button", {
                staticClass: "mm-btn",
                attrs: { disabled: !!self.pending || self.lockBusy || locked || c.pci === void 0 },
                on: { click: function() {
                  self.nbConfirm = i;
                } }
              }, "Lock")
            ]);
          });
          body = h("div", rows);
        }
        var foot = h("div", { staticClass: "mm-foot" }, [
          h("span", { staticClass: "mm-hint" }, "Asks the modem which cells it measures besides the serving one (LTE and NSA anchors)."),
          h("button", {
            staticClass: "mm-btn",
            attrs: { disabled: nb.running || this.scan.running || !!this.pending },
            on: { click: function() {
              self.readNeighbours();
            } }
          }, nb.read || nb.error ? "Read again" : "Read neighbours")
        ]);
        return h("div", { staticClass: "mm-grp" }, [head, body, foot].filter(Boolean));
      }
    }
  };

  // src/web/main/config.js
  var config_default = {
    data() {
      return {
        // ---- Config tab (Phase 5) ----
        deviceInfo: null,
        // { model, cpu } — fetched once via system.board
        appVer: null,
        // app_version result { installed, latest, update_available, checked, error? }
        updateConfirm: false,
        // "Update now" armed, awaiting a second click
        updateConfirmTimer: null,
        updating: false,
        // self_update in flight / polling
        updateDone: false,
        // an update SUCCEEDED in this page's lifetime — the
        // offer is spent until reload (the running chunk is
        // still the old one, so re-offering it is a lie)
        updateMsg: "",
        // final status line after an update attempt
        verRefreshTimer: null,
        // re-read of the installed version after an update
        updatePollTimer: null,
        pollAttempts: 0,
        // bounds the poll loop — give up after POLL_MAX
        POLL_MAX: 40,
        // ~2 minutes at the 3s poll interval
        // History eMMC backup (get/set_history_persist) — off by default
        histPersist: null,
        histPersistBusy: false,
        histPersistErr: ""
      };
    },
    methods: {
      // ---- Config tab (Phase 5) ----
      modemName() {
        return this.modem && this.modem.name || "";
      },
      fetchDeviceInfo() {
        var self = this;
        if (!hasRpc()) return Promise.resolve();
        return rpc("device_info", {}, { timeout: 8e3 }).then(function(r) {
          self.deviceInfo = { model: r && r.model || "", cpu: r && r.cpu || "" };
        }).catch(function() {
        });
      },
      // Fail-silent by contract: a failed version check shows the installed version
      // alone, never an error. That contract needs the SILENT transport — through
      // $rpcRequest the interceptor pops GL's global banner before our .catch runs,
      // which is exactly the noise this method promises not to make. It matters
      // most in refreshVersionAfterUpdate, which reads while nginx may still be
      // restarting. A failed read keeps whatever we already had.
      checkAppVersion() {
        var self = this;
        return rpcSilentJob("app_version", {}).then(function(r) {
          if (r) self.appVer = r;
        });
      },
      // After a successful self-update the box's /etc/mudimodem/version.json holds
      // the NEW version, but this card is still showing the one we just replaced.
      // Re-read it so the screen states what is actually installed.
      //
      // The install restarts nginx, so the first read can fail outright or race
      // the file swap and return the old number — retry a few times until it
      // matches the version we installed (or we run out of tries; a stale number
      // beats a spinner that never settles).
      refreshVersionAfterUpdate(target, tries) {
        var self = this;
        if (this.pollStopped) return;
        this.checkAppVersion().then(function() {
          if (self.pollStopped) return;
          var inst = self.appVer && self.appVer.installed || "";
          if (tries > 1 && target && inst !== target) {
            if (self.verRefreshTimer) clearTimeout(self.verRefreshTimer);
            self.verRefreshTimer = setTimeout(function() {
              self.refreshVersionAfterUpdate(target, tries - 1);
            }, 2500);
          }
        });
      },
      reloadPage() {
        if (typeof window !== "undefined" && window.location && window.location.reload) {
          window.location.reload();
        }
      },
      fetchHistoryPersist() {
        var self = this;
        if (!hasRpc()) return Promise.resolve();
        return rpc("get_history_persist", {}, { timeout: 8e3 }).then(function(r) {
          self.histPersist = r || null;
          self.histPersistErr = r && r.error || "";
        }).catch(function(e) {
          self.histPersistErr = e && (e.message || e.type) || "request failed";
        });
      },
      applyHistoryPersist(enabled) {
        var self = this;
        if (this.histPersistBusy || !hasRpc()) return;
        this.histPersistBusy = true;
        this.histPersistErr = "";
        return rpc("set_history_persist", { enabled: !!enabled }, { timeout: 1e4 }).then(function(r) {
          self.histPersistBusy = false;
          if (r && typeof r.enabled === "boolean") self.histPersist = r;
          self.histPersistErr = r && r.error || "";
        }).catch(function(e) {
          self.histPersistBusy = false;
          self.histPersistErr = e && (e.message || e.type) || "request failed";
        });
      },
      fmtHistSize(bytes) {
        var n = Number(bytes) || 0;
        if (n < 1024) return n + " B";
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KiB";
        return (n / (1024 * 1024)).toFixed(2) + " MiB";
      },
      armUpdate() {
        var self = this;
        if (this.updateConfirm || this.updating || this.updateDone) return;
        this.updateConfirm = true;
        if (this.updateConfirmTimer) clearTimeout(this.updateConfirmTimer);
        this.updateConfirmTimer = setTimeout(function() {
          self.updateConfirm = false;
        }, 5e3);
      },
      confirmUpdate() {
        var self = this;
        this.updateConfirm = false;
        if (this.updateConfirmTimer) {
          clearTimeout(this.updateConfirmTimer);
          this.updateConfirmTimer = null;
        }
        if (this.updating || this.updateDone) return Promise.resolve();
        if (!hasRpc()) return Promise.resolve();
        var target = this.appVer && this.appVer.latest || "";
        this.updating = true;
        this.updateMsg = target ? t("Updating to v{v}…", { v: target }) : t("Updating…");
        this.pollStopped = false;
        this.pollAttempts = 0;
        return rpc("self_update", {}, { timeout: 12e3 }).then(function() {
          self.pollUpdate();
        }).catch(function(e) {
          self.updating = false;
          self.updateMsg = t("Couldn't start update: {err}", { err: e && (e.message || e.type) || "error" });
        });
      },
      // Polls update_status every 3s until a terminal result, a give-up cap
      // (POLL_MAX attempts), or the component tears down. `pollStopped` is the
      // teardown guard: `updatePollTimer` only ever holds the id of the NEXT
      // scheduled timer, so once a timer fires and its RPC is in flight, a plain
      // clearTimeout in beforeDestroy can no longer cancel anything — the async
      // continuation below is what must notice and stop rescheduling.
      pollUpdate() {
        var self = this;
        if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
        this.updatePollTimer = setTimeout(function() {
          if (self.pollStopped) return;
          self.pollAttempts++;
          self.rpcSilent("update_status", {}, 8e3).then(function(s) {
            if (self.pollStopped) return;
            if (s && s.result) {
              self.updating = false;
              if (s.result.ok) {
                var v = self.appVer && self.appVer.latest || "";
                self.updateDone = true;
                self.updateMsg = v ? t("Updated to v{v}. The page is still running the old interface —", { v }) : t("Updated. The page is still running the old interface —");
                self.refreshVersionAfterUpdate(v, 4);
              } else {
                self.updateMsg = t("Update failed: {err} — see /var/log/mudimodem-update.log", { err: s.result.error || "unknown" });
              }
            } else if (self.pollAttempts >= self.POLL_MAX) {
              self.updating = false;
              self.updateMsg = "Update is taking longer than expected — check /var/log/mudimodem-update.log, then reload the page.";
            } else {
              self.pollUpdate();
            }
          }).catch(function() {
            if (self.pollStopped) return;
            if (self.pollAttempts >= self.POLL_MAX) {
              self.updating = false;
              self.updateMsg = "Update is taking longer than expected — check /var/log/mudimodem-update.log, then reload the page.";
            } else {
              self.pollUpdate();
            }
          });
        }, 3e3);
      },
      renderConfig(h) {
        var self = this;
        var row = function(label, value) {
          return h("div", { staticClass: "mm-kv" }, [
            h("span", { staticClass: "mm-k" }, label),
            h("span", { staticClass: "mm-v" }, value || "—")
          ]);
        };
        var di = this.deviceInfo || {};
        var device = h("div", { staticClass: "mm-card" }, [
          h("div", { staticClass: "mm-card-h" }, "Device"),
          row("Model", di.model),
          row("CPU", di.cpu),
          row("Modem", this.modemName())
        ]);
        var av = this.appVer || {};
        var installed = av.installed || "unknown";
        var verNodes = [h("span", {}, installed === "unknown" ? t("MudiModem (version unknown)") : "MudiModem v" + installed)];
        if (av.checked && av.update_available && av.latest && !this.updating && !this.updateDone) {
          verNodes.push(h("span", { staticClass: "mm-upd" }, [
            " (" + t("v{v} available", { v: av.latest }) + " — ",
            this.updateConfirm ? h(
              "a",
              {
                staticClass: "mm-link mm-warn",
                attrs: { href: "#" },
                on: { click: function(e) {
                  if (e.preventDefault) e.preventDefault();
                  self.confirmUpdate();
                } }
              },
              "click to confirm — briefly restarts the admin panel"
            ) : h(
              "a",
              {
                staticClass: "mm-link",
                attrs: { href: "#" },
                on: { click: function(e) {
                  if (e.preventDefault) e.preventDefault();
                  self.armUpdate();
                } }
              },
              "Update now"
            ),
            ")"
          ]));
        }
        var verLine = h("div", { staticClass: "mm-kv" }, verNodes);
        var cardKids = [h("div", { staticClass: "mm-card-h" }, "MudiModem"), verLine];
        if (this.updateMsg) {
          cardKids.push(h("div", { staticClass: "mm-note" }, this.updateDone ? [
            this.updateMsg + " ",
            h(
              "a",
              {
                staticClass: "mm-link",
                attrs: { href: "#" },
                on: { click: function(e) {
                  if (e.preventDefault) e.preventDefault();
                  self.reloadPage();
                } }
              },
              "reload now"
            )
          ] : this.updateMsg));
        }
        var app = h("div", { staticClass: "mm-card" }, cardKids);
        var hp = this.histPersist;
        var histKids = [h("div", { staticClass: "mm-card-h" }, "History across reboots")];
        if (!hp) {
          histKids.push(h(
            "div",
            { staticClass: "mm-note" },
            this.histPersistErr || "Loading…"
          ));
        } else {
          histKids.push(h("div", { staticClass: "mm-kv" }, [
            h("label", { staticClass: "mm-k" }, [
              h("input", {
                attrs: { type: "checkbox", disabled: !!self.histPersistBusy },
                domProps: { checked: !!hp.enabled },
                on: { change: function(e) {
                  self.applyHistoryPersist(!!(e.target && e.target.checked));
                } }
              }),
              " Keep signal & battery history across reboots"
            ])
          ]));
          histKids.push(h(
            "div",
            { staticClass: "mm-note" },
            t(
              "Live charts still use RAM. When this is on, the collector appends new samples to eMMC about every {n} minutes (~6 MiB for a full day of signal + battery). Off by default.",
              { n: hp.flush_interval_s && Math.round(hp.flush_interval_s / 60) || 10 }
            )
          ));
          if (hp.enabled || hp.size_bytes && hp.size_bytes > 0) {
            histKids.push(row("Backup size", self.fmtHistSize(hp.size_bytes)));
          }
          if (this.histPersistErr) {
            histKids.push(h("div", { staticClass: "mm-note" }, this.histPersistErr));
          }
        }
        var hist = h("div", { staticClass: "mm-card" }, histKids);
        return h("div", {}, [device, app, hist]);
      }
    }
  };

  // src/web/kit/chunks.js
  function loadChunk(name) {
    if (typeof window === "undefined" || !window.$axios) return Promise.reject(new Error("no transport"));
    return window.$axios.get("/views/gl-sdk4-ui-mudimodem-" + name + ".common.js?_t=" + Date.now()).then(function(res) {
      var mod = { exports: {} };
      new Function("module", res.data)(mod);
      var comp = mod.exports;
      if (!comp || typeof comp.render !== "function") throw new Error("bad chunk");
      return comp;
    });
  }

  // src/web/main/tabs.js
  var tabs_default = {
    data() {
      return {
        // Tracking tab: the graph lives in its OWN chunk (gl-sdk4-ui-mudimodem-
        // tracking). Rather than route away (which hides our strip + tab bar), we
        // lazy-load that chunk on first open and render it as an in-page child
        // component, exactly as the SPA's own loader evals a view chunk.
        trackingComp: null,
        // the loaded tracking component options, once fetched
        trackingLoading: false,
        trackingErr: "",
        // AT console tab: same lazy-chunk pattern as Tracking.
        consoleComp: null,
        consoleLoading: false,
        consoleErr: "",
        // Speedtest tab: same lazy-chunk pattern as Tracking/AT console.
        speedtestComp: null,
        speedtestLoading: false,
        speedtestErr: "",
        // Battery tab: same lazy-chunk pattern as Tracking/AT console/Speedtest.
        batteryComp: null,
        batteryLoading: false,
        batteryErr: ""
      };
    },
    methods: {
      // Open the in-page Tracking tab, lazy-loading its chunk on first use.
      openTracking() {
        this.tab = "tracking";
        this.loadTracking();
      },
      // Fetch + evaluate the tracking chunk the way the SPA's route loader does (kit/chunks.js).
      // Cached on the instance; a failed load shows a message and can be retried.
      loadTracking() {
        var self = this;
        if (this.trackingComp || this.trackingLoading) return;
        if (typeof window === "undefined" || !window.$axios) return;
        this.trackingLoading = true;
        this.trackingErr = "";
        loadChunk("tracking").then(function(comp) {
          self.trackingComp = comp;
          self.trackingLoading = false;
        }).catch(function(e) {
          self.trackingLoading = false;
          self.trackingErr = e && (e.message || e.type) || "could not load the graph";
        });
      },
      // Fetch + eval the AT-console chunk exactly like loadTracking above.
      loadConsole() {
        var self = this;
        if (this.consoleComp || this.consoleLoading) return;
        if (typeof window === "undefined" || !window.$axios) return;
        this.consoleLoading = true;
        this.consoleErr = "";
        loadChunk("console").then(function(comp) {
          self.consoleComp = comp;
          self.consoleLoading = false;
        }).catch(function(e) {
          self.consoleLoading = false;
          self.consoleErr = e && e.message || "load failed";
        });
      },
      // Open the in-page Speedtest tab, lazy-loading its chunk on first use.
      openSpeedtest() {
        this.tab = "speedtest";
        this.loadSpeedtest();
      },
      loadSpeedtest() {
        var self = this;
        if (this.speedtestComp || this.speedtestLoading) return;
        if (typeof window === "undefined" || !window.$axios) return;
        this.speedtestLoading = true;
        this.speedtestErr = "";
        loadChunk("speedtest").then(function(comp) {
          self.speedtestComp = comp;
          self.speedtestLoading = false;
        }).catch(function(e) {
          self.speedtestLoading = false;
          self.speedtestErr = e && (e.message || e.type) || "could not load the speed test";
        });
      },
      // Open the in-page Battery tab, lazy-loading its chunk on first use.
      openBattery() {
        this.tab = "battery";
        this.loadBattery();
      },
      loadBattery() {
        var self = this;
        if (this.batteryComp || this.batteryLoading) return;
        if (typeof window === "undefined" || !window.$axios) return;
        this.batteryLoading = true;
        this.batteryErr = "";
        loadChunk("battery").then(function(comp) {
          self.batteryComp = comp;
          self.batteryLoading = false;
        }).catch(function(e) {
          self.batteryLoading = false;
          self.batteryErr = e && (e.message || e.type) || "could not load the battery view";
        });
      }
    }
  };

  // src/web/main/serving.js
  var serving_default = {
    data() {
      return {
        // Approximate downlink centre freq (MHz) per band, for spectrum ordering
        // and labels. Source: 3GPP TS 38.101-1 (NR) / 36.101 (LTE), rounded to the
        // marketing figure. Labels only — the modem is never sent a frequency.
        // Covers BOTH RG650V variants (NA + EU) — the module set differs per unit.
        freq: {
          n: {
            1: 2100,
            2: 1900,
            3: 1800,
            5: 850,
            7: 2600,
            8: 900,
            12: 700,
            13: 750,
            14: 700,
            20: 800,
            25: 1900,
            26: 850,
            28: 700,
            29: 700,
            30: 2300,
            38: 2600,
            40: 2300,
            41: 2500,
            48: 3500,
            66: 1700,
            70: 1700,
            71: 600,
            75: 1500,
            76: 1500,
            77: 3700,
            78: 3500,
            79: 4700
          },
          B: {
            1: 2100,
            2: 1900,
            3: 1800,
            4: 1700,
            5: 850,
            7: 2600,
            8: 900,
            12: 700,
            13: 750,
            14: 700,
            17: 700,
            18: 850,
            19: 850,
            20: 800,
            25: 1900,
            26: 850,
            28: 700,
            29: 700,
            30: 2300,
            32: 1500,
            34: 2e3,
            38: 2600,
            39: 1900,
            40: 2300,
            41: 2500,
            42: 3500,
            43: 3600,
            46: 5200,
            48: 3500,
            66: 1700,
            71: 600
          }
        },
        // LTE band -> [F_DL_low MHz, N_Offs-DL] (3GPP TS 36.101 table 5.7.3-1), for
        // the channel readout. NR uses the global raster (chanMhz below).
        LTE_EARFCN: {
          1: [2110, 0],
          2: [1930, 600],
          3: [1805, 1200],
          4: [2110, 1950],
          5: [869, 2400],
          7: [2620, 2750],
          8: [925, 3450],
          12: [729, 5010],
          13: [746, 5180],
          14: [758, 5280],
          17: [734, 5730],
          18: [860, 5850],
          19: [875, 6e3],
          20: [791, 6150],
          25: [1930, 8040],
          26: [859, 8690],
          28: [758, 9210],
          29: [717, 9660],
          30: [2350, 9770],
          32: [1452, 9920],
          34: [2010, 36200],
          38: [2570, 37750],
          39: [1880, 38250],
          40: [2300, 38650],
          41: [2496, 39650],
          42: [3400, 41590],
          43: [3600, 43590],
          46: [5150, 46790],
          48: [3550, 55240],
          66: [2110, 66436],
          71: [617, 68586]
        },
        // Default NR SS-block SCS per band (kHz), used ONLY when no scan result
        // covers the serving cell. Source: 3GPP TS 38.104 §5.4.3 band tables —
        // FDD low/mid bands are 15 kHz, the TDD mid bands 30 kHz. The confirm
        // text says when this assumption is in play. Encoding (kHz vs index)
        // verified at the supervised milestone before first use.
        SCS_DEFAULT: {
          1: 15,
          2: 15,
          3: 15,
          5: 15,
          7: 15,
          8: 15,
          12: 15,
          13: 15,
          14: 15,
          20: 15,
          25: 15,
          26: 15,
          28: 15,
          29: 15,
          30: 15,
          38: 30,
          40: 30,
          41: 30,
          48: 30,
          66: 15,
          70: 15,
          71: 15,
          75: 15,
          76: 15,
          77: 30,
          78: 30,
          79: 30
        }
      };
    },
    methods: {
      qFromLevel(lvl) {
        return { 1: "poor", 2: "fair", 3: "good", 4: "excellent" }[lvl] || "none";
      },
      qColor(q) {
        return {
          poor: "var(--error)",
          fair: "var(--warning)",
          good: "var(--secondary)",
          // GL 4.10 cellular-detail uses --secondary; --info-hover == --text-hint in dark
          excellent: "var(--success)",
          none: "var(--text-hint)"
        }[q];
      },
      // Case/punctuation-insensitive containment: "T-Mobile US" vs "T-Mobile".
      nameOverlap(a, b) {
        var n = function(s) {
          return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
        };
        var x = n(a), y = n(b);
        return !!x && !!y && (x.indexOf(y) !== -1 || y.indexOf(x) !== -1);
      },
      freqOf(group, b) {
        var t2 = group === "LTE" ? this.freq.B : this.freq.n;
        return t2[b];
      },
      prefixOf(group) {
        return group === "LTE" ? "B" : "n";
      },
      // rat/mode string -> band group key (sa | nsa | LTE), null when unknown.
      groupOf(mode) {
        var m = mode || "";
        if (/NR5G-SA/.test(m)) return "sa";
        if (/NR5G/.test(m)) return "nsa";
        if (/LTE/.test(m)) return "LTE";
        return null;
      },
      // The one band formatter: "n78" / "B3" from the carrier's RAT.
      formatBand(rat, band) {
        if (band === void 0 || band === null || band === "") return "—";
        return (/NR5G/.test(rat || "") ? "n" : "B") + band;
      },
      // Channel -> MHz. NR: 3GPP TS 38.104 global raster (no band needed).
      // LTE: band-aware (TS 36.101); unknown band => null (show the raw EARFCN).
      chanMhz(rat, band, arfcn) {
        var n = Number(arfcn);
        if (!n || isNaN(n)) return null;
        if (/NR5G/.test(rat || "")) {
          if (n < 6e5) return n * 5e-3;
          if (n < 2016667) return 3e3 + (n - 6e5) * 0.015;
          return 24250.08 + (n - 2016667) * 0.06;
        }
        var e = this.LTE_EARFCN[Number(band)];
        if (!e) return null;
        return e[0] + 0.1 * (n - e[1]);
      },
      chanLabel(rat, band, arfcn) {
        if (arfcn === void 0 || arfcn === null || arfcn === "") return null;
        var mhz = this.chanMhz(rat, band, arfcn);
        return mhz ? String(arfcn) + " (" + mhz.toFixed(1) + " MHz)" : String(arfcn);
      },
      // seconds -> "45 s" / "12 min" / "3 h" for the stale-seed notice.
      fmtAge(sec) {
        sec = Number(sec) || 0;
        if (sec < 90) return Math.round(sec) + " s";
        if (sec < 5400) return Math.round(sec / 60) + " min";
        return (sec / 3600).toFixed(sec < 36e3 ? 1 : 0) + " h";
      },
      scsFor(band) {
        return this.SCS_DEFAULT[band];
      }
    }
  };

  // src/web/main/styles.js
  var styles_default = {
    data() {
      return {
        styleId: "mudimodem-css"
      };
    },
    methods: {
      injectStyle() {
        if (typeof document === "undefined") return;
        if (document.getElementById(this.styleId)) return;
        var css = '.mm{color:var(--text-regular);font-variant-numeric:tabular-nums}.mm-strip{display:flex;align-items:stretch;background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);margin-bottom:11px;overflow:hidden}.mm-trace{flex:1;min-width:0;padding:9px 0 6px 13px}.mm-eyebrow{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}.mm-plot{height:40px;margin-top:3px}.mm-plot svg{display:block;width:100%;height:100%;overflow:visible}.mm-axis{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-hint);margin-top:2px}.mm-read{flex:none;min-width:120px;padding:10px 14px 9px 15px;text-align:right;border-left:1px solid var(--divider);display:flex;flex-direction:column;justify-content:center}.mm-rsrp{font-size:29px;font-weight:600;line-height:1;letter-spacing:-.025em}.mm-rsrp .u{font-size:11px;font-weight:500;color:var(--text-hint);margin-left:2px}.mm-facts{display:flex;flex-wrap:wrap;gap:5px 13px;justify-content:flex-end;margin-top:7px}.mm-facts .k{display:block;font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-badge)}.mm-facts b{font-size:12.5px;font-weight:600}.mm-lockbadges{display:flex;gap:6px;align-items:center}.mm-lockbadge{background:var(--background-badge);border:1px solid transparent;border-radius:9px;padding:1px 8px;font:inherit;font-size:10px;font-weight:600;letter-spacing:.02em;color:var(--text-hint);cursor:pointer;white-space:nowrap}.mm-lockbadge.mode{color:var(--warning);border-color:var(--warning-disabled,var(--warning));background:var(--warning-disabled,transparent)}.mm-lockbadge.lock{color:var(--error);border-color:var(--error);background:transparent}.mm-tabs{display:flex;gap:22px;border-bottom:1px solid var(--divider);margin-bottom:11px;padding:0 4px;overflow-x:auto;scrollbar-width:none}.mm-tabs::-webkit-scrollbar{display:none}.mm-tab{flex:none;white-space:nowrap;background:none;border:0;padding:9px 0 8px;font:inherit;font-size:13px;cursor:pointer;color:var(--text-weak);border-bottom:2px solid transparent;margin-bottom:-1px}.mm-tab.on{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}.mm-tab:disabled{color:var(--text-hint);cursor:default}.mm-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);padding:13px 14px}.mm-sect{font-size:13px;font-weight:600;color:var(--text-title)}.mm-hint{font-size:11.5px;color:var(--text-badge)}.mm-dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px 16px;margin-top:11px}.mm-dl .k{display:block;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}.mm-dl b{font-size:13px;font-weight:600;color:var(--text-title)}.mm-soon{padding:26px 14px;text-align:center;color:var(--text-hint);font-size:12px;line-height:1.6}.mm-empty{padding:30px 14px;text-align:center;color:var(--text-hint);font-size:12.5px}.mm-grp{margin-bottom:15px}.mm-grp:last-child{margin-bottom:2px}.mm-grp-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}.mm-grp-t{font-size:12px;font-weight:600;color:var(--text-title)}.mm-acts{display:flex;gap:2px}.mm-act{background:none;border:0;font:inherit;font-size:10.5px;cursor:pointer;color:var(--primary);padding:2px 6px;border-radius:3px}.mm-act:hover{background:var(--primary-background)}.mm-grp-off .mm-wrap{opacity:.5}.mm-gate{font-size:10.5px;color:var(--warning-hover);background:var(--warning-background);border:1px solid var(--warning-disabled);border-radius:3px;padding:4px 8px;margin-bottom:6px}.mm-seg{display:inline-flex;border:1px solid var(--border);border-radius:4px;overflow:hidden}.mm-seg-b{font:inherit;font-size:12px;background:transparent;border:0;padding:5px 14px;cursor:pointer;color:var(--text-weak);border-right:1px solid var(--border)}.mm-seg-b:last-child{border-right:0}.mm-seg-b.on{background:var(--primary);color:#fff;font-weight:600}.mm-seg-b:disabled{cursor:default;opacity:.6}.mm-wrap{display:flex;gap:4px;flex-wrap:wrap}.mm-band{position:relative;min-width:44px;padding:4px 6px 3px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--background-card);transition:border-color .1s,background .1s}.mm-band b{display:block;font-size:12px;font-weight:600;line-height:1.2}.mm-band s{display:block;font-size:9px;line-height:1.2;color:var(--text-hint);text-decoration:none}.mm-band.active{background:var(--success);border-color:var(--success)}.mm-band.active b{color:#fff}.mm-band.active s{color:rgba(255,255,255,.75)}.mm-band.permitted{border-color:var(--primary)}.mm-band.permitted b{color:var(--primary)}.mm-band.sel{background:var(--success);border-color:var(--success)}.mm-band.sel b{color:#fff}.mm-band.sel s{color:rgba(255,255,255,.75)}.mm-band.unsel b{color:var(--text-regular)}.mm-band.blocked{opacity:.5}.mm-band.blocked b{color:var(--text-hint);text-decoration:line-through}.mm-band.clickable{cursor:pointer}.mm-band.clickable:hover{border-color:var(--primary)}.mm-band.serving{box-shadow:0 0 0 2px var(--success)}.mm-band.serving::after{content:"";position:absolute;top:-3px;right:-3px;width:7px;height:7px;border-radius:50%;background:var(--success);border:1.5px solid var(--background-card)}.mm-axis2{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-hint);margin-top:6px}.mm-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:var(--text-badge);margin-top:12px;padding-top:10px;border-top:1px solid var(--divider)}.mm-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}.mm-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--divider);padding-top:11px;margin-top:11px}.mm-btn{font:inherit;font-size:11.5px;font-weight:600;border-radius:3px;padding:6px 13px;cursor:pointer;border:1px solid transparent}.mm-btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}.mm-btn.primary:disabled{background:var(--primary-disabled);border-color:transparent;cursor:default}.mm-btn.keep{background:var(--warning);color:#fff;border-color:var(--warning)}.mm-btn.danger{background:transparent;color:var(--error);border-color:var(--error)}.mm-revert{background:var(--warning-background);border:1px solid var(--warning);border-radius:3px;padding:9px 11px;margin:0 0 12px}.mm-revert-row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11.5px;color:var(--warning-hover)}.mm-revert b{font-weight:600}.mm-cd{font-variant-numeric:tabular-nums}.mm-bar{height:2px;background:var(--warning-disabled);border-radius:1px;margin-top:8px;overflow:hidden}.mm-bar i{display:block;height:100%;background:var(--warning);transition:width 1s linear}.mm-help{margin-left:6px;width:15px;height:15px;line-height:13px;border-radius:50%;border:1px solid var(--border);background:transparent;color:var(--text-weak);font-size:10px;font-weight:700;cursor:pointer;padding:0;vertical-align:1px}.mm-gloss{flex-basis:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:4px 16px;font-size:11.5px;color:var(--text-weak);border-top:1px solid var(--divider);padding-top:8px;margin-top:4px}.mm-gloss b{color:var(--text-title)}.mm-scan-row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:7px 4px;border-bottom:1px solid var(--divider);font-size:12px}.mm-scan-row>span{min-width:0}.mm-scan-row>span:nth-child(2){flex:1}.mm-scan-badge{flex:none;font-size:10px;padding:1px 6px;border:1px solid var(--border);border-radius:3px;color:var(--text-badge)}@media(max-width:640px){.mm-strip{flex-direction:column}.mm-read{border-left:0;border-top:1px solid var(--divider);text-align:left;align-items:flex-start}.mm-facts{justify-content:flex-start}.mm-revert-row{flex-direction:column;align-items:flex-start}}.mm-card+.mm-card{margin-top:11px}.mm-card-h{font-size:13px;font-weight:600;color:var(--text-title);margin-bottom:6px}.mm-kv{display:flex;gap:12px;padding:4px 0;font-size:14px}.mm-k{color:var(--text-hint);min-width:64px}.mm-v{color:var(--text-title)}.mm-link{color:var(--primary);cursor:pointer;text-decoration:underline}.mm-warn{color:var(--warning)}.mm-upd{color:var(--text-hint)}.mm-note{margin-top:8px;color:var(--text-hint);font-size:13px}';
        var el = document.createElement("style");
        el.id = this.styleId;
        el.textContent = css;
        document.head.appendChild(el);
      }
    }
  };

  // src/web/main/index.js
  var index_default = localize(compose({
    name: "mudimodem",
    data() {
      return {
        tab: "tracking",
        pollStopped: false
        // set true on teardown; makes an in-flight poll continuation a no-op
      };
    },
    computed: {
      ms() {
        var s = this.$store && this.$store.getters;
        return s && s.moduleStatus ? s.moduleStatus : function() {
          return {};
        };
      },
      modem() {
        var modems = this.ms("cellular.modems_info").modems || [];
        return modems.filter(function(m) {
          return m.type === 0;
        })[0] || modems[0] || {};
      },
      modemStatus() {
        var self = this;
        var modems = this.ms("cellular.modems_status").modems || [];
        return modems.filter(function(m) {
          return m.bus === self.modem.bus;
        })[0] || modems[0] || {};
      },
      // GL declares ONE active SIM: the SELECTED slot (current_sim_slot). The panel
      // anchors on THAT SIM and shows its state honestly — even when it is
      // unregistered — and never borrows the other slot's cell (which may be
      // carrying failover data; that's GL's own SIM1-active / modem-connected split).
      activeSlot() {
        return this.modemStatus.current_sim_slot;
      },
      // ---- cellModel: the ONLY reader of raw 4.10 socket shapes ----
      // modems_status merges SIM + network state into per-modem simcard[]
      // (slot, status, dial_status, technology, apn, iccid, pin_counter, …);
      // networks_info carries carrier + SIM identity (iccid/imsi/mcc/mnc/
      // phone_number/apn_list) per {bus, slot}. RF comes ONLY from the collector.
      simcards() {
        return this.modemStatus.simcard || [];
      },
      networks() {
        var bus = this.modem.bus;
        return (this.ms("cellular.networks_info").networks || []).filter(function(n) {
          return !bus || n.bus == null || n.bus === bus;
        });
      },
      anyNetwork() {
        return this.networks.length > 0;
      },
      activeNet() {
        var self = this;
        return this.networks.filter(function(n) {
          return String(n.slot) === String(self.activeSlot);
        })[0] || {};
      },
      activeCard() {
        var self = this;
        return this.simcards.filter(function(c) {
          return String(c.slot) === String(self.activeSlot);
        })[0] || {};
      },
      // SIM identity of the active slot (mcc/mnc/iccid/imsi/phone_number/apn_list).
      activeSim() {
        return this.activeNet;
      },
      // The collector's latest normalized sample (cellular_compat schema:
      // signals[] + flattened PCC aliases), pushed over mudimodem.collect. A
      // frame without `t` is the "nothing yet" seed.
      latestSample() {
        var s = this.ms("mudimodem.collect");
        return s && s.t ? s : null;
      },
      serving() {
        return this.latestSample || {};
      },
      // Is the active SIM actually registered (has a serving cell)?
      activeRegistered() {
        return this.serving.rsrp !== void 0 && this.serving.rsrp !== null && this.serving.rsrp !== "";
      },
      // Carrier of the ACTIVE SIM, for the strip label: the sample carries it; the
      // networks_info entry is the fallback (then the home PLMN name).
      servingCarrier() {
        var sameSim = this.serving.slot == null || String(this.serving.slot) === String(this.activeSlot);
        if (sameSim && this.serving.carrier) return this.serving.carrier;
        if (this.activeNet.carrier) return this.activeNet.carrier;
        return this.activeNet.mcc ? this.activeNet.mcc + this.activeNet.mnc : "";
      },
      // Every serving component carrier, as {group, band, role} — SA = one NR
      // chip, NSA = LTE anchor + NR chips, LTE-CA = several LTE chips.
      servingBands() {
        var self = this, out = [];
        var sigs = this.serving.signals;
        if (Array.isArray(sigs) && sigs.length) {
          sigs.forEach(function(sg) {
            if (sg && sg.band != null) out.push({ group: self.groupOf(sg.rat || self.serving.mode), band: Number(sg.band), role: sg.role || "PCC" });
          });
        } else if (this.serving.band != null && this.serving.band !== "") {
          out.push({ group: this.groupOf(this.serving.mode), band: Number(this.serving.band), role: "PCC" });
        }
        return out.filter(function(b) {
          return b.group;
        });
      },
      hasData() {
        return this.serving.rsrp !== void 0 && this.serving.rsrp !== null;
      },
      isNR() {
        return /NR5G/.test(this.serving.mode || "");
      },
      // The PRIMARY carrier's own RAT — "LTE" for an NSA anchor, while `mode` is
      // the cell's (NR5G-NSA). Band prefix, channel raster and the "you are
      // here" ring follow the carrier, never the cell's mode: the LTE anchor of
      // an EN-DC cell is B3 at 1855 MHz, not "n3" on the NR raster.
      servingRat() {
        return this.serving.pcc_rat || this.serving.mode;
      },
      // The /ws seed is flagged `stale` (with its box-clock age) when the
      // collector has not written for over a minute; live pushes never are.
      // >0 = seconds since the collector's last sample, as of the seed.
      staleFor() {
        return this.serving.stale ? Number(this.serving.age_s) || 1 : 0;
      },
      bandLabel() {
        if (this.serving.band === void 0 || this.serving.band === null || this.serving.band === "") return "—";
        return this.formatBand(this.servingRat, this.serving.band);
      },
      // Which band group the PCC is on (for the "you are here" ring).
      servingGroup() {
        return this.groupOf(this.servingRat);
      },
      // Carrier-aggregation summary for the strip: "" for a single carrier.
      caLabel() {
        var n = Array.isArray(this.serving.signals) ? this.serving.signals.length : 0;
        return n > 1 ? "CA ×" + n : "";
      },
      rsrpQ() {
        return this.qFromLevel(this.serving.rsrp_level);
      },
      sinrQ() {
        return this.qFromLevel(this.serving.sinr_level);
      },
      rsrqQ() {
        return this.qFromLevel(this.serving.rsrq_level);
      }
    },
    watch: {
      // Each collector push (a new sample `t`) extends the strip history in place
      // — the same record get_history would return, minus the round-trip.
      "serving.t": {
        immediate: true,
        handler(t2) {
          this.onSamplePush(this.serving);
        }
      },
      // The band grid, the lock picture and a scan all belong to ONE SIM. When
      // GL's active slot changes (a switch on its Internet page, slot failover)
      // they describe the other SIM: re-read them, never edit SIM2 through
      // SIM1's picture (the backend also refuses a write tagged with a stale slot).
      // Compared against the last REAL slot: a blip through "no slot" (modem
      // resetting) between SIM1 and SIM2 is still a switch.
      activeSlot: {
        immediate: true,
        handler(n) {
          var s = Number(n);
          if (!(s > 0)) return;
          var prev = this.seenSlot;
          this.seenSlot = s;
          if (prev && prev !== s) this.onSlotChange();
        }
      },
      tab(t2) {
        if (t2 === "bands" && !this.bands && !this.bandsLoading) this.fetchBands();
        if (t2 === "lock" && !this.lockLoading && (!this.lockData || this.servingMoved)) this.fetchLock();
        if (t2 === "at" && !this.consoleComp && !this.consoleLoading) this.loadConsole();
        if (t2 === "config") {
          if (!this.deviceInfo) this.fetchDeviceInfo();
          this.checkAppVersion();
          this.fetchHistoryPersist();
        }
      }
    },
    created() {
      this.injectStyle();
      this.restoreChange(0);
    },
    mounted() {
      this.startStrip();
      if (this.tab === "tracking") this.loadTracking();
      if (!this.bands && !this.bandsLoading) this.fetchBands();
    },
    beforeDestroy() {
      this.clearCountdown();
      this.stopStripPoll();
      if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
      if (this.restoreTimer) clearTimeout(this.restoreTimer);
      if (this.doneTimer) clearTimeout(this.doneTimer);
      if (this.resetTimer) clearTimeout(this.resetTimer);
      if (this.updateConfirmTimer) clearTimeout(this.updateConfirmTimer);
      if (this.updatePollTimer) clearTimeout(this.updatePollTimer);
      if (this.verRefreshTimer) clearTimeout(this.verRefreshTimer);
      if (this.lockProbeTimer) clearTimeout(this.lockProbeTimer);
      this.pollStopped = true;
    },
    render(h) {
      var self = this, c = this.serving;
      var stripKids;
      if (this.hasData) {
        var rsrpColor = this.qColor(this.rsrpQ);
        var rfSlot = c.slot != null ? c.slot : this.activeSlot;
        var rfCarrier = c.carrier || (String(rfSlot) === String(this.activeSlot) ? this.servingCarrier : "");
        stripKids = [
          h("div", { staticClass: "mm-trace" }, [
            h("div", { staticStyle: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
              h("span", [
                h("span", { staticClass: "mm-eyebrow", style: this.staleFor ? { color: "var(--warning)" } : {}, attrs: {
                  title: this.staleFor ? t("The collector's last sample is {age} old - nothing newer has been pushed", { age: this.fmtAge(this.staleFor) }) : t("Sampled every 10s by the MudiModem collector (pushed live), last {n} minutes", { n: this.STRIP_MIN })
                } }, this.staleFor ? t("RSRP · last sample {age} ago", { age: this.fmtAge(this.staleFor) }) : t("RSRP · last {n} min", { n: this.STRIP_MIN })),
                h("button", {
                  staticClass: "mm-help",
                  attrs: { type: "button", title: "What these readings mean", "aria-expanded": String(this.showGlossary) },
                  on: { click: function() {
                    self.showGlossary = !self.showGlossary;
                  } }
                }, "?")
              ]),
              this.renderLockBadges(h)
            ]),
            h("div", { staticClass: "mm-plot" }, [
              h("svg", { attrs: { viewBox: "0 0 320 40", preserveAspectRatio: "none" } }, [
                this.applyMark(h),
                h("path", { attrs: {
                  d: this.tracePath(),
                  fill: "none",
                  stroke: rsrpColor,
                  "stroke-width": "1.75",
                  "stroke-linejoin": "round",
                  "stroke-linecap": "round"
                } })
              ])
            ]),
            h("div", { staticClass: "mm-axis" }, [
              h("span", String(this.stripAxisDomain()[0])),
              h("span", (c.mode || "") + (this.caLabel ? " " + this.caLabel : "") + (rfCarrier ? "  " + rfCarrier : "") + (rfSlot ? "  SIM " + rfSlot : "")),
              h("span", this.stripAxisDomain()[1] + " dBm")
            ])
          ]),
          h("div", { staticClass: "mm-read" }, [
            h("div", { staticClass: "mm-rsrp", style: { color: rsrpColor } }, [
              String(c.rsrp),
              h("span", { staticClass: "u" }, "dBm")
            ]),
            h("div", { staticClass: "mm-facts" }, [
              h("div", [
                h("span", { staticClass: "k" }, "SINR"),
                h("b", { style: { color: this.qColor(this.sinrQ) } }, c.sinr != null ? String(c.sinr) : "-")
              ]),
              h("div", [
                h("span", { staticClass: "k" }, "RSRQ"),
                h("b", { style: { color: this.qColor(this.rsrqQ) } }, c.rsrq != null ? String(c.rsrq) : "-")
              ]),
              h("div", [h("span", { staticClass: "k" }, "Band"), h("b", this.bandLabel)])
            ].concat(
              [["BW", c.dl_bandwidth], ["Cell", c.id], ["Ch", this.chanLabel(this.servingRat, c.band, c.tx_channel)], ["RSSI", c.rssi]].filter(function(f) {
                return f[1] !== void 0 && f[1] !== null && f[1] !== "";
              }).map(function(f) {
                return h("div", [h("span", { staticClass: "k" }, f[0]), h("b", String(f[1]))]);
              })
            ))
          ]),
          this.showGlossary ? this.renderGlossary(h) : null,
          this.staleFor ? h(
            "div",
            { staticClass: "mm-hint mm-stale", staticStyle: { color: "var(--warning)", flexBasis: "100%" } },
            t(
              "The collector has not produced a sample for {age} (modem resetting, or mudimodem-collectd stopped) - these are its last known values, not live readings.",
              { age: this.fmtAge(this.staleFor) }
            )
          ) : null
        ];
      } else {
        var slot = this.activeSlot;
        stripKids = [h(
          "div",
          { staticClass: "mm-empty" },
          slot && this.anyNetwork ? this.servingCarrier ? t("SIM {slot} (active) is not registered on a network right now - {carrier}.", { slot, carrier: this.servingCarrier }) : t("SIM {slot} (active) is not registered on a network right now.", { slot }) : "Waiting for the collector's first sample (mudimodem-collectd pushes every 10s)..."
        )];
      }
      var strip = h("div", { staticClass: "mm-strip" }, stripKids);
      var TABS = [
        ["tracking", "Tracking"],
        ["lock", "Cell lock"],
        ["bands", "Bands"],
        ["at", "AT console"],
        ["speedtest", "Speedtest"],
        ["battery", "Battery"],
        ["config", "Config"]
      ];
      var tabs = h("div", { staticClass: "mm-tabs" }, TABS.map(function(t2) {
        return h("button", {
          key: t2[0],
          staticClass: "mm-tab" + (self.tab === t2[0] ? " on" : ""),
          on: { click: function() {
            if (t2[0] === "tracking") self.openTracking();
            else if (t2[0] === "speedtest") self.openSpeedtest();
            else if (t2[0] === "battery") self.openBattery();
            else self.tab = t2[0];
          } }
        }, t2[1]);
      }));
      var panel;
      if (this.tab === "bands") {
        panel = this.renderBands(h);
      } else if (this.tab === "lock") {
        panel = this.renderLock(h);
      } else if (this.tab === "tracking") {
        if (this.trackingComp) {
          panel = h(this.trackingComp, { props: { embedded: true } });
        } else {
          panel = h("div", { staticClass: "mm-card" }, [h(
            "div",
            { staticClass: "mm-soon" },
            this.trackingErr ? t("Couldn't load the graph: {err}", { err: this.trackingErr }) : "Loading the signal graph…"
          )]);
        }
      } else if (this.tab === "at") {
        if (this.consoleComp) {
          panel = h(this.consoleComp, { props: { cell: { slot: this.activeSlot, carrier: this.servingCarrier, modem: this.modemName() } } });
        } else {
          panel = h("div", { staticClass: "mm-card" }, [h(
            "div",
            { staticClass: "mm-soon" },
            this.consoleErr ? t("Couldn't load the AT console: {err}", { err: this.consoleErr }) : "Loading the AT console…"
          )]);
        }
      } else if (this.tab === "config") {
        panel = this.renderConfig(h);
      } else if (this.tab === "speedtest") {
        if (this.speedtestComp) {
          panel = h(this.speedtestComp, { props: { embedded: true } });
        } else {
          panel = h("div", { staticClass: "mm-card" }, [h(
            "div",
            { staticClass: "mm-soon" },
            this.speedtestErr ? t("Couldn't load the speed test: {err}", { err: this.speedtestErr }) : "Loading the speed test…"
          )]);
        }
      } else if (this.tab === "battery") {
        if (this.batteryComp) {
          panel = h(this.batteryComp, { props: { embedded: true } });
        } else {
          panel = h("div", { staticClass: "mm-card" }, [h(
            "div",
            { staticClass: "mm-soon" },
            this.batteryErr ? t("Couldn't load the battery view: {err}", { err: this.batteryErr }) : "Loading the battery view…"
          )]);
        }
      } else {
        panel = h("div", { staticClass: "mm-card" }, [h("div", { staticClass: "mm-soon" }, "Unknown tab.")]);
      }
      return h("div", { staticClass: "mm" }, [strip, this.pending ? this.renderRevert(h) : null, tabs, panel]);
    }
  }, [strip_default, change_default, bands_default, lock_default, neighbours_default, config_default, tabs_default, serving_default, styles_default]));
  return __toCommonJS(index_exports);
})();
return __mm.default;
})();

# GL firmware 4.10 — the cellular data contract MudiModem 2.x is built on

Every shape below was verified in the official `e5800-4.10.0_release5-1092` image
(plain-source Lua/JS quoted where it exists; `strings`/`nm` on binaries otherwise) and is
the ONLY firmware contract the code knows. Marks: 🟢 read in source · 🟡 binary strings ·
🔴 pin on a live box (listed at the end). Reference copies of the GL files live in
`reference/4.10/`.

## 1. Websocket (`/ws`) — status, never RF

`oui-ws.lua` (🟢 `reference/4.10/oui-ws.lua`): on `{"cmd":"subscribe","name":"<mod>.<ev>"}`
it sends ONE seed frame from `dofile('/usr/share/gl-ngx/websocket/<mod>.lua')[<ev>]()`, then
forwards every later frame that `gl-ngx-session` broadcasts under that `name`. Frames are
`{name, data}` and land in the SPA's Vuex `statusMap`; components read them with
`this.$store.getters.moduleStatus(name)`. The menu entry's `global_sockets` are subscribed at
login, for every page.

Only three GL cellular names exist (🟢 `websocket-cellular.lua`):

| name | source | shape |
|---|---|---|
| `cellular.modems_info` | `cellular.modem info` passthrough | `modems[]{bus, name, vendor, type (0 = built-in), band{LTE[],"NR-SA"[],"NR-NSA"[]}, sim_slot_num, slot_support_esim[], supports_ip_type[], …}` |
| `cellular.modems_status` | `cellular.modem status` ⋈ `cellular.sim status` ⋈ `cellular.network status` | `modems[]{bus, current_sim_slot, slot_switch_status, slot_switch_enable, status, dial_enable, simcard[]{slot, status, dial_status, technology, strength, type, apn, iccid, name, pin_counter, traffic_total, traffic_threshold, unit}}` |
| `cellular.networks_info` | `cellular.network info` ⋈ `cellular.sim info` | `networks[]{bus, slot, carrier, apn, apn_list[], iccid, imsi, mcc, mnc, phone_number, ip_type, network_mode, network_interface}` |

Rules that follow from the merge code:
- **`simcard[].dial_status` is `networks[].status` re-keyed** — the CONNECTION enum
  (0 connected, 1 connecting, 2 disconnected, 3 failed). GL's own internet.js maps
  `{0:"active",1:"connecting"}`. "Carrying data" == `dial_status === 0`. The raw
  `network.dial_status` only feeds the modem-level `dial_enable` and is never delivered.
- `simcard[].status`: 0 no SIM · 5 present/searching · 6 registered. Never key identity off
  the iccid string (a re-scanning modem reports garbage iccids with status 0).
- SIM identity (`iccid, imsi, mcc, mnc, phone_number, apn_list`) comes ONLY from
  `networks_info` — no extra RPC, no polling; it fills in on the next push.
- Dead names: `cellular.sims_info`, `cellular.sims_status`, `cellular.networks_status` are
  commented out in `websocket/cellular.lua`; subscribing yields nothing, ever.

### 1.1 MudiModem's own sockets — the whole live path, no polling anywhere
| name | seed (`/usr/share/gl-ngx/websocket/mudimodem.lua`) | pushed by | consumer |
|---|---|---|---|
| `mudimodem.collect` | `collect()` = `/tmp/mudimodem/latest.json` | collectd, every RF sample (10 s) | status strip, Tracking (+ console labels via the parent) |
| `mudimodem.battery` | `battery()` = `/tmp/mudimodem/battery-latest.json` | collectd, every battery sample (20 s) | Battery tab |
| `mudimodem.event` | `event()` = `{}` (history comes over RPC) | backend `append_event` (Keep/Revert/lock) and `mudimodem-revert` (auto-revert) | Tracking timeline |

Pushes are `ubus call gl-session notify '{"name":…,"data":…}'` — the bus `cellular_manager`
itself uses for `cellular.modems_status` (🟢 `gl-ngx-session.lua`, 🟡 `libcmstate_manager.so`);
`notify` is a no-op inside gl-session when no browser is attached, so it is called
unconditionally. `get_history` / `get_battery_history` remain only for the one-time window
preload and range backfill; each chart keeps a 30–45 s stall guard that fetches the tail once
if pushes stop (websocket reconnect, collector restart). The 1.x `collectd.sock` Unix socket is
gone with the LCD renderer it fed.

## 2. ubus (server-side only — the `/rpc` dot gate forbids dotted objects from the browser)

| call | notes |
|---|---|
| `cellular.modem status` (no args) | `{modems:[{bus, current_sim_slot, slot_switch_enable, …}]}` — GL's canonical form; `lib/functions/modem.sh get_current_sim_slot`, `websocket/cellular.lua` and `internet.js` all parse `.modems[]`. **The only shape the code accepts** (`cellular_compat.pick_modem` / Lua `pick_modem` select the built-in modem by `bus == "cpu"` / `type == 0`). The bus-scoped call form is never used. |
| `cellular.modem info` (no args) | `modems[]` with `.band` (module-supported sets) |
| `cellular.sim info` (no args) | `sims[]{slot, mcc, mnc, iccid, …}` — PLMN for the sub_id resolver |
| `cellular.network info` | `networks[]{bus, slot, carrier, …}` — carrier/identity, read every 60 s by collectd |
| `cellular.network cell_info {"bus":"cpu","slot":N}` | `{network_type, tac, cell_id, signal[]{ca, network_type, band, earfcn, pci, bandwidth, rsrp, rsrq, sinr, rssi, rscp, ecio, snr, rsrp_level…snr_level (7), strength}}` — EVERY row carries `network_type` and `pci` (🟢 handler `libcm_network.so` @0x8284, both row emitters @0x88d4/@0x8ab0, ≤5 rows). EN-DC: QCAINFO `PCC` = LTE anchor → row 4, `SCC` lines whose band token starts with `N` → row 51 (`libcm_modem.so` parse_qcainfo_line @0x27bd4), cell 51; plain LTE CA → 41. ⚠️ When QCAINFO yields no carriers the handler emits ONE fallback row from the QENG servingcell struct (LTE-anchor band/pci/earfcn) stamped with the CELL's code — `cellular_compat._row_network_type` re-tags an NR-coded row on an E-UTRA channel as LTE. Top-level code: `modem_network_mode_to_public_code` (`libcmutils.so` table @0x10db7: 6→4, 7→41, 8→51, 9→5). **Executes `AT+QENG`/`AT+QCAINFO` on every call** (🟢 `libcm_modem.so` quectel_get_qcainfo_signal @0x2710c: templates @0x271dc/@0x274ec; no `AT+QNWINFO` anywhere) — collectd is the only caller, at 10 s, and everything else (speed test, cell lock) reuses its `latest.json` while it is < 30 s old |
| `modem.CPU.AT get_result_AT {cmd, timeout, sub_id}` | provider `/usr/bin/modem_AT` (spawned per bus by `cellular_manager`); the only path with an explicit `sub_id` — used for `policy_band` / `ue_capability_band` / `QNWLOCK` reads |
| `gl-session notify {name, data}` / `has_websocket` / `call {module, func, params}` | push bus; browser-attached probe; root loop-back into `/rpc` (`is_local` + `glinet` header) — how the watchdog restores bands from a shell |

No-service `cell_info`: `network_type 0`, empty `cell_id`/`tac`, `signal[]` rows of
`band/earfcn/pci/bandwidth 0` and metrics `-32768` → normalized to `null`s + `signals: []`.

`network_type` enum — settled 🟢: GL's cellular-detail display map is
`{2:"2G",3:"3G",4:"4G",41:"4G+",5:"5G SA",51:"5G NSA"}` (+ `1 GSM`, `6 EVDO` in its string
map), `formatBand {4:"B",41:"B",5:"n",51:"n"}`, `hasRssi [4,41,51]` (RSSI exists for LTE and
for NSA's LTE anchor, never for SA). Two live captures agree: issue #5's NSA sample was `51`
with an LTE B3 anchor (EARFCN 1700); the EU unit's SA n78 sample was `5`. ⚠️ GL's OTHER map
(`getNetworkType`) has 5/51 swapped — a GL bug; physics + captures win. Ours:
`1 GSM · 2 2G · 3 3G · 4 LTE · 41 LTE+ · 5 NR5G-SA · 51 NR5G-NSA · 6 EVDO`.

## 3. The normalized sample (`src/lib/cellular_compat.py` → every consumer)

```json
{"t": 1700000000000, "slot": 1, "registered": true, "carrier": "CHN-UNICOM",
 "rat": "NR5G-SA", "network_type": 5, "cell_id": "DE017C015", "tac": "DE0000",
 "signals": [{"role": "PCC", "ca": 0, "network_type": 5, "rat": "NR5G-SA", "band": 78,
              "earfcn": 627264, "pci": 142, "bandwidth_mhz": 100, "bandwidth_ul_mhz": null,
              "rsrp": -94, "rsrq": -10, "sinr": 12, "rssi": null,
              "rsrp_level": 4, "rsrq_level": null, "sinr_level": null}],
 "id": "DE017C015", "band": 78, "mode": "NR5G-SA", "pci": 142, "tx_channel": 627264,
 "dl_bandwidth": "100MHz", "rsrp": -94, "rsrq": -10, "sinr": 12, "rssi": null,
 "rsrp_level": 4, "rsrq_level": null, "sinr_level": null}
```
`signals[]` is the full CA picture (`signal[0]` = PCC, others SCCn); the flattened keys are
the PCC aliases so single-carrier consumers (LCD, strip, tracking, speedtest) need no CA
awareness. Written to `/tmp/mudimodem/samples.jsonl` + `latest.json`, broadcast on
`collectd.sock`, pushed as `mudimodem.collect`.

## 4. GL web RPC used by MudiModem (undotted `modem.*`, browser- or glc-callable)

| method | args (exactly what GL's own UI sends) | used by |
|---|---|---|
| `get_band_config` | `{bus, slot}` → `{band_enable, network_mode:"AUTO"\|"NR5G"\|"LTE", band_filter_mode (echo), supports_band, band_list?}`. **Not a ubus method**: `glc` `dlsym()`s the C function `get_band_config` exported by `libcm_modem.so`, which reads `cellular.modem get_feature_config` and re-keys it (`reference/4.10/re-notes.md`). glc is therefore the only server-side transport. | backend `get_bands` (via glc) |
| `set_band_config` | `{bus, slot, band_enable, network_mode, band_list:{LTE:[], "NR-NSA":[], "NR-SA":[]}}` — no `band_filter_mode`; mode `LTE` ⇒ NR lists empty; `band_enable:false` ⇒ no `band_list` (filtering off = GL's default) | backend `set_bands` / watchdog restore + panic |
| `get_cell_tower {bus}` / `set_cell_tower {bus, slot, lock, network_type, pci, freq, scs?, band?, …}` / `scan_cell_tower {bus, slot}` / `get_operator_config {bus, slot}` | cell lock (glc). 🟢 read in the image (`libcm_network.so` set_cell_tower @0x11e18 → `libcm_modem.so` quectel_set_tower @0x2adbc): the handler reads bus (required, else 20002001), slot, lock, network_type, pci, freq, band, scs, mnc, mcc, srxlev, squal, bandwidth, cellid, tac, carrier; the record lives in `/etc/config/cellular/slot_map.json` → `slot_feature.<name>.tower` (deleted on unlock). **lock=false clears ONE family, chosen by `network_type`** (`"NR5G"` → `AT+QNWLOCK="common/5g",0`, anything else → `"common/4g",0`; skipped when that family reads unlocked), then `save_ctrl,0,0` + `AT+QEFSSYNC=1`. lock=true: 5G `QNWLOCK="common/5g",pci,freq,scs,band`, 4G `"common/4g",1,freq,pci`, then `save_ctrl,1,1`. **Neither lock nor unlock sends `mode_pref`/`nr5g_disable_mode`** (no such reference in quectel_set_tower — the 4.8-era "lock forces mode_pref" is the module's own behaviour, not GL's). **Success (lock or unlock) sleeps 2 s then `cellular.cm cm_start_dial {bus, slot, source:9}` — a redial.** `slot != current_sim` → record saved only, no AT. Errors: 20002044 lock, 20002050 unlock, 20002052 save-only. |
| `get_sim_config {slot, bus, iccid}` / `set_sim_config {… apn, protocol, auth, username, password, dial_number, ip_type:Number, roaming, rrc_seg, ttl, ttl_ipv6, hl, mtu}` | SIM tab (read-modify-write; **no band fields any more**) |
| `get_slot_failover_config {bus}` / `set_slot_failover_config {bus, current_sim}` (switch) or `{bus, enable_switch, slot_priority, enable_timing, hour, min, current_sim, slot_type…}` (settings) | SIM tab |

## 5. Other 4.10 facts the code relies on
- `/rpc` plugin contract, dot gate (`oui-rpc.lua:91`), default arg allowlist
  `'^[%w%.%s%-_:#/]-$'` and the per-object validator are byte-identical to 4.8;
  `oui.ubus.call` is still a cosocket (never `pcall` it) and now proxies through
  `/var/run/ngx-ubus-proxy.sock` to `gl-ngx-session` (optional 4th arg `timeout` ms).
- `gl_modem` is a one-shot CLI now; `cellular_manager` → `modem_AT` is the AT poller.
  `/dev/at_mdm0` (bridged by `port-bridge at_mdm0 at_usb0 0`) remains our own AT channel.
- busybox has no `pkill` (use `pgrep` + `kill`); `curl openssl flock nohup killall setsid`
  are present.
- `quec_battery` (START=04) actively manages `vreg/charge_en/hiz_mode` on the same sysfs
  nodes `glbattlimit` writes (🔴 duel test).

## 6. What the image settled, and the short list that only a running box can answer

Settled from the image (second pass, 2026-09-02):
- **`cellular.modem status` wrapper:** GL's own `lib/functions/modem.sh get_current_sim_slot`
  parses the NO-ARG form as `@.modems[@.bus='…'].current_sim_slot`, as does `websocket/
  cellular.lua` and `internet.js`. The code calls it with NO arguments and accepts ONLY that
  `modems[]` form (`cellular_compat.pick_modem` / Lua `pick_modem` select the built-in modem by
  `bus == "cpu"` / `type == 0`); no flat-object shape is parsed.
- **`network_type` enum:** §2 (GL's own maps + two live captures).
- **`set_band_config` applies to the modem AND redials** 🟢 (`libcm_modem.so` @0x223fc): it
  stores via `cellular.modem set_feature_config`, `sync()`, and when `slot == current_sim`
  calls `cellular.cm cm_start_dial {bus, slot, source:3}` (@0x22ca0; otherwise logs
  `skip cm_start_dial`). cellular_manager's handler then runs `quectel_set_band_info`
  (@0x29c28), which emits the band lists plus `mode_pref`/`nr5g_disable_mode` literals chosen
  from network_mode AND the band counts (AUTO/0, NR5G/2, LTE:NR5G/1, LTE). `network_mode` is
  stored and re-read **verbatim, unvalidated** (get_band_config deep-copies it; set_band_config
  only strcmp's NR5G/LTE to decide `band_enable`), and cellular_manager formats the stored
  string into `AT+QNWPREFCFG="mode_pref",%s` (≤15 bytes) — so a non-enum value is reachable by
  construction (our `mode_raw` passthrough) even though GL's own writers only ever store
  AUTO/NR5G/LTE. The dropped-reply handling in the UI (Keep/Revert offered) covers the redial.
- **Backlight:** the E5800 DTB in `boot.img` (`model = "GL.iNet E5800, …"`) puts the
  `pwm-backlight` node at `/soc/backlight` → sysfs `soc:backlight`, 120-entry brightness table
  (= the 20..120 range the LCD tab uses). `/proc/device-tree/model` contains `E5800`.
- **Charger/gauge hardware is the 4.8 set:** DTB nodes `sgm41542S`, `sgm,sgm41600`,
  `cellwise,cw2217`, `qcom,battery-charger`, `awinic,aw35615` — the same drivers whose sysfs
  (`online/status/charge_type`, mA `current_now`) was measured live on 4.8; kernel line 5.15.170
  unchanged.
- **Baseband:** the 4.10 OTA ships `RG650VNA01ACR02A04G8G` (NA) — byte-identical to the
  revision the 4.8 box reported — and `RG650VEU00ADR02A04G8G` (EU). AT behaviour, sub_id map
  and policy sets carry over; nothing new to re-probe on NA.
- **Install guards** (`/proc/device-tree/model`, `/proc/gl-hw-info/model == e5800`, `/etc/glversion`).

🔴 Genuinely runtime (state or timing, not derivable from files):
1. Does `set_band_config` redial? (mitigated in the UI; a Phase-0 observation, not a blocker.)
2. `quec_battery` vs `glbattlimit` cadence duel (`quec_battery` logs `sleep :%d s` — dynamic;
   it existed on 4.8 too, where glbattlimit demonstrably held).
3. `cellular.collect` / `modem.get_signals` cadence — `interval`/`max_count` come from a
   runtime-generated `/etc/config/collection.json`; only matters for the optional cheaper
   signal source, nothing depends on it.
4. `get_band_config` response extras (`supports_band`, `band_filter_mode` echo) — keys exist
   in `libcm_modem.so`; the code ignores extras either way.

Closed by binary analysis (was "needs `ubus -v list`"): **band config has no dotted ubus
object to call directly** — `get/set_band_config` are in-process C functions reached through
`glc`'s `dlopen`/`dlsym`, wrapping `cellular.modem get/set_feature_config {bus, location_id,
data}` + the module write. Keeping glc is the design, not a workaround.

# MudiModem — platform & domain knowledge (GL firmware 4.10)

Curated from the 2.2.0-era CLAUDE.md (kept verbatim in `docs/history/CLAUDE-2.2.0.md`). This file
holds only what is **true on 4.10 today**; the history of how each fact was found (and the 4.8
details) stays in the archive. Exact GL shapes live in `docs/cellular-api-4.10.md`; AT evidence in
`reference/quectel-at-reference.md`. Where this file and the firmware image disagree, the image
wins — fix this file.

Marks: 🟢 read in the image or verified on a box · 🟡 binary strings / disassembly · 🔴 runtime-only.

---

## 1. Device
- **GL.iNet GL-E5800 ("Mudi 7")**, Qualcomm SDXPINN, `aarch64_cortex-a53`, OpenWrt 23.05.4, musl,
  BusyBox `ash`. GL firmware **4.10.0** (`/etc/glversion`).
- Modem **Quectel RG650V** — NA (`RG650VNA01ACR02A04G8G`) or EU (`RG650VEU00ADR02A04G8G`);
  the 4.10 OTA carries both basebands. GL keys behaviour on `name` (`"RG650V-EU"`), so read the
  model from `cellular.modems_info`, never assume NA.
- **No AT manual exists for the 6-series.** `docs/` may hold the 5-series (RG50xQ) manual locally
  (gitignored, copyrighted) — a hypothesis generator, wrong in confirmed ways. The firmware image
  (GL's own AT templates) and, last, a box are the authorities.
- Install guards: `/proc/device-tree/model` contains `E5800`, `/proc/gl-hw-info/model == e5800`,
  `/etc/glversion >= 4.10` (numeric compare, fail closed on non-numeric).

## 2. GL's web admin (what we extend)
- An **oui** Vue 2.6.12 **runtime-only** SPA (no template compiler ⇒ `render(h)` only, never
  `template:`), served by **nginx + Lua**. uhttpd on :8080/:8443 (LuCI) is irrelevant.
- **nginx runs ONE worker on 4.10** 🟢 (`etc/nginx/nginx.conf: worker_processes 1`; GL's
  `set_nginx_thread` does not touch it for e5800; 🔴 `ps` on a box to be certain). Anything that
  blocks inside our RPC plugin (`os.execute`, `io.popen`, `sleep`) stalls the **whole admin**,
  `/ws` pushes included. Cosocket calls (`oui.ubus`, `ngx.location.capture`) yield and are fine.
- `/cgi-bin/` (glc) has `fastcgi_read_timeout 300` 🟢 — no glc call can take longer than 5 min.
- **Pages are chunks loaded at runtime:** `axios.get("/views/gl-sdk4-ui-<view>.common.js?_t=…")`
  then `eval(res.data)` inside a webpack module wrapper ⇒ the file must be ONE expression whose
  value is the component: `module.exports = {...}` (or an IIFE returning it). `module` is in scope.
  `gzip_static on` ⇒ ship only the `.gz`. The `?_t=` cache-buster means a page reload refetches.
  Chunks are served **unauthenticated** — never put secrets in them.
- **Menu entries** = `/usr/share/oui/menu.d/<view>.json`, read per call by `ui.get_menu_list`
  (no nginx reload). `level` is menu depth: `1` top-level (needs `icon`, `index`), `2` child of
  `parent` (needs `parent`, `parent_icon`, `parent_index`, `index`), anything else (e.g. `0`) =
  route only. `title` may be a literal or `{"translate":"<i18n key>"}`. `icon` must be a glyph in
  GL's iconfont (`modem`, `cellular`, `cellular-lock`, `simcard`, …). **A malformed menu JSON
  breaks the whole admin's menu.** Routes get `path:/<view>`, `meta.needAuth`.
- **`global_sockets`** in a menu entry: app.js subscribes the **union** of all entries' names over
  `/ws` at ws open and stores frames in Vuex `statusMap`; read with
  `this.$store.getters.moduleStatus(name)`. The `/ws` seed for `<mod>.<ev>` comes from
  `dofile('/usr/share/gl-ngx/websocket/<mod>.lua')[<ev>]()`; later frames come from
  `ubus call gl-session notify {name, data}`. Live cellular names: `cellular.modems_info`,
  `cellular.modems_status`, `cellular.networks_info` (+ `cellular.dial_status` 🟡); ours:
  `mudimodem.collect`, `mudimodem.battery`, `mudimodem.event`.
- **RPC from a chunk:** `window.$rpcRequest("call", ["sid", "<object>", "<method>", {args}], opts)`.
  Pass the literal `"sid"` (the helper swaps in the cookie only for a truthy placeholder). It
  resolves to `result`, rejects on `error`/`err_code` and **raises GL's global error banner** —
  so background/retrying calls go through a direct `$axios.post("/rpc", …)` ("rpcSilent") and
  only user-initiated one-shots use `$rpcRequest`. Also global: `$axios`, `$message`,
  `$getCookie`, `window.$i18n` (vue-i18n 8.28, `mergeLocaleMessage`, fallback `en`).
- **i18n:** GL ships en/de/es/it/ja/zh-cn/zh-tw as `/www/i18n/gl-sdk4-ui-<pkg>.<lang>.json`,
  merged by `ui.load_locales` into `window.$i18n`. Do **not** drop files there (`/www` is not kept
  across upgrades, and a bad file makes `load_locales` fail and app.js retry forever ⇒ admin
  hangs); merge our strings from the chunk with `$i18n.mergeLocaleMessage`.
- **Theme:** colours are CSS variables from `/www/theme/base.css` + `/www/theme/{default,classic,
  dark}/index.css.gz`. Use only variables those define (`--primary`, `--success`, `--error`,
  `--warning`, `--secondary`, `--text-title/-weak/-hint/-badge`, `--background-card/-title`,
  `--*-background`, `--border`, `--divider`, …). In dark theme `--info-hover == --text-hint`.

## 3. The `/rpc` path and our backend
- `POST /rpc` → `oui-rpc.lua` → `oui.rpc.call` → `dofile("/usr/lib/oui-httpd/rpc/<object>")`
  (keeps the table's functions, calls `fn(args)`) → falls back to glc (`/cgi-bin/glc`, the `.so`
  plugins like `modem.so`) when no Lua method matches.
- **The dot rule:** the object name must match `^[%a_][%w%-_]+$` — no dots. The browser can never
  call `cellular.*` / `modem.CPU.AT`; our undotted `mudimodem` plugin calls them server-side.
  GL's own undotted `modem.*` glc methods (band config, cell tower, scans, SIM config, …) ARE
  browser-callable and admin-gated.
- **ACL:** `aclgroup == "root"` is always allowed; the admin session is root. No ACL file needed;
  never add no-auth methods.
- **Argument validation:** without `/usr/share/gl-validator.d/<object>.lua`, oui applies a default
  string allowlist (`^[%w%.%s%-_:#/]-$`) to every string arg — no `+ = " , ( )`, so real AT
  commands fail with -32602 **before the plugin runs**. Numbers/booleans pass untouched. Every new
  free-form string param needs a validator entry; isolation tests call the plugin directly and
  cannot see this layer.
- Plugin environment: `require "oui.ubus"` (`ubus.call(obj, method, args)` → `(res)` or
  `(nil, err)`, dotted names fine), `uci`, `oui.fs`, `oui.rpc`, `cjson`, `ngx.*`.
  `lua_package_path "/usr/lib/lua/?.lua;;"` 🟢.
- nginx caches each plugin per worker ⇒ **restart** nginx after changing the plugin (reload leaves
  old workers serving the old code for a while).

## 4. Cellular domain
### 4.1 The three-layer band model (the project's core insight)
`capability = config ∩ policy`, **per subscription (SIM)**:

| Layer | Source |
|---|---|
| module supports (what GL's UI offers) | `cellular.modem info → modems[].band` (also `/lib/modem_data/modem_list.json`) |
| carrier policy permits | `AT+QNWPREFCFG="policy_band"` (AT only) |
| user config | GL's per-slot store: `modem.get_band_config {bus, slot}` (glc) |
| ⇒ modem advertises | `AT+QNWPREFCFG="ue_capability_band"` (AT only) |

GL's band dialog offers every module band; the ones policy blocks write "successfully" and are
never used. `0` in a band list means **empty**, not "all". Policy and config change with the SIM,
so the grid is per-SIM. You always send band **numbers**; any MHz in our UI is our annotation
from 3GPP TS 38.101-1 / 36.101.

### 4.2 Writes go through GL's own store
- Bands: `modem.set_band_config {bus, slot, band_enable, band_filter_mode, network_mode,
  band_list:{LTE,"NR-SA","NR-NSA"}}` via glc. One write, fail-closed, durable (cellular_manager
  re-applies GL's store on restart). `band_filter_mode` 0 = allowlist. GL's
  `quectel_set_band_info` derives `mode_pref` + `nr5g_disable_mode` from `network_mode` AND which
  lists are empty (@0x29c28 🟡). Panic/open state = `band_enable:false` + `AUTO`.
- Cell lock: `modem.set_cell_tower {bus, slot, lock, network_type, pci, freq, scs?, band?, …}`;
  `lock:false` clears ONE family (chosen by `network_type`). NR lock is PCI-first
  (`QNWLOCK="common/5g",pci,freq,scs,band`), LTE `"common/4g",1,freq,pci`; GL sets
  `save_ctrl,1,1` (lock survives reboot). A kept lock lives in modem NV and survives reflash and
  factory reset.
- **Both `set_band_config` and `set_cell_tower` REDIAL on success** (`cellular.cm cm_start_dial`)
  when the slot is the current one — every apply drops the link for a few seconds, so a dropped
  `/rpc` reply means "probably applied, watchdog armed".
- NV writes are immediate; there is no commit step (a "don't persist" option is impossible).
- **Never run to "look":** `AT+QNWPREFCFG="restore_band"` (an action), set forms of anything,
  `AT+QPRTPARA` with an unverified mode. Only `?` / `=?` forms are safe unprompted.

### 4.3 `sub_id` — the dangerous parameter
- `sub_id` is a **subscription index**, not a slot. GL uses `sub_id = slot` for the built-in modem
  (🟢 contract §2.1) and never sends `0`. **`sub_id=0` floats between subscriptions** and answers
  for different SIMs at different times — **never send it**.
- Resolve the active slot from `cellular.modem status → modems[].current_sim_slot`; try the slot's
  own sub_id first, then the other, confirm by `AT+CIMI` (IMSI), PLMN only as fallback; cache per
  iccid. Writes carry the `slot` the page read and refuse when the active SIM changed.
- DSDS, not DSDA: both SIMs register, one carries data. `current_sim_slot` (selected) can differ
  from the data-carrying slot during failover.

### 4.4 Reading RF
- `cellular.network cell_info {bus, slot}` is **not a cache** — every call runs QENG/QCAINFO on the
  shared AT channel. GL's own `cellular_manager` already samples QENG+QCAINFO every 10 s
  (`libcmcollect.so`, kept in RAM, 180 samples, `cellular.collect get_signals {time, slot}` 🟡).
  Any new RF reader must consume our collector's `latest.json` / `mudimodem.collect`, never call
  `cell_info` itself.
- `network_type` enum: 2/3 = 2G/3G, 4 = LTE, **41 = LTE-CA (4G+)**, **5 = NR SA**, **51 = NR NSA**.
  GL's own `getNetworkType` map is wrong (5/51 swapped, 2/3 shifted) — ignore it.
- Under NSA the PCC row is the LTE anchor; the NR leg is in `signals[]`.
- `networks_info` also carries `ambr_dl/ambr_ul` (carrier max bit rate), `ipv4{}`, `ipv6`.

### 4.5 AT transport
- Primary: `ubus call modem.CPU.AT get_result_AT {cmd, timeout, sub_id=slot, source_flag:1}` —
  GL's `modem_AT` (one IO thread, request queue, drain-before-send, expected-prefix check,
  `AT+QUIMSUB` per request, notifies `cellular.status` on state-changing commands). Reply buffer
  4095 bytes. Build the JSON with proper escaping.
- Fallback only when `modem.CPU.AT` is not registered: `/dev/at_mdm0` (read continuously by GL's
  `port-bridge`; answers for whatever subscription the port is on; not a tty; filter URCs).
- `gl_modem` is not a daemon on 4.10 (nothing to signal).

### 4.6 The AT library
Community snippets, separate repo `kevinherzig/mudi7-at-library` (CI publishes
`dist/at-library.json` + `version.json`); a baked snapshot ships as the offline cache. Every entry
has a mandatory `risk` (`read` · `set` runtime · `nv` survives factory reset), `verified[]` +
`source` (unverified renders as "nobody yet"), and an optional `decode` field list that labels a
comma-separated reply. Nothing auto-runs; `{{params}}` must be filled; set/nv need the
"higher-risk" toggle.

## 5. Battery
- sysfs `power_supply`: `current_now` is **mA** (signed, + charging), `voltage_now` µV, the
  charger node's limits µA — convert per node.
- `glbattlimit` gates charging by lowering the buck `vreg` below cell voltage, which makes the
  charger report `Full` + `Trickle`; so "charging stopped" cannot be attributed from `status` —
  the collector records the limiter's own state per sample (`lim`, `lim_gauge`). GL's
  `quec_battery` derates `vreg` for heat/age; glbattlimit saves GL's value and hands exactly that
  back.
- Two charge scales disagree by ~9 points (GUI vs fuel-gauge IC); label which one.

## 6. Persistence across firmware upgrades
- Every E5800 upgrade ends in `abfota_update start-fota`; with Keep Settings it keeps exactly the
  paths in `/lib/upgrade/keep.d/*` (one literal path per line, no globs; a directory keeps its
  tree; only under `/etc /usr /lib /bin /sbin /data /var`). **`/etc/sysupgrade.conf` is never
  read; `/www` is never restored; opkg packages are gone** (python3 included). procd enable links
  (`/etc/rc.d/S<START>name`, `K<STOP>name`) must be listed or services come back disabled.
- Everything the image ships (lua 5.1/5.4, **lua-eco**, libubus-lua, luaposix, luasocket,
  lsqlite3, cjson, curl, jsonfilter, sqlite3) survives upgrades.
- Our web payload lives in `/usr/share/mudimodem/www`, served by the `gl-conf.d` alias
  (`/views/gl-sdk4-ui-mudimodem*`, `/mudimodem/`).
- Factory reset wipes our files; it does NOT clear a modem NV band/cell lock — the panic restore
  (`/usr/sbin/mudimodem-revert panic`) is the way back.

## 7. Engineering gotchas
- **Never wrap `oui.ubus.call` in `pcall`** — it yields on a cosocket and Lua 5.1 cannot yield
  across a C call; you get "attempt to yield across C-call boundary" (and silent empties if
  swallowed). It already returns `(nil, err)`.
- **OpenWrt Lua 5.1 has the LNUM patch: integers are 32-bit.** `string.format("%d", os.time()*1000)`
  throws; use `%.0f` / `tostring`. GL's cjson has `empty_array` /
  `encode_empty_table_as_object` (the host's may not); oui sets
  `encode_empty_table_as_object(false)`.
- **busybox has no `pkill` and no `setsid`** (`pgrep` + `kill`). Detached children from the
  backend must go through `/usr/lib/mudimodem/mudimodem-detach` (closes nginx's fds) — a bare
  `os.execute("… &")` inherits the listening sockets.
- `jsonfilter -e '@.x'` prints nothing and exits 1 when the path is missing.
- Never inline Lua/AT/JSON into `ssh '…'` — write a file, `cat >` it over, run it.
- Analyse GL's minified chunks with Python (they are one-liners; `grep -c` counts lines).
- Never call `clear_cell_lock` / any write in a test against a real box.

## 8. Ruled out (don't re-derive)
- Patching GL's SPA or `/www/views/gl-sdk4-ui-*` (an OTA overwrites them) — we ship our own names.
- Extending closed `modem.so`; a LuCI app or a standalone page (no integration).
- A revert timer inside nginx (reload cancels timers; one worker is blocked by anything slow).
- A "don't write NV" checkbox (no commit step exists).
- The premise "GL lacks these controls" — it has them; they are undiscoverable, scattered and
  misrepresenting (§4.1). That is why MudiModem exists.

## 9. Open questions
1. `AT+QPRTPARA` (1–4) mapping — believed 1 backup, 3 force restore, 4 info (other family's doc);
   unverified, never run it guessing.
2. Is `policy_band` writable (`policy_mode` exists, undocumented)?
3. `AT+QENG="neighbourcell"` on NR (SA/NSA) — format unknown.
4. `AT+QCAINFO` `<pcell_state>` returned `5` (documented 0|1) — don't decode positionally.
5. The full `quectel_set_band_info` branch table (which empty-list combinations emit
   `nr5g_disable_mode` 1/2) — settle by disassembly first.
6. Real duration of `scan_cell_tower` vs the 300 s glc timeout.

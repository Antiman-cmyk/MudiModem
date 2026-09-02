# MudiModem — modem control panel inside the GL-E5800 "Mudi" web admin

**Goal:** a community add-on that installs a **Modem** page into the Mudi's stock GL web admin —
band lock, cell lock, live diagnostics, raw AT console, and a community **AT command
library**. It adds a page *alongside* GL's own; it patches nothing.

Sibling project: **`../MudiUI`** (a separate front-panel add-on — nothing of it ships here). Its
`CLAUDE.md` is the reference for **modem/AT/ubus knowledge** (its §6 data sources, §7 band+cell
lock) — don't re-derive it here.

> ## ⚠️ 2.0.0 (2026-09-02): the code targets **GL firmware 4.10 ONLY** — 4.8 support is gone.
> The authoritative 4.10 contract is **`docs/cellular-api-4.10.md`** (verified in the official
> `e5800-4.10.0_release5` image; GL's own files copied under `reference/4.10/`). Design + merge
> record: `docs/superpowers/plans/2026-09-02-firmware-4.10-migration-plan.md`; per-feature
> audit: `docs/superpowers/specs/2026-09-02-4.10-feature-dependency-audit.md`. **Where a section
> below says "4.8" or contradicts the contract doc, the contract doc wins.** The 4.10 deltas that
> reshaped the code:
> - **`/ws` is a push bus.** Only `cellular.modems_info` / `modems_status` (merged `simcard[]`) /
>   `networks_info` (merged identity) exist; `sims_*`/`networks_status` are dead. Our collector
>   publishes its own `mudimodem.collect` frames via `ubus call gl-session notify` (seeded by
>   `/usr/share/gl-ngx/websocket/mudimodem.lua`) — the page never polls for live RF.
> - **`cellular.network cell_info {bus,slot}` executes QENG/QCAINFO per call** — collectd samples
>   at 10 s (was 4 s) and everything else reuses its `latest.json`; `signals[]` carries CA.
> - **Bands go through GL's per-slot `modem.get/set_band_config`** (via glc): single write,
>   fail-closed, durable by construction; the watchdog restores the `get_band_config` snapshot;
>   panic = `band_enable:false` + AUTO. `get/set_feature_config`, Path-B and `gl-stale` are gone.
> - **`gl_modem` is not a daemon on 4.10** (`cellular_manager` → `modem_AT` polls); the AT tool
>   signals nothing. `/dev/at_mdm0` + `port-bridge` unchanged.
> - **busybox has no `pkill`** (`pgrep` + `kill`). Detached children go through
>   `/usr/lib/mudimodem/mudimodem-detach` (nginx fds closed).
> - **No LCD anything.** The 1.x front-LCD renderer (vendored MudiUI, LCD Display tab,
>   `get/set_lcd`, `collectd.sock`) was REMOVED in 2.0.0 and nothing LCD-related remains in
>   the tree; GL 4.10 ships its own Display Management page. `install.sh` and `uninstall.sh`
>   both purge a 1.x renderer left on the box (stop + disable `mudi`/`mudi-watch`, delete the
>   files, de-register them from sysupgrade.conf, hand the panel back to `gl_screen`).
> - **Scope rule (owner, 2026-09-02): ship only what stock 4.10 lacks or does incompletely.**
>   The SIM/APN tab is gone (GL's Internet page has it all); the lock tab's scan card stays
>   (it feeds our confirm-or-revert lock — the stock scan can only lock without a safety net).
> - **`gl-stale` is gone for real:** `get_lock`'s `stale` is derived live (GL's store locked
>   while the modem is not); no marker file, no `MUDIMODEM_STALE`.
> - **One data path, no polling:** collectd → `latest.json`/`battery-latest.json` + jsonl →
>   `gl-session notify` frames `mudimodem.collect` / `.battery` / `.event` (backend + watchdog
>   push events too) → the SPA store → `cellModel()` in the main chunk (the ONLY reader of GL's
>   sockets; child tabs get props). `get_history`/`get_battery_history` are preload/backfill only;
>   charts keep a stall guard, not a poll. `cellular.modem status/info` are always the no-arg
>   `modems[]` form (GL's own parsers); sub_id resolution is cached per worker.
> - Shared Python shapes live in `src/lib/cellular_compat.py` (collectd, speedtest).
> - install/deploy/verify enforce `/etc/glversion >= 4.10`; 4.8 users pin `legacy-4.8`.
> - Settled from the image, not the box (contract doc §6): `network_type` enum (5=SA, 51=NSA,
>   41=4G+ — GL's own `getNetworkType` map has 5/51 swapped, ignore it), backlight stays
>   `soc:backlight` (DTB), the 4.10 OTA's NA baseband is the SAME `RG650VNA01ACR02A04G8G`,
>   charger/gauge DT nodes unchanged, `set_band_config` writes the module immediately, and
>   `get/set_band_config` are C functions behind `glc` (no dotted ubus object exists — glc stays).
>   **Both `set_band_config` and `set_cell_tower` REDIAL on success** (`cellular.cm cm_start_dial`,
>   read in the image) — every band apply / lock / unlock drops the link for a few seconds, which
>   is why a dropped `/rpc` reply is treated as "probably applied, watchdog armed".
>   Method + tools: `reference/4.10/re-notes.md`.

Everything below was reverse-engineered from the live device (2026-07-16 / **-07-17**, GL 4.8.5)
and updated for 4.10 where marked. **Trust the box over this doc if they ever disagree** — then fix
the doc.

## Working agreements
- **Deploy transfer:** the box has **no sftp-server**, so `scp` fails — use `ssh host 'cat > /path' < file`.
- **Keep the real router IP out of this repo** (it's public). Use `<router-ip>` in docs.
- MudiModem never touches `/dev/fb0` or GL's `gl_screen` — the front panel is GL's.

## 1. Device access
- **SSH:** `ssh root@mudi` (hostname alias; key auth). BusyBox `ash`.
- **Hardware:** GL.iNet **GL-E5800** ("Mudi"), Qualcomm **SDXPINN**, `aarch64_cortex-a53`,
  GL firmware **4.8.5** / OpenWrt 23.05.4, kernel 5.15.170, musl.
- **Modem: Quectel `RG650V-NA`** (`ATI`) — the **NA** variant, not EU (GL's code branches on
  `isEuModem(){ return "RG650V-EU"===this.info.name }`). Revision `RG650VNA01ACR02A04G8G`;
  firmware `QRM650VNA01ACR02A04G8G_OCPU_RGH_01.005.01.005` (`AT+QGMR`). AT port `/dev/smd9`,
  `bus: "cpu"`, `vendor: "quectel"`, `type: 0` (= built-in; GL gates band UI on `type===0`).
- ⚠️ **No AT manual exists for the RG650V (6-series).** The one in `docs/` is the **5-series**
  (RG50xQ/RM5xxQ) — a generation older; close, but wrong in confirmed ways. **The box is the only
  authority.** Probe read-only and trust it over any doc. Details: `reference/quectel-at-reference.md`.
- **Web admin:** `http(s)://<router-ip>` → nginx. LuCI also installed (`/cgi-bin/luci`).

## 2. The web admin architecture (what we extend)

GL's admin is an **oui**-framework Vue SPA (lineage: `github.com/zhaojh329/oui`), served by
**nginx + lua** — *not* uhttpd. (uhttpd also runs, on :8080/:8443, serving `/www` + LuCI. Ignore it.)

| Piece | Location |
|---|---|
| nginx site config | `/etc/nginx/conf.d/gl.conf` (copy in `reference/`) |
| **`gzip_static on` + `root /www`** | **`/etc/nginx/nginx.conf` lines 25 / 27** — *not* `gl.conf` |
| SPA entry / app bundle | `/www/gl_home.html`, `/www/js/app.<hash>.js.gz` |
| **Page chunks** | **`/www/views/gl-sdk4-ui-<view>.common.js.gz`** |
| **Menu entries** | **`/usr/share/oui/menu.d/<view>.json`** |
| **RPC backends (Lua)** | **`/usr/lib/oui-httpd/rpc/<object>`** |
| RPC backends (C) | `/usr/lib/oui-httpd/rpc/<object>.so` (e.g. `modem.so`, closed) |
| Arg validators | `/usr/share/gl-validator.d/<object>.lua` |
| RPC/WS endpoints | `/rpc`, `/ws`, `/upload`, `/download` → `/usr/share/gl-ngx/oui-*.lua` |

**Pages are dynamically loaded, not compiled in.** Adding one = drop a chunk + a menu JSON. No
rebuild of GL's app, no closed binary in the way.

Menu JSON is tiny — the entire `modemsignallog.json` is:
```json
{ "view": "modemsignallog", "level": 0 }
```
Nesting under an existing section (`overview.json`):
```json
{ "index": 10, "view": "overview", "level": 2, "parent": "system",
  "parent_icon": "setting", "parent_index": 70 }
```
✅ **`level` semantics — RESOLVED (Phase 0): it is menu depth, not a permission tier.** From the
SPA's menu builder (`app.js`): `if (1===level) topLevel.push(...)` / `else if (2===level)` appends
to the `parent` group / **any other value (incl. `0`) enters neither branch → no menu entry**.
- `0` → route registered, hidden from the menu (`modemsignallog`, `sms`).
- `1` → top-level item; needs its own `icon` + `index`.
- `2` → child of `parent`; needs `parent`, `parent_icon`, `parent_index`, `index`.

Permissions are unrelated: routes get `meta:{needAuth:true}` regardless, and ACL is enforced at
`/rpc` (§3), not by the menu.

**Top-level nav is only 3 items** — `internet`(10), `wireless`(20), `clients`(30). Everything else
is a *parent group* synthesised from the `parent`/`parent_icon`/`parent_index` of level-2 entries
(`network` 48, `security` 50, `system` 70, …). **Our entry is now `level:1, index:15`** → sits
directly under Internet. (It was `level:2` under `network` at index 60 — the last child of a
collapsed group, i.e. as buried as GL's own band dialog.)

**`icon` must name a glyph in GL's iconfont** (`/www/fonts/iconfont.*.ttf`, 247 glyphs). Menu icons
all resolve there. Useful ones GL ships but never puts in the nav: **`modem`** (what we use),
`cellular`, `cellular-lock`, `simcard`, `full-signal`, `internet-cellular`, `modem-reboot`,
`monitor-waveform-regular-full`, `radar-regular-full`.

### ⭐ `global_sockets` — the read path, and why our backend is barely needed
**(4.10: only three cellular names exist plus our own `mudimodem.collect` — see the header and
`docs/cellular-api-4.10.md`; the six-name list below is the 4.8 history.)**
A menu entry may declare `global_sockets`, and the SPA subscribes over **`/ws`**, pushing each named
ubus object into the `statusMap` Vuex store. Read it in a component with the **`moduleStatus(name)`**
getter (`...mapGetters(["moduleStatus"])`).

**`/ws` is not `/rpc`, so the dot restriction (§3) never applies here** — GL's own `internet.json`
subscribes dotted `cellular.*` objects. **Ours (4.10) declares the three live cellular names plus
our collector's own push names:**
```json
{ "index": 15, "view": "mudimodem", "title": "Modem", "icon": "modem", "level": 1,
  "global_sockets": ["cellular.modems_info", "cellular.modems_status", "cellular.networks_info",
                     "mudimodem.collect", "mudimodem.battery", "mudimodem.event"] }
```
(4.8 listed six `cellular.*` names; `sims_info`/`sims_status`/`networks_status` are dead on 4.10.
app.js subscribes the UNION of every menu entry's `global_sockets` at ws open — read in the 4.10
bundle — so the level-0 tracking route needs no list of its own.)
⇒ **every read we need — band universe, modem identity, signal, SIM state — arrives free over the
websocket with no RPC and no backend.** The Lua backend is only needed for *writes* and for the AT
passthrough. This is the single biggest simplification to Phase 1.

Verified live: `ui.get_menu_list` returns our entry (44th) with `global_sockets` intact.

**The browser never reads `menu.d` directly** — it calls **`ui.get_menu_list`** (Lua bytecode; scans
`/usr/share/oui/menu.d`) and passes the result to the route builder, which adds each entry with a
`view` as a child of the `home` route at path `/<view>`. Consequences:
- Dropping in a menu JSON needs **no nginx reload** (the dir is re-scanned per call) — just reload the SPA.
- ⚠️ **A malformed menu JSON breaks `get_menu_list` for the *whole admin*, not just our page.**
  `tools/verify.sh` parses it on-device for exactly this reason.
- `title` may be a literal string (`"title": "Modem"`, as `dnsview.json` does) → no i18n key needed.

## 3. The RPC path (verified by reading the Lua)

Browser does `POST /rpc`, JSON-RPC:
```json
{"jsonrpc":"2.0","id":1,"method":"call","params":["<sid>","mudimodem","get_bands",{}]}
```
Chain: `oui-rpc.lua` → `oui.rpc M.call` → `dofile("/usr/lib/oui-httpd/rpc/<object>")` → our fn.
Falls back to `glc_call` (the `.so` via `/cgi-bin/glc`) if no Lua file / no matching method.

### ⚠️ The dot restriction — the single most important constraint
`oui-rpc.lua:91` gates the object name with `object:match('^[%a_][%w%-_]+$')` — **letters, digits,
`-`, `_` only. No dots.** So the browser **cannot** call `cellular.network`, `cellular.modem`, or
`modem.CPU.AT` — every modem ubus object is dotted.

This is why GL's own web-callable objects are all undotted: `sms_manager`, `gl-clients`, `mcu`,
`lpm`, `repeater`, `system`, `uci`. It's the architecture, not an accident.

**Consequence — the whole reason our backend exists:** the page calls **`mudimodem.set_bands`**;
our Lua does the dotted `ubus call modem.CPU.AT ...` **server-side, where no restriction applies.**

### ACL
`rpc.access(scope, entry)` → **`aclgroup == "root"` is always allowed** (`oui/rpc.lua:87`). The
admin session is root-group, so an authenticated admin can call our object with **no ACL file
needed**. Non-admin groups would need perms in oui's db (`oui.db`). Unauthenticated calls are
rejected unless listed no-auth — we want no no-auth methods.

## 4. Backend contract — a Lua file returning a table of functions

`M.call` does `dofile(script)`, keeps `type(v)=="function"` entries, calls `fn(args)`. That's it.
No daemon, no ubus registration, no compilation.

GL ships these **precompiled** (`luac`, `LuaQ` bytecode header, source paths like `./files/led.lua`)
— but **`dofile` loads plain source just fine, so we write readable Lua.**

Available inside a plugin (observed in GL's `led`, the smallest example at 1.5 KB):
```lua
local uci       = require "uci"
local ubus      = require "oui.ubus"      -- ubus.call(object, method, args) — dotted names OK here
local fs        = require "oui.fs"
local rpc       = require "oui.rpc"       -- rpc.ERROR_CODE_INVALID_PARAMS, ...
local validator = require "gl.validator"
-- ngx.pipe.spawn("/etc/init.d/gl_led", "restart") — can spawn processes
return { get_config = function(args) ... end, set_config = function(args) ... end }
```

## 5. Architecture — the files we ship

| File | Role |
|---|---|
| `/usr/lib/oui-httpd/rpc/mudimodem` | Lua backend; safe validated methods; dotted ubus calls |
| `/www/views/gl-sdk4-ui-mudimodem.common.js.gz` | the Vue page (gzipped — `gzip_static on`) |
| `/usr/share/oui/menu.d/mudimodem.json` | menu registration **+ `global_sockets`** (§2) — the read path |
| `/usr/sbin/mudimodem-revert` | detached auto-revert watchdog + ssh panic-restore |
| `/www/mudimodem/at-library.json.gz` | community AT command library (§7a); static, axios-fetched |
| `/usr/lib/mudimodem/mudimodem-at.py` | our own AT channel on `/dev/at_mdm0` (§7a); backend spawns it |
| `/www/views/gl-sdk4-ui-mudimodem-console.common.js.gz` | the AT-console tab chunk (lazy-loaded) |
| **`/usr/share/gl-validator.d/mudimodem.lua`** | **arg validator — REQUIRED for the AT console (§3), not optional** |
| `/usr/lib/mudimodem/cellular_compat.py` | the ONE place Python knows GL 4.10's cellular shapes (collectd + speedtest) |
| `/usr/lib/mudimodem/mudimodem-detach` | fd-closing wrapper every detached child (watchdog, speedtest, self-update) goes through |
| `/usr/share/gl-ngx/websocket/mudimodem.lua` | `/ws` seed module: `mudimodem.collect` (flagged `stale`+`age_s` when >60 s old) / `.battery` / `.event` |
| `/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz` | Battery tab chunk: 4-lane history chart + charge-limit form (§12, 2026-07-27) |

⚠️ **The validator is NOT optional once a method takes free-form input.** oui applies a **default
string-arg allowlist** (`^[%w%.%s%-_:#/]-$`) to every param when no per-object validator exists —
and that set has **no `+ = " , ( )`**, so every real AT command (`AT+CSQ`, `AT+QENG="servingcell"`)
is rejected with **-32602 "Invalid params of cmd"** *before the backend runs*; only bare `ATI`/`AT`
slip through. Ship `mudimodem.lua` returning `{ at_console = { cmd = '.-' } }` (mirrors GL's own
`modem.lua`, which uses `'.-'` for `send_at_command`'s `command`). Safe because the backend caps
length, strips CR/LF, and shell-escapes. ⚠️ **Our on-device backend tests `dofile` the plugin and
call the method directly — they BYPASS this /rpc validation layer, so they can't catch a -32602. Any
new free-form param needs a validator entry AND a `/rpc` round-trip test** (verify.sh §9). Same
stub-vs-real-path trap as the `pcall` cosocket bug (§8).

**Frontend decision: native oui view, hand-written, no toolchain.** The chunk is a webpack UMD
bundle exporting a Vue component (GL's are ~41 KB, core-js polyfills included). We hand-write plain
JS exporting a Vue options object — keeping this repo toolchain-free ("plain Python, no C").
✅ **Template compiler — RESOLVED (Phase 0): ABSENT. The bundle is Vue 2.6.12 runtime-only.**
So **`template:` is forbidden — use `render(h)`.** (Evidence: zero occurrences of `{{` in the
1.9 MB bundle. A full build necessarily contains Vue's own `defaultTagRE = /\{\{...\}\}/g`, so its
absence is conclusive. The usual `"You are using the runtime-only build"` warning proves nothing
either way — it's inside a dev-only block that production strips. `staticRenderFns`/`_withStripped`
are present: GL's chunks ship **precompiled** render functions.)

### How a chunk is actually loaded — it is `eval`'d, not `require`d
From `app.js` (webpack module `a35c`, which escaped minification):
```js
const loadViewBeforeEnter = (view, parent) => (to, from, next) => {
  axios.get(`/views/gl-sdk4-ui-${view}.common.js?_t=${(new Date).getTime()}`).then((res) => {
    const component = eval(res.data);           // <-- eval, so the file must be an EXPRESSION
    to.matched[parent ? matched.length-1 : 0].components.default = component;
    next();
  })
}
```
- **The chunk source must be an expression statement whose value is the component** →
  `module.exports = { ... };` (an assignment *expression* evaluates to the assigned value).
- **`module` is in scope**: it's a *direct* eval inside a webpack module wrapper declared
  `function(module, __webpack_exports__, __webpack_require__)`. This is why GL's chunks are
  `module.exports=(function(t){...})({...}).default;`.
- URL has **no `.gz`** — `gzip_static` serves the `.gz`. Ship only the `.gz` (as GL does). Requires
  the client to send `Accept-Encoding: gzip`; without it nginx finds no plain file and 302s.
  Browsers always send it.
- **`?_t=<timestamp>` is a cache-buster** → chunks are *not* browser-cached; no hard-reload needed
  when iterating (see §8).
- Routes are auto-registered from the menu: `path: "/<view>"`, `name: alias||view`,
  `meta:{needAuth:true}`, as a child of the `home` route. We add no router code.
- The chunk is served **without authentication** (it's a static file; auth lives at `/rpc`) —
  so never put anything secret in it.

### Auto-revert (safety) — why it is NOT in the nginx Lua
Band lock **persists in NV across reboots** and a bad lock can drop cellular — i.e. the link you're
administering over. So changes are **confirm-or-revert**.

**nginx runs 4 workers**, each with its own `dofile`'d copy of the plugin and *no shared state*
(`objects[object]` is per-worker) — a timer there is unreliable. Instead:

1. `set_bands`/`set_lock` writes the **previous** config to `/etc/mudimodem/pending.json`, then
   launches detached `/usr/sbin/mudimodem-revert`.
2. The watchdog sleeps ~60 s, then restores unless `mudimodem.confirm` removed the file.
3. State lives in **`/etc`, not `/tmp`** → survives reboot; a boot-time check catches a
   reboot-mid-window (the NV lock would otherwise outlive the watchdog).

Payoffs: survives nginx reload, and the same script is the **ssh-callable panic restore**.

**Known-good full band lists** (from MudiUI §7 — the panic restore writes these):
- SA: `AT+QNWPREFCFG="nr5g_band",2:5:7:12:13:14:25:26:29:30:38:41:48:66:70:71:77:78`
- NSA: `AT+QNWPREFCFG="nsa_nr5g_band",2:5:7:12:14:25:26:30:38:41:48:66:71:77:78`
- ✅ **These two lists are exactly the module-supported sets** (verified 2026-07-17 against
  `cellular.modem info`, band-for-band). "Known-good" is a misnomer: it isn't a curated safe subset,
  it's simply *everything the module supports*. Note that is **not** everything that *works* — see §5a.

## 5a. ⭐ The three-layer band model (verified 2026-07-17 — the core domain insight)

📖 **Full evidence + every captured response: `reference/quectel-at-reference.md`.** Read it before
touching AT. It marks every fact 🟢 verified-on-box vs 📘 from-the-manual (which is for a *different*
module family) — and lists the corrections it makes to earlier work.

**There is no single "supported bands" list. There are three, and they compose:**

> ### **`capability = config ∩ policy`**
> Verified across 6 independent checks including the empty cases.

| Layer | Source | Scope |
|---|---|---|
| **Module supports** — what GL's UI shows you | `ubus call cellular.modem info` → `.modems[0].band` | per **device** |
| **Carrier policy permits** | `AT+QNWPREFCFG="policy_band"` | **per subscription** |
| **You configured** | `AT+QNWPREFCFG="nr5g_band"` | **per subscription** |
| **⇒ Modem actually advertises** | `AT+QNWPREFCFG="ue_capability_band"` | **per subscription** |

Measured on this box — **both SIMs, because policy is per-SIM**:

| | **T-Mobile** (sub_id **1**, slot 1, **active**, n71) | **AT&T** (sub_id **0**, slot 2) |
|---|---|---|
| module SA | 18 | 18 |
| **policy** SA | **6**: 25,41,48,66,71,77 | **0** — none |
| config `nr5g_band` | **71** | all 18 |
| **⇒ capability** SA | **71** ✅ | **0** ✅ |
| **policy** LTE | 17 | 17 |
| config `lte_band` | 19 (adds **7**, **38**) | 19 |
| **⇒ capability** LTE | **17** ✅ | **17** ✅ |

- **LTE bands 7 and 38 are configured on both SIMs and silently dropped** — the misrepresentation, live, on the box.
- ✅ **`0` means EMPTY, not "all"** (resolves the old `nsa_nr5g_band,0` question). AT&T has no SA
  policy ⇒ no SA capability, despite an unrestricted config.
- ⚠️ **The band grid is therefore per-SIM.** Policy *and* config change with the subscription;
  switching SIM must re-fetch both.

**Consequences — this is what MudiModem is for:**
- **GL's band dialog offers 18 SA checkboxes; policy permits 6.** The other 12 write cleanly, return
  success, and the modem never uses them. GL never queries `policy_band` (zero hits for
  `QNWPREFCFG` anywhere in its frontend). **The UI misrepresents, and one AT query proves it.**
- The band grid therefore needs a state we'd never designed: *module-supported but policy-blocked* —
  shown, explained, **not selectable**.
- **`policy_band` is the number that matters**, not the module list. Show all three; lead with policy.

### ⭐ Where GL's band CONFIG actually lives — pre-parsed, no AT needed (corrected 2026-07-17)
`ubus call cellular.modem get_feature_config '{"bus":"cpu"}'` (also `get_all_config`, per-slot)
returns GL's stored band config **already parsed**:
```json
{ "band": { "band_enable": true, "band_filter_mode": 0,
            "band_list": { "LTE": [], "NR-SA": [71], "NR-NSA": [] } } }
```
- `band_filter_mode`: **0 = Open (allowlist)**, 1 = Block (denylist). Here: allow only NR-SA n71.
- ⇒ **GL's config and the modem AGREE** (both say n71). The band lock IS tracked by GL.
- ⚠️ **CORRECTION:** an earlier version of this doc claimed they *disagree* — that was from checking
  `cellular.sim get_config` (returns SIM auth/APN, **no band_list**), the wrong method. **Band config
  is in `cellular.modem get_feature_config`, not `sim get_config`.** Trust the box.

**What GL config still does NOT surface: `policy_band` / `ue_capability_band`.** Those are AT-only
(§ reference §2). So the three-layer *misrepresentation* stands — GL offers all 18 module bands as checkboxes and
never shows that policy permits 6.

📌 **CONFIG + MODE read path (settled 2026-07-17 after two reversals): `get_feature_config` (ubus).**
`get_bands` reads config (`NR-SA`/`NR-NSA`/`LTE`) and mode (`network_mode`) from **one**
`cellular.modem get_feature_config` call — NOT raw AT. History of the flip-flop, so nobody re-does it:
- v1 read config from `cellular.sim get_config` → wrong method (no band_list).
- v2 read config from raw AT (`nr5g_band` etc.) because `get_feature_config` was **stale after our
  raw-AT `set_bands`** (the n66-vanishes bug: GL's stored view didn't see our write).
- v3 (current) back to `get_feature_config`, because **Path B fixed the staleness**: `confirm()` now
  writes GL's stored config via `set_feature_config`, so GL and the modem agree after every Keep. It
  lags only during a *pending revert*, when editing is locked — so it's accurate whenever it matters.
- **Why it matters:** the AT channel is shared with GL's polling. `get_bands` doing ~7 raw-AT reads
  made it slow enough to trip the admin's request-timeout banner and congest GL's polling. The ubus
  read dropped 4 AT round-trips (get_bands ~0.04s stable). **policy + capability stay on raw AT**
  (AT-only) — keep the AT count minimal.

✅ **DURABILITY GAP — CLOSED in 2.0.0:** `set_bands` writes GL's own per-slot `set_band_config`,
so `cellular_manager` re-applies OUR value on restart. The paragraph below is 4.8 history.
⚠️⚠️ **DURABILITY GAP (2026-07-17) — raw-AT band writes revert on `cellular_manager` restart.**
GL's `cellular_manager` **re-applies its stored config to the modem on (re)start**, overwriting raw-AT
changes. Verified: an experiment-set `nr5g_band=25:41:48:66:77` reset to **`71`** (GL's stored value)
after a manager restart. So **`set_bands` (raw AT only) is NOT durable** — a change survives until the
next manager restart or reboot, then reverts to GL's config. **Open design task: `set_bands` should
ALSO update GL's config via `modem.set_sim_config`** (§6; bare integers `{band_enable,
band_filter_mode, band_list}`) so the two agree and the change persists. (Silver lining: a
reboot/manager-restart is a *free* second revert path to GL's stored bands.) Full detail: reference §11.

### NV semantics (verified 2026-07-17)
- **No commit step for band commands.** `AT+QNWPREFCFG` writes NV **immediately**; there is no
  staging area, so a "don't persist this" checkbox is **not possible**. (`AT&V` does show a classic
  Hayes profile — `&W: 0`, S-registers — but `&W` governs only the serial profile, not network config.)
- **NV *can* be backed up:** `AT+QPRTPARA=?` → `(1-4)` (Quectel NV backup/restore) and
  `AT+QNVFR=?` → `<nv_files>` (per-file NV read). ⚠️ **The 1–4 mapping is UNVERIFIED — do not fire
  it while guessing which is backup and which is restore.** Get the manual first.
- ⚠️ **`AT+QNWPREFCFG="restore_band"` is an ACTION, not a query** — it takes no argument in the test
  form. Running it would very likely wipe the deliberate n71 lock. **Never run it to "look".** It may
  be a better panic path than our hardcoded list (it's the modem's own default), but that needs
  verifying somewhere other than the box's only cellular link.
- `AT+QNWPREFCFG=?` also exposes: `gw_band`, `srv_domain`, `voice_domain`, `roam_pref`,
  `ue_usage_setting`, `rat_acq_order`, `nr5g_disable_mode`, `rf_band`, `policy_mode`.

## 6. Planned RPC surface (`mudimodem`)
Composed from MudiUI §6/§7 knowledge. All methods admin-only.

**⚠️ Most `get_*` below are now redundant — reads arrive free over `global_sockets`/`/ws` (§2).**
Prefer `moduleStatus("cellular.modems_info")` etc. in the component; only add a backend method when
the websocket genuinely doesn't carry it (`policy_band`, `ue_capability_band` — AT-only, §5a).

| Method | Backing | Still needed? |
|---|---|---|
| `get_status` | `cellular.modem status` + `cellular.network info` + `AT+QSPN` | ❌ websocket |
| `get_bands` | `AT+QNWPREFCFG="nr5g_band"/…` | ⚠️ **yes** — for `policy_band` + `ue_capability_band`, which the websocket does *not* carry (§5a) |
| `set_bands` | `AT+QNWPREFCFG=…` | ✅ yes (write + revert) |
| `get_lock` / `set_lock` / `clear_lock` | `AT+QNWLOCK` (PCI/ARFCN) | ✅ yes |
| `confirm` | clears `pending.json` → commits a pending change | ✅ yes |
| `at` | raw passthrough, `sub_id` = active slot | ✅ yes |
| `get_sim` / `set_slot` | `cellular.sim info`, `cellular.modem` | ❌ websocket / `mvas.switch_sim_slot` |
| `get_apn` / `set_apn` | uci / `cellular.*` | ⚠️ GL's `modem.set_sim_config` may do |

### ⚠️⚠️ `sub_id` — the most dangerous parameter on this box (corrected 2026-07-17)
~~`sub_id` MUST equal the active slot~~ — **that framing is wrong.** `sub_id` is a **subscription
index, not a slot number.** Verified:

| `sub_id` | Operator | Slot |
|---|---|---|
| **0** | AT&T (310410) | 2 | ⚠️ **UNSTABLE** |
| **1** | **T-Mobile (310260)** | **1** — the active/serving SIM | |
| 2 | AT&T | 2 (falls back to 0) |

Slot 1 ↔ sub_id 1 is a **coincidence**; slot 2 ↔ sub_id **0**.

> ⚠️ **`sub_id=0` silently answers for different subscriptions at different times.** Same command,
> minutes apart: `AT+QNWPREFCFG="nr5g_band"` @ sub_id=0 returned `71` (T-Mobile's), then
> `2:5:…:78` (AT&T's). `AT+QSPN` @ sub_id=0 returned T-Mobile once, AT&T on every later pass.
> **This is worse than always-wrong — it looks right most of the time.** A whole band analysis was
> built on it this session and thrown away.

**RULE: never send `sub_id=0`.** Resolve the active slot from ubus (`cellular.sim info` /
`cellular.network info` — the ground truth), then pass its explicit sub_id.

**Build AT payloads with proper JSON escaping** — the inner quotes of `AT+QNWPREFCFG="nr5g_band"`
must be escaped or ubus silently returns empty/ERROR. Working helper in the reference doc §Provenance.

### GL's own modem RPC surface — all undotted, all web-callable, ACL-gated to admin
Extracted from `gl-sdk4-ui-internet`. **These undermine the "we exist because of the dot
restriction" story** (§3) — the browser *can* already reach these. We exist for §5a + consolidation.
```
modem.send_at_command   modem.get/set_operator_config   modem.get/set_sim_config
modem.get/set_cell_tower  modem.scan_cell_tower  modem.get_slot_config
modem.scan_operator_list  modem.get/set_slot_failover_config  modem.set_sim_pin_code
modem.get/set_traffic_config  modem.set_3gpp_rel  modem.get_debug_msg  modem.set_connect
mvas.switch_sim_slot  mvas.get_connect_info  mvas.set/disconnect_slot_net
```
- **GL's band write is `modem.set_sim_config`**, carrying `{band_enable, band_filter_mode,
  band_list:{LTE:[],"NR-NSA":[],"NR-SA":[]}}` — **bare integers, never frequencies**; `modem.so`
  translates to `AT+QNWPREFCFG`. The string `nr5g_band` appears **nowhere** in GL's frontend.
- `band_filter_mode`: `0` = "Open" (allowlist), `1` = "Block" (denylist). Unparseable; we say
  "Auto / Choose bands".
- **You always send band *numbers*, never frequencies.** Any MHz shown in our UI is our own
  annotation, sourced from 3GPP (TS 38.101-1 for NR, 36.101 for LTE) — *not* from the modem.

### The relevant ubus objects (dotted — server-side or `/ws` only)
```
cellular.modem   info{bus} status{bus} get_all_config{bus} get_feature_config{bus} …
cellular.network info{bus,slot} status{} daig_info{} debug_at_info{} get/set_rrc_seg{}
cellular.sim     info{bus} status{bus} get_config{iccid} set_config{iccid,data} set_pincode{}
modem.CPU.AT     get_result_AT{cmd,timeout,source_flag,sub_id}   ← the AT passthrough
cellular.cm  cellular.collect  cellular.failover  cellular.status
```

### Calling our backend from the page — `$rpcRequest` (verified Phase 0)
The frontend RPC helper is **`window.$rpcRequest`** (also `Vue.prototype.$rpcRequest`).
**There is no `$oui` and no `$rpc`** — that earlier guess was wrong. GL's own chunks alias it at
module scope, e.g. from `gl-sdk4-ui-bridge`:
```js
const o = window.$rpcRequest,
      s = function(){ return o("call", ["sid", "cable", "get_ports_config", {}]) },
      c = function(t){ return o("call", ["sid", "network", "check_wan_cable", t], {timeout:2e4}) };
```
Signature: `$rpcRequest(method, params, opts?)`, `opts = {timeout=10000, isCancel=true, cancelMode=1}`.

- **⚠️ The literal string `"sid"` is a placeholder — pass it verbatim.** The helper overwrites
  `params[0]` with the session cookie: `params[0] = params[0] && getCookie("Admin-Token") || ""`.
  It only substitutes if `params[0]` is **truthy**, so passing `null`/`""` yields an empty sid and
  an auth failure. Don't pass a real sid either; just `"sid"`.
- **It resolves to the `result` payload directly** — an axios interceptor unwraps `result` and
  rejects on `error`, so there's no JSON-RPC envelope to unpack. It also rejects when `result`
  contains `err_msg`/`err_code`.
- Rejection shapes to handle: `{type:"accessDenied"}` (also clears the token cookie),
  `{type:"invalidParams"}` (JSON-RPC `-32602`), `{type:"timeout"}`, `{type:"rpcCancel"}`.
- Also global: `window.$axios`, `window.$message`, `window.$getCookie`; `this.$t(...)` for i18n.

So our page calls: `window.$rpcRequest("call", ["sid", "mudimodem", "get_status", {}])`.

## 7. Ruled out / decided (don't re-derive)
- ❌ **Patch GL's SPA or `/www/views/gl-sdk4-ui-*`** — an OTA of the GL ui packages overwrites them.
  We ship our *own* filenames alongside; OTA can't clobber what it doesn't know about.
- ❌ **Extend `modem.so`** — closed 131 KB C plugin behind GL's `modem` object. Same dead end as
  `gl_screen`. We add `mudimodem` alongside it instead.
- ❌ **Call `modem.CPU.AT` from the browser** — impossible, dot restriction (§3). *(But note GL's own
  undotted `modem.send_at_command` reaches AT from the browser anyway — §6.)*
- ❌ **LuCI app** — fully open and easy, but lands in LuCI, not GL's admin. Rejected: the goal is
  integration with the stock admin. (Still a fallback if the chunk path collapses.)
- ❌ **Standalone page on its own port** — no integration. Rejected for the same reason.
- ❌ **Revert timer inside the nginx Lua** — 4 workers, no shared state (§5).
- ❌ **A "don't write to NVRAM" checkbox** — not physically possible for band commands; there is no
  commit step (§5a). Use the NV *backup* instead, once `QPRTPARA` is understood.
- ❌ ~~**"MudiModem exposes controls GL's UI doesn't have."**~~ **This premise was WRONG** and is
  retired (2026-07-17). GL ships band masking, tower lock, operator lock, AT console, SIM failover,
  data caps and 3GPP-rel selection. See the header for the three gaps that actually justify the
  project — **undiscoverable, scattered, and misrepresenting**. Don't re-argue this; it cost a whole session.

## 7a. The AT command library (design direction, 2026-07-17)
The ask: a community-contributed AT snippet library, "similar to code snippets", shipped on the
router and searchable. It's a differentiator no router UI has.
- **Distribution (CHANGED 2026-07-18 — now a separate repo):** sources live in
  **`github.com/kevinherzig/mudi7-at-library`** (public), whose CI validates + publishes a merged,
  content-`revision`-stamped `dist/at-library.json` + tiny `dist/version.json`. The base repo ships a
  baked snapshot (`src/at-library.snapshot.json`) as the offline/first-install cache at
  `/www/mudimodem/at-library.json.gz`; `tools/mudimodem-lib` (backend `refresh_library`) pulls the
  latest into that cache on a **manual** button, and `library_status` does an on-load version check
  (router-mediated curl → same-origin browser). Browser still fetches with axios. Served
  unauthenticated — fine, AT commands are public knowledge.
- **The killer field is `decode`** — a list of field names for the response. It turns
  `+QENG: "servingcell","NOCONN","NR5G-SA",…,-98,-11,8` (13 commas of nothing) into a labelled
  table **with no per-command code**. Pure data ⇒ contributable by people who don't write JS.
- **Mandatory `risk`, and it maps to real consequences, not vibes:**
  `read` (query only) · `set` (runtime, gone on reboot) · `nv` (**writes NV; survives factory reset**).
  Badge shown everywhere the entry appears. **Nothing ever auto-runs** — clicking fills the prompt.
  Entries with `{{params}}` refuse to send until filled. Gated behind an **"enable higher-risk
  commands"** checkbox (2026-07-17).
- **`verified: []` + `source` are load-bearing** — an unverified community command must render as
  "*nobody yet*", not hide. Keeps the library from becoming a folk-remedy collection. AT is
  vendor- *and* firmware-specific; `AT+QNWPREFCFG` is Quectel-only.
- ⭐ **Transport: our own AT channel, not GL's `modem.CPU.AT`.** (4.10: nothing of GL's is
  SIGSTOPped any more — `gl_modem` no longer exists as a daemon.) GL's channel (`/dev/smd9`) crosses
  responses under heavy polling (reference §10). `/dev/at_mdm0` is a free, world-accessible, separate
  AT port; **`tools/mudimodem-at.py`** (CPython stdlib, no compile, no `pyserial`) drives it cleanly.
  The backend can spawn it per command. ⚠️ It has **no `sub_id`** (active-subscription context only),
  so it's right for the console + active-SIM work but NOT the cross-SIM band model — that stays on
  GL's channel. Gotchas (open blocking = no `EBUSY`; not a tty; filter URCs) are in the file header.
- ✅ Built 2026-07-18 — see §12 and the Phase-3 spec/plan.

## 8. Dev gotchas
- **4.10 busybox has no `pkill`** — use `for p in $(pgrep -f …); do kill -HUP $p; done`.
- **Online install from a fork/branch:** `curl -fsSL "$B/install.sh" | MUDIMODEM_BASE="$B" sh`.
  install.sh records `base` in `/etc/mudimodem/version.json`; `app_version` and
  `mudimodem-selfupdate` follow it. **Every default source in this tree is
  `Antiman-cmyk/MudiModem` (main)** — the owner's repo, not kevinherzig's upstream (still 1.7.0).
  The community AT library still comes from `kevinherzig/mudi7-at-library`
  (`tools/mudimodem-lib`, overridable via `/etc/mudimodem/library-url`).
- **Never spawn a detached child bare from the backend** — `os.execute("… &")` inherits nginx's
  listening sockets; use `spawn_detached()` → `/usr/lib/mudimodem/mudimodem-detach`.
- **`cell_info` is an AT call.** Any new reader of RF must consume `latest.json` /
  `mudimodem.collect`, never call `cellular.network cell_info` itself.
- The dev box now has `lua5.1` + `lua-cjson`: every `test/backend-*.test.lua` isolation test runs
  locally (set `MM_PLUGIN=$PWD/src/rpc/mudimodem` + the temp-path env vars; see verify.sh 6/6b).
  **`tools/test-local.sh` runs every suite** (Python, Node, Lua, sh under dash AND busybox ash,
  shellcheck). With `MM_ROOTFS=<extracted 4.10 rootfs>` and `qemu-user-static` it ALSO runs the
  Lua tests under the **router's own `/usr/bin/lua` + `cjson.so`** (`qemu-aarch64-static -L
  $MM_ROOTFS …` — qemu redirects absolute paths that exist under the rootfs, so `require
  "cjson"` loads GL's build). That pass is the one that matters, because the two Luas differ:
  - **OpenWrt's Lua 5.1 carries the LNUM patch: integers are 32-bit.** `string.format("%d",
    os.time()*1000)` THROWS ("integer expected, got number"); use `%.0f` or `tostring()`. cjson
    encodes the ms timestamp fine (`%.14g`, 13 digits). The host's stock Lua accepts `%d`.
  - GL's `cjson` has `empty_array` / `encode_empty_table_as_object`; the dev box's lacks both,
    which is why `backend-history` / `backend-battery-history` only pass in the router pass.
  - The image's `jsonfilter` (libubox) runs the same way: `-e '@.error'` prints the object on one
    line when present, prints nothing and exits 1 when the path is missing, `{ }` for an empty
    object — exactly what `mudimodem-revert`'s `reply_is_error` / `gl_unlock_slot` rely on.
- **nginx caches the Lua plugin per worker** (`objects[object]` in `oui/rpc.lua`) → after editing
  the backend you must **reload nginx** (`/etc/init.d/nginx reload`) or changes won't take.
  ⚠️ `reload` (HUP) leaves old workers
  serving drained connections; when a fix must take *now*, use `restart`, not `reload`.
- ⚠️⚠️ **NEVER wrap `oui.ubus.call` in `pcall`.** It uses an nginx **cosocket**, which *yields* while
  waiting on I/O, and this box's Lua **cannot yield across a C-call boundary** (`pcall` is a C call).
  A `pcall` wrapper makes *every* ubus call throw `attempt to yield across metamethod/C-call
  boundary` — and if you swallow that in the same `pcall`, you get silent empty results everywhere.
  GL's own plugins call `ubus.call(...)` **bare** for exactly this reason; it already returns
  `(nil, err)` on ubus-level failure without throwing, so no `pcall` is needed. (Cost a whole
  debugging session — the two stub-based tests both passed because neither exercised the real
  cosocket path; only the live browser call revealed it.)
- **`gzip_static on`** → the chunk must exist **gzipped on disk** (`gl-sdk4-ui-*.common.js.gz`).
  Ship the `.gz`. ~~browsers cache aggressively — hard-reload when iterating~~ — **wrong**: the SPA
  requests chunks with a `?_t=<timestamp>` cache-buster, so a normal page reload always refetches.
  (Menu JSON needs no reload either — see §2. Only the **Lua backend** needs `nginx reload`.)
- `/usr/lib/oui-httpd/rpc/` is owned `radio:radio`; the files themselves are root-owned.
- Errors surface in `/var/log/nginx/error.log` (`error_log ... notice`). `M.call` logs every
  non-get/load/check call — useful trace.
- Test a method without the browser: `curl -sk -X POST https://<router-ip>/rpc -d '{...}'` with a
  logged-in `sid` (get one via the `login` method).
- **⚠️ Never inline Lua/AT/JSON into `ssh '...'`** — nested quoting mangles it and you'll debug the
  quoting, not the problem. **Write the script locally, `ssh root@mudi 'cat > /tmp/x' < x`, then
  `ssh root@mudi 'sh /tmp/x; rm -f /tmp/x'`.** Cost real time twice this session.
- **Test an rpc backend with no sid and no browser** — `dofile` it under a stubbed `ngx` global
  (plugins pull `resty.http`, which indexes `ngx` at load and dies outside nginx).
  **The minimal stub is not enough — `resty/http.lua:111` also needs `ngx.config`:**
  ```lua
  ngx = { socket={tcp=function() return {settimeout=function() end, connect=function() end} end},
          re={match=function() end, gmatch=function() end, find=function() end},
          log=function() end, ERR=0, WARN=1, NOTICE=2, INFO=3, var={}, req={}, ctx={},
          say=function() end, print=function() end, exit=function() end, HTTP_OK=200,
          timer={at=function() end},
          config={ngx_lua_version=10025, subsystem="http", debug=false},   -- ← REQUIRED
          worker={id=function() return 0 end, count=function() return 4 end},
          now=function() return os.time() end, time=function() return os.time() end }
  local t = dofile("/usr/lib/oui-httpd/rpc/ui")
  local r = t.get_menu_list({})   -- → { menus = { {view=…, level=…}, … } }  (NOTE: r.menus, an ARRAY)
  ```
  `verify.sh` only proves the menu JSON *parses*; this proves it's actually **returned**.
- **Read AT read-only from the shell** (no browser, no sid):
  ```sh
  ubus call modem.CPU.AT get_result_AT '{"cmd":"AT+QNWPREFCFG=\"nr5g_band\"","timeout":6,"sub_id":0}'
  ```
  Response comes back as one escaped string in `.data` — `sed 's/\\r\\n/\n/g'` to read it. **Only
  ever run query (`?`) and test (`=?`) forms unprompted**; a bare param with no value can be an
  *action* (§5a, `restore_band`).
- **The dev box has Node 20** → the chunk is unit-testable locally by `eval`ing it with a stub
  `module` + stub `h`, exactly as the SPA does (`test/chunk.test.js`). Node is dev-only; nothing
  extra is ever shipped to the router.
- **Analysing GL's minified chunks:** pull + gunzip locally, then use **Python**, not `grep`.
  (`grep -c` counts *lines*, and these are one-liners — it will report 1 for 40 hits.) Chunks:
  `ssh root@mudi 'cat /www/views/gl-sdk4-ui-internet.common.js.gz' > x.gz && gzip -dc x.gz > x.js`.
- **GL theme tokens** live in `/www/theme/base.css` + `/www/theme/{default,classic,dark}/index.css.gz`
  — 60 base colours, 74 semantic aliases per theme. **Never hand-pick colours; extract these.**
  GL is *not* on Element UI's stock palette: `--primary #5272f7`, `--success #00c8b5` (mint, not
  green), `--error #e04c7e` (rose, not red), and a purple-tinted text ramp (`#141427`/`#1f1f3d`).
  Signal-quality ramp — reuse GL's own from `modemsignallog`: poor→`--error`, fair→`--warning`,
  good→`--info-hover`, excellent→`--success`.

## 9. Persistence & risk
- All four files live **outside `/etc/config/`** → wiped by a firmware upgrade unless listed in
  **`/etc/sysupgrade.conf`**; a factory reset wipes them regardless. Same story as MudiUI §10 —
  the installer must register them idempotently.
- Band/cell lock persists in **modem NV** — it survives reflash *and* factory reset. The panic
  restore is the only way back.
- The Mudi is a travel router on cellular — reachability is intermittent by design.

## 10. Build phases (risk front-loaded)
| Phase | Deliverable | Why here |
|---|---|---|
| **0** | Hello-world chunk + menu entry | ✅ done. Settled the template-compiler + `level` unknowns. |
| **1** | Read-only diagnostics tab | Now **cheaper than planned** — reads come free over `global_sockets` (§2); no backend needed except `policy_band`/`ue_capability_band` (§5a). |
| **2** | Band grid + cell lock, auto-revert, panic restore | ✅ **2a+2b done** (band read/write/revert). ⏳ cell lock (`QNWLOCK` §6a) + durability (make `set_bands` persist via `modem.set_sim_config`) remain. |
| **3** | AT console + community library | ✅ done (2026-07-18). Own channel via /usr/lib/mudimodem/mudimodem-at.py; library at /www/mudimodem/at-library.json.gz. (The 4.8-era `gl_modem` SIGSTOP during sends is gone — no such daemon on 4.10.) |
| **4** | SIM / APN | ❌ **REMOVED 2026-09-02.** Stock 4.10's Internet page has slot switch, dial/APN profile and failover in full (verified in the shipped chunk) — the rule is to ship only what stock lacks or does incompletely. The DSDS/roaming knowledge below (§12 2026-07-18, §"Session findings") stays as reference; `cellular.modems_status`/`networks_info` are still consumed by the strip. |
| **2.0.0** | GL 4.10 rewrite; LCD removed | ✅ 2026-09-02 — see the header block. The 1.x LCD renderer is gone; `mudimodem-collectd` is the single modem reader, pushing over `gl-session notify`. |

## 11. Repo layout
```
MudiModem/
├── CLAUDE.md                    ← this file
├── docs/superpowers/specs/      ← design specs
├── docs/superpowers/plans/      ← implementation plans (per phase)
├── src/
│   ├── views/mudimodem.js       ← chunk SOURCE (plain JS; gzipped at build → the shipped .gz)
│   ├── views/mudimodem-battery.js  ← Battery tab chunk (chart + charge-limit form)
│   ├── menu/mudimodem.json      ← menu registration + global_sockets (level 1, icon "modem")
│   ├── at-library.snapshot.json ← baked fallback; sources in kevinherzig/mudi7-at-library (§7a)
│   ├── rpc/mudimodem            ← backend (bands, cell lock, history, console, speedtest, battery, version)
│   ├── lib/cellular_compat.py   ← GL 4.10 cellular shapes -> normalized sample (collectd + speedtest)
│   ├── lib/mudimodem-detach     ← detached-child wrapper (closes nginx's fds)
│   ├── ws/mudimodem.lua         ← /ws seed module (mudimodem.collect/.battery/.event)
│   ├── sbin/mudimodem-collectd  ← single modem-read daemon; broadcasts over Unix socket + latest.json
│   └── sbin/mudimodem-revert    ← confirm-or-revert watchdog + ssh panic restore
├── tools/
│   ├── build.sh                 ← "build" = gzip to gl-sdk4-ui-mudimodem.common.js.gz
│   ├── deploy.sh                ← model-guarded push over ssh `cat` (no scp: no sftp-server)
│   ├── verify.sh                ← on-device assertions (files, JSON parse, gzip_static, eval, backend, watchdog)
│   └── mudimodem-at.py          ← our own AT channel on /dev/at_mdm0 (Python stdlib; Phase 3 console)
├── test/chunk.test.js           ← local Node test: evals the chunk exactly as the SPA does
├── test/battery-chunk.test.js       ← evals the battery chunk; lane domains, reduce, gaps
├── test/backend-battery-history.test.lua
├── test/test_collectd.py        ← collectd broadcast socket + latest.json test
├── test/ws-seed.test.lua        ← /ws seed module self-test (stale flag); shipped to the box by verify.sh
├── build/                       ← generated, gitignored
├── docs/
│   └── Quectel_RG50xQ&RM5xxQ_..._V1.1.1_Preliminary_20201009.pdf  ← ⚠️ 5-SERIES; box is 6-series
└── reference/
    ├── quectel-at-reference.md  ← ⭐ AT knowledge; 🟢 verified-on-box vs 📘 from-5series-manual
    ├── gl.conf                  ← nginx site config (/rpc, /ws, gzip_static)
    ├── oui-rpc.lua              ← /rpc endpoint: JSON-RPC, the dot gate (line 91), ACL check
    ├── oui-lib-rpc.lua          ← oui.rpc: M.call/dofile plugin loader, M.access, glc_call
    ├── menu.d-samples.json      ← menu JSON: flat (level 0) + nested (parent/index)
    ├── rpc-objects.txt          ← GL's shipped rpc backends (Lua + .so)
    └── menu-views.txt           ← GL's registered views
```

## 12. Current status / open threads
- ✅ **2.0.0 — GL 4.10 rewrite (2026-09-02).** Everything in the header block. Tests green locally:
  Python (collectd, test_collectd, speedtest, at-tool, lib, bands-consistency), Node (main
  121, console 38, tracking 43, battery 92, speedtest 27), Lua isolation (write/lock/lock-write/
  console/library/battlimit/validator/persist), sh (revert, selfupdate, wiring). **Not yet run on
  a live 4.10 box** — the plan's Phase 0 checklist (contract doc §6) is the next step; verify.sh
  steps 0/0b/7 (cadence + normalized latest.json)/8e (modem_AT)/13c/15 are the 4.10 gates.
- ✅ Recon complete: oui page/menu/rpc mechanism mapped, dot restriction + ACL model understood,
  Lua-plugin backend contract confirmed, four-file architecture + auto-revert designed.
- ✅ **Phase 0 done (2026-07-16)** — chunk + menu deployed; `tools/verify.sh` green. Unknowns
  resolved: **template compiler absent** (§5), **`level` = menu depth** (§2), **RPC helper is
  `$rpcRequest`** (§6). Plan: `docs/superpowers/plans/2026-07-16-phase-0-hello-world-view.md`.
- ✅ **Promoted to a top-level nav item (2026-07-17)** — `level:1, index:15, icon:"modem"`, sits
  under Internet. Deployed, `verify.sh` green, and confirmed present in `ui.get_menu_list` with
  `global_sockets` intact.
- ✅ **The premise was rewritten (2026-07-17).** See the header + §7. GL *has* these controls; they
  are undiscoverable, scattered, and **wrong** (§5a). This is now the project's reason to exist.
- ✅ **UI design done** — `docs/superpowers/specs/2026-07-17-mudimodem-ui-design.md`. Signature: the
  status strip is a **live RSRP trace with change-ticks**, not a KPI row, because the revert
  countdown asks a question about the numbers and the strip must hold the evidence. Interactive
  mockups (self-contained HTML, open in any browser) in `.superpowers/brainstorm/*/content/`:
  `design.html` (whole page, 5 tabs) and `console.html` (AT library).
- ✅ **Phase 1 done** — read-only live diagnostics (strip trace + serving cell), all over `global_sockets`.
- ✅ **Phase 2a done** — read-only three-layer Bands grid + `get_bands` backend.
- ✅ **Phase 2b done (2026-07-17)** — band **writes** with confirm-or-revert: `mudimodem-revert`
  watchdog (+ arm interlock + panic), `set_bands`/`confirm`/`revert_now`, interactive SA grid + C1
  countdown. Also fixed: **never `pcall` a cosocket** (crossed-yield bug), config read from raw AT,
  strip anchors on the active SIM.
- ✅ **Phase 4 done (2026-07-18)** — SIM/APN tab, chunk-only, browser-direct to GL's undotted
  `modem.*` RPC (no backend, no AT, no `sub_id`). Slot cards render the DSDS split
  (`Selected`≠`Carrying data`) and roaming honesty (home PLMN from IMSI vs serving carrier). Dial
  profile edits go through a **read-modify-write** of `modem.set_sim_config` — mandatory, because that
  object *also* carries the band config; **verified live** the n71-era band lock survives an APN write
  byte-for-byte. Slot switch = `modem.set_slot_failover_config {current_sim}` (verified 1→2→1 in ~2 s;
  `mvas.switch_sim_slot` fallback unused). Spec: `docs/superpowers/specs/2026-07-18-sim-apn-tab-design.md`;
  plan: `docs/superpowers/plans/2026-07-18-sim-apn-tab.md`. Test-only tool: `ubus call gl-session call
  '{"module":"modem","func":..,"params":..}'` reaches `modem.so` glc methods as root, no web sid.
- ⚠️ **Rapid slot switches can wedge GL's SIM detection (observed 2026-07-18).** Two
  `set_slot_failover_config {current_sim}` switches seconds apart (1→2→1) left `cellular.sim` reporting
  **`status:0` (No SIM) with garbage iccids** (`44000000003`, `E0127E0127E`) on *both* slots for 5+ min,
  while **WAN stayed up** (radio/data path fine — it's the reporting layer, not connectivity). Recovery:
  **`/etc/init.d/gl_cellular_manager restart`** (SIMs back to `status:6` in ~5 s; band lock survives).
  Lesson for a real switch: **wait for the websocket to confirm before another switch** (the UI already
  does — `switchTarget` gates re-entry). UI hardening from this: SIM cards now gate identity/form on
  GL's **present** signal (`status` 5/6), never the iccid string, so a status-0 slot renders a clean
  "Empty / No SIM" card instead of a stale-iccid + editable-form contradiction.
- ⚠️ **Band config drifted off n71 (observed 2026-07-18).** `get_feature_config` now shows the full
  6-band T-Mobile policy set (`NR-SA:[25,41,48,66,77,71]`, `NR-NSA:[2,5,41,66,77,71]`), not the
  deliberate n71-only lock from 2026-07-15. Likely a `cellular_manager` restart re-applying stored
  config (the §5a durability gap in action), or a manual change. Not touched — re-apply n71 via the
  Bands tab if still wanted. This is almost certainly why `verify.sh` step 5 (backend band-model
  assertion) now trips: it's live-state, not a Phase-4 regression (Phase 4 changed no backend files).
- ⏭ **Next:** (a) make `set_bands` **durable** via `modem.set_sim_config` (else it reverts on
  `cellular_manager` restart — §5a durability gap); (b) cell-lock tab on `QNWLOCK` (§6a).
- ✅ **Phase 3 done (2026-07-18)** — AT console tab (lazy chunk `mudimodem-console`) + community
  library (now EXTERNAL — `kevinherzig/mudi7-at-library`; router pulls via `mudimodem-lib`, baked snapshot fallback).
  Transport: `mudimodem.at_console` spawns `/usr/lib/mudimodem/mudimodem-at.py` — flock-serialized,
  `gl_modem` SIGSTOPped during the send (paired CONT + startup recovery; verify.sh 8e asserts no
  stopped daemon survives). Gate: set/nv library entries need the banner checkbox; free-typed always
  sends. Spec: `docs/superpowers/specs/2026-07-18-at-console-library-design.md`.
- ✅ **Battery charge limit (2026-07-22)** — Config tab toggle + GUI % target; ships
  glbattlimit + config-aware hotplug/init; default disabled. Spec:
  docs/superpowers/specs/2026-07-22-battery-charge-limit-design.md
- (2026-07-24 LCD merge: REMOVED in 2.0.0 — see the header; no LCD code remains.)
- ✅ **2.0.0 review fixes (2026-09-02, from `/code-review xhigh`, verified against the 4.10 image).**
  Watchdog keeps `pending` when BOTH restores fail (event says "Auto-revert FAILED") and parses
  gl-session's reply for a top-level `error` (jsonfilter, else one-tab grep) instead of a substring;
  `set_bands` never writes `NR-SA:[]` (an empty stored list is not an allowlist → supported set),
  keeps filtering OFF on a mode-only apply, refuses NR lists under 4G-only, reports `applied`
  from the payload, and passes an unrecognised stored `network_mode` through (`mode_raw`,
  `meta.mode_known`); `cellular_compat` tags an NSA anchor row LTE (`pcc_rat`; GL keys the n/B
  prefix off the ROW) and keeps PCI 0 / EARFCN 0; `get_lock` has the no-slot guard, launders
  `cjson.null`, and takes the NR leg from `signals[]` under NSA; write paths refuse an unconfirmed
  `sub_id` (cache never pins 0); the page checks `res.error` on get_bands/get_lock, preloads the
  strip via an explicit flag, labels a stale `/ws` seed by age, never sends 5G lists under 4G-only,
  hides the manual SIM switch while GL's `slot_switch_enable` is on (GL's own UI does — read in
  the shipped internet chunk; the minimal `{bus,current_sim}` switch payload is GL's own), and
  renders `null` as "-"; tracking collapses 4↔41 (CA) in the handover signature and emits one
  Failover per slot change; selfupdate validates `base` with the same charset as `app_version`
  and passes it by env; deploy/verify use install.sh's numeric firmware compare; deploy.sh's
  sysupgrade list is checked against install.sh's by `test/test_install_wiring.sh`. REFUTED by
  the image and left alone: cjson `[]→{}` in revert_now (oui-rpc.lua sets
  `encode_empty_table_as_object(false)`), the detach fd loop (ash's script fd occupies fd 10),
  `band_enable` type (libcm_modem.so emits a JSON boolean), per-route `global_sockets`
  (app.js subscribes the union of every menu entry at ws open).
  Follow-up (same day): the cell-lock `revert_now` now runs the watchdog's own
  `mudimodem-revert restore-now` synchronously (ONE modem-side restore implementation; the GL
  store reconcile is the shared Lua `gl_unlock`); the bands revert stays in-process on purpose
  (an nginx worker must not wait on gl-session→/rpc→another worker, and a manual revert must
  not fall to the open-state fallback). `get_bands {light:1}` returns config+mode+lock with
  ZERO AT — what the page refetches after a cell-lock action instead of the full model
  (`light` is a number: oui's `valid_rpc_args` pattern-matches strings only, numbers/booleans
  pass — read in reference/4.10/oui-lib-rpc.lua; verify.sh 14b round-trips it). panic's per-slot
  GL unlock passes the stored tower fields back (`gl_unlock_slot`, jsonfilter; minimal payload
  without it), mirroring the backend's `gl_unlock`. All sh tests also run under `busybox sh`.
- ⚠️ **Push gating leaves a hole after a page opens — backfilled client-side (2026-09-02, seen
  live).** collectd pushes only while its `has_websocket` probe (every 30 s idle) says a browser is
  attached, so the first ~3 ticks after opening the Modem page are never pushed; the stall guard
  can't notice (the first real push resets it), and the strip showed a gap / a straight bridge
  while Tracking flattened. Fix: every chart's push handler compares the pushed `t` with the last
  held one and, past `*_HOLE_MS` (25 s RF, 50 s battery), issues ONE `{since: <previous cursor>}`
  fetch; the incremental merges dedupe by `t` and re-sort. The cadence difference itself is
  expected: the preload paints 15 min at once, live adds one point per 10 s.
- ✅ **Cell-unlock fix + Reset-to-default (2026-07-24).** **Cell-unlock 5G-only stranding FIXED:**
  `clear_cell_lock` now issues `mode_pref=AUTO` + `nr5g_disable_mode=0` + `save_ctrl=0,0` after GL's
  unlock. Root cause: a GL cell lock is *two* changes — `QNWLOCK` + a `mode_pref=NR5G` side-effect
  (**4.10 image, 2026-09-02: GL's own tower code sends no mode command at all — the shift is the
  module's; `clear_cell_lock` now re-applies GL's stored band config so GL's own
  `quectel_set_band_info` restores the configured mode, and unlocks per locked family because
  GL's `set_cell_tower lock:false` clears only the `network_type` it is given**) —
  and the three unlock paths were asymmetric (only `revert_now`/watchdog restored mode; the Unlock
  button's `clear_cell_lock` didn't). Restores to **AUTO**, not the exact pre-lock mode (the
  manual-unlock path has no PREV snapshot — `PENDING` is deleted on Keep). verify.sh **6c** greps for
  it statically — ⚠️ **never call `clear_cell_lock` in a test, it unlocks the real modem.** **Bands tab
  "Reset to default"** button stages AUTO + all permitted bands (reuses `setMode`/`selectAll`) → normal
  Apply. Spec: `docs/superpowers/specs/2026-07-24-unlock-mode-restore-reset-default-design.md`.
- ✅ **"Reset to default" now reports itself (2026-07-25).** It read as a dead button because on this
  box it is a **genuine no-op**: `get_feature_config`'s band lists already equal `policy_band`
  exactly, and the mode is already AUTO ⇒ `changedAny()` false ⇒ footer keeps saying "No changes".
  (⚠️ `get_feature_config` returns **duplicate `network_mode`/`band` keys** — first copy = the
  module-supported superset, second = the policy-intersected set. Last-wins JSON decoding means we
  read the policy-intersected one; that's why config==policy.) Two changes: (a) **the button now
  ALWAYS writes** — `resetDefault()` stages AUTO + all permitted bands then calls
  **`applyBands(true)`**, a new `force` path that sends every non-empty group + the mode regardless
  of `changedAny()`, still through the 60s confirm-or-revert. A forced send **skips a group whose
  policy is empty** (writing `sa:[]` would drop the RAT — AT&T's SIM has no SA policy). (b) a
  transient `resetNote` ("Sending the default…" / "Already at the default - re-sending… anyway"),
  rendered as an `mm-note` under the Bands footer, cleared by any later edit/apply/refresh.
- ✅ **Status-strip RSRP graph now reads the daemon (2026-07-25).** It used to draw only what the
  websocket pushed since page load — empty on arrival, x-axis = sample index, lost on reload. It now
  polls **`get_history`** (the `mudimodem-collectd` 4s samples, `{since}` incremental every 10s after
  a `{window_ms}` first load), plots a **real-time x-axis over a 15-minute window**, and **breaks the
  line across a >30s hole** instead of bridging an outage. Details that matter: the poll goes through
  **`$axios` directly, not `$rpcRequest`** (the interceptor pops GL's global "Unknown error" banner on
  any failed background poll — same reason the tracking chunk does it); the window is sent as a
  **duration**, and trimming/x-axis use the **box clock** (`res.now` + elapsed), never a
  browser-computed cutoff; a sample with `rsrp: null` is dropped from the plot but still advances the
  `since` cursor. The old websocket `trace` is kept as the **fallback** when the collector has no
  history, and the eyebrow says which source is live ("RSRP · last 15 min" vs "RSRP live").
- ✅ **Self-update UX: the offer is spent, and the version re-reads (2026-07-25).** The
  "(vX available — Update now)" clause was gated only on `appVer.update_available`, so it stayed
  clickable *during* the update and *after* it finished. Now: hidden while `updating` (the target
  version moves into the status line, "Updating to vX…"); hidden permanently once an update succeeds
  (**`updateDone`**) — necessary because the browser is still running the **OLD chunk**, whose
  `update_available` is stale, and the Config tab re-checks on every open, which would resurrect the
  offer. A **failed** update restores the offer so it can be retried. On success,
  `refreshVersionAfterUpdate()` re-calls `app_version` (retrying up to 4× / 2.5s while the box still
  reports the old number — the install restarts nginx, so the first read can race the file swap) so
  the card shows what is **actually installed**; the note then separates box-updated from
  page-still-old with a clickable **"reload now"**.
- ⚠️ **The self-update's "UI timeout" was GL's banner, not our timeout (root-caused 2026-07-25).**
  Measured on the box: the whole update takes **~9 s** (`t+3 lock, t+6 lock, t+9 result ok`) and
  `install.sh` **restarts nginx ~6 s in** — so a 3s poll ALWAYS lands on a dead socket. That poll went
  through `$rpcRequest`, whose interceptor raises GL's global timeout banner **before our `.catch`
  runs**; the next poll then saw `ok`. Update fine, banner spurious. Our own "taking longer than
  expected" needs 40 failed polls (~2 min) and was never in play. Fix: `stripRpc` generalized to
  **`rpcSilent(method, params, timeout)`** (direct `$axios`, resolves `null` on failure, no
  interceptor); **`update_status` and `app_version` now use it** — `app_version` because its retry
  reads *while nginx is restarting* and it is fail-silent by contract. **`self_update` deliberately
  stays on `$rpcRequest`** (user-initiated, completes before the restart, so a banner is real).
  📌 **Rule: any background/retrying call belongs on `rpcSilent`; only user-initiated one-shots
  belong on `$rpcRequest`.** (Not download speed — 8 files fetched in 2 s over cellular.)
- ✅ **Battery tab + history chart (2026-07-27)** — answers issue #1 from **ChiliApple**, the
  `glbattlimit` author. `mudimodem-collectd` gained a **20 s sysfs sampler** writing
  `/tmp/mudimodem/battery.jsonl` (24 h / 5,200 lines, tmpfs); `get_battery_history` serves it
  through the **same backward-chunk tail reader as `get_history`**, now extracted to a shared
  `read_window(path, since)`. New lazy chunk `mudimodem-battery.js` draws **four stacked lanes**
  (charge %, current mA, voltage V, temp °C) on one x-axis — deliberately NOT Tracking's
  normalized overlay, because normalizing destroys the one value that matters: `cur == 0` must
  read as ZERO. The charge-limit form **moved out of the Config tab** into this chunk (one owner).
  ⚠️ **Unit traps, verified on box:** `current_now` is **mA already** (the Linux power_supply class
  normally uses µA — `glbattlimit` line 166 documents mA, and the physics agree), signed
  **+charging / −discharging**. Meanwhile `voltage_now` on the same node is µV and the *charger*
  node's limits are µA. Convert per node.
  ⚠️⚠️ **`cur == 0 && online == 1` does NOT by itself mean "the limiter is engaged"** — it means
  only that **charging stopped**, and it cannot say why. This cost a full review cycle, twice, in
  opposite directions. **`glbattlimit` blocks by setting the buck `vreg` BELOW the cell voltage
  (`src/sbin/glbattlimit` ~line 74) — which is exactly what makes the charger report
  `status=Full` + `charge_type=Trickle`.** So `status` cannot disambiguate either: the limiter
  *manufactures* the full-battery signature. Measured live 2026-07-28 with the limiter active at an
  80 % GUI target: `capacity=71` (= `gui_to_gauge(80)` exactly), `current_now=0`, `online=1`,
  `status=Full`, `charge_type=Trickle`, `charge_en=0`, `vreg=3900000` (factory `4400000`) — a
  reading indistinguishable from a genuinely full cell except that a full cell sits near
  **86–100 % gauge**, not 71.
  ⇒ **Attribution needs the limiter's OWN state, so the collector records it per sample**
  (`lim` / `lim_gauge`, from glbattlimit's pid file — the same signal `glbattlimit status` and
  `get_battlimit` use, so the chart and the limit card cannot disagree). Samples predating those
  fields degrade to `idle`, never to a confident `full`/`blocked`.
  Spec: `docs/superpowers/specs/2026-07-27-battery-tab-history-design.md`;
  plan: `docs/superpowers/plans/2026-07-27-battery-tab-history.md`.
- 🔭 Later: an ipk. (`boot-check` now has its boot hook — `/etc/init.d/mudimodem-revert`,
  START=96, installed + enabled by install.sh/deploy.sh; `/etc/sysupgrade.conf` itself is already
  handled by `deploy.sh` — see the corrected bullet below.)

### Session findings 2026-07-17 (all in reference §10–§11)
- **DSDS, not DSDA** — both SIMs register, only one carries data at a time. No simultaneous dual-data.
- **`current_sim_slot` (selected) ≠ data-carrying slot** — seen live (SIM1 selected, SIM2 failover
  data). UI anchors on `current_sim_slot` (GL's active SIM), shows its honest state.
- **GL overrides raw AT on restart** — the durability gap above.
- **Crossed AT responses** on `modem.CPU.AT` under heavy polling → backend should validate replies.
- **Our own AT channel found** — `/dev/at_mdm0` + `tools/mudimodem-at.py` (Python, no compile), for
  the Phase 3 console. No `sub_id` there (active-sub context only).
- **`AT+QUIMSLOT` absent** on the 6-series — SIM slot switch is GL-layer only.

### Session findings 2026-07-18
- **`/dev/at_mdm0` is held by GL's `port-bridge`** (`port-bridge at_mdm0 at_usb0 0` — the USB-AT
  passthrough). Coexistence probed clean; the tool keeps drain-before-send + strict terminator
  matching as the defense.
- **`gl_modem` is the AT traffic source** (`/usr/bin/gl_modem -B cpu -S 1 connect-auto`);
  `modem_AT` is the ubus AT *server* — sleep the former during console sends, never the latter.
- T-Mobile `nr5g_band` read `25:41:48:66:71:77` (full policy set), NOT the documented n71-only
  lock — GL's stored config or an experiment widened it. Flagged, not "fixed".

### Open questions (do not guess these — verify)
📖 All AT detail + evidence lives in **`reference/quectel-at-reference.md`**.
1. ✅ **`AT+QNWLOCK` — SOLVED on capability + syntax (2026-07-17).** Cell lock confirmed working;
   the box's `AT+QNWLOCK=?` gave the exact forms (ref §6a): `"common/4g",(0-10),<freq>,<pci>` and
   `"common/5g",<pci>,<freq>,<scs>,<band>` — **NR is PCI-first** (the mockup's guess was backwards).
   There's a `save_ctrl` persistence toggle too. *Still open:* set-side param semantics (`<mode>`,
   `<scs>`, how to clear, auto-persist vs `save_ctrl`) — but these are now "read ranges off the box",
   not "does it exist". **Don't probe set forms blind — a bad lock drops the link.**
2. **`AT+QPRTPARA` mapping** — `(1-4)` exists on our box; the RG50xQ manual doesn't document it at
   all. Per the *BG95/BG77/BG600L File System Backup App Note* (a **different family**):
   `=1` backup · `=3` **force restore** · `=4` **read-only info**. **Not yet run.** Safe test:
   `=4` baseline → `=1` → `=4` again, confirm `<CEFS_backup_cnt>` incremented.
   ❓ Unknown whether it even covers band config (it backs up the modem *file system*).
3. **`AT+QNWPREFCFG="restore_band"`** — takes no argument ⇒ an **action**, not a query. **Do not run
   it to look.** Likely a better panic path than our hardcoded list. Verify off the box's only link.
4. **Band→frequency table** — MHz labels in the UI are *ours*; source from **3GPP TS 38.101-1 (NR) /
   36.101 (LTE)**, not memory. The whole spectrum-ordering design rests on them being right.
5. **Is `policy_band` writable?** `policy_mode` exists (undocumented). If policy can be widened, §5a
   changes from "here's why 12 bands are dead" to "here's how to revive them".
6. **NR5G neighbour cells** — `AT+QENG=?` offers `"neighbourcell"`, but the manual documents **only
   LTE and WCDMA** neighbour formats, **no NR5G one**. The Cell-lock tab assumes a neighbour list
   with SINR; on SA it may return nothing. **Test before building.**
7. **`AT+QCAINFO` field order** — `<pcell_state>` is documented `0|1`; our box returned **`5`**.
   Don't decode it positionally until resolved.
8. **Does `modem.set_sim_config` make a band change durable?** (verify) — the fix for the durability
   gap (§5a). Send GL its config `{band_enable, band_filter_mode, band_list}` alongside our raw-AT
   write, then restart `cellular_manager` and confirm the band survives. Do it off the box's only link.
9. ✅ **RESOLVED (2026-07-18): the direct port CANNOT target a sub_id.** No subscription selector
   exists on `/dev/at_mdm0` (`QSIMSWITCH`/`QDSDS`/`QMSIMCFG` all ERROR; `QCFG=?`/`QNWPREFCFG=?`
   list nothing sub-related). GL's `sub_id` is a QMI-layer thing behind `modem_AT`. Cross-SIM data
   stays on GL's `modem.CPU.AT`; the console is active-SIM only and labeled as such.
- ✅ `/etc/sysupgrade.conf` **is** registered by `./tools/deploy.sh` (idempotent
  `grep -qxF … || echo … >> "$f"`), covering every shipped file. **Any new shipped file must be
  added to that list**, or a firmware upgrade wipes it. Still not done: `install.sh`/`uninstall.sh`,
  and an ipk (the `boot-check` boot hook shipped 2026-09-02).
- 🧹 `tools/verify.sh` still only checks the menu JSON *parses*; it should also assert
  `get_menu_list` returns it at `level:1` (§8 has the stub).

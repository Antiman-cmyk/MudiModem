# MudiModem

A community add-on that installs a **Modem** page into the GL.iNet **GL-E5800 ("Mudi 7")** stock
web admin (GL firmware **4.10 only**): band lock with the carrier-policy layer GL hides,
confirm-or-revert cell lock, live RF tracking, AT console + community AT library, speed test,
battery history + charge limit. It adds files alongside GL's; it patches nothing of GL's.

Rule of scope (owner): ship only what stock 4.10 lacks or does incompletely.

## How to work here
- **Firmware and emulation live in mudi-emu** (`tools/mudi-emu`, a pinned git submodule:
  `git submodule update --init`; its own repo is Antiman-cmyk/mudi-emu). Change emulation there,
  push it, then bump the submodule here. `$MUDI_EMU` points the suites at another checkout's CLI.
- **Firmware first.** Any question about how GL behaves is answered from the official image:
  `tools/mudi-emu/bin/mudi-emu fetch && … extract` unpacks the pinned 4.10.0 rootfs
  (`mudi-emu path rootfs`). Read Lua/JSON/JS there; for binaries use mudi-emu's `re/` tools and
  method (`re/NOTES.md`, `docs/re-notes-4.10.md`). Record facts MudiModem relies on in
  `docs/cellular-api-4.10.md` or `docs/knowledge.md` with their evidence; general GL facts in
  mudi-emu's `docs/gl-behaviour.md` / `docs/re-notes-4.10.md`.
- **Emulation first.** Run code under the router's own userland on the dev box (`mudi-emu run
  lua|eco|sh|bin`: the image's `lua`, `eco`, busybox `ash` + applets, `jsonfilter`, `ubusd`/`ubus`,
  `nginx` via qemu). Fake GL services: `mudi-emu fakebus` (the image's `ubusd` + a scripted fake
  `cellular.*` etc.); installs run in a fake root (`MUDIMODEM_ROOT`). To learn what GL itself
  does, run GL: `mudi-emu up` starts the image's own `cellular_manager` (and the `modem_AT` it
  spawns) against mudi-emu's RG650V model, which logs every AT command with the evidence behind
  each reply. `tools/test-local.sh` runs every suite this way, not on a router.
- **A real box is the last resort**, only for what is genuinely runtime (RF state, modem replies,
  timing). Mark such items 🔴, batch them, and never make a change wait on one. Never run write
  commands (band/lock/CFUN/NV) on a box unprompted.
- No mandated process: plan, spec or not as the task needs. Keep the docs below **current** —
  edit the fact in place instead of appending corrections or session logs.

## Invariants (breaking one strands the user's link or breaks GL's admin)
- **Never send `sub_id=0`**; resolve slot → sub_id (slot first, IMSI-confirmed). Writes carry the
  slot the page read and refuse if the active SIM changed.
- Every band/cell-lock write is **confirm-or-revert**, written through GL's own store
  (`modem.set_band_config` / `set_cell_tower` via glc) — except a band write for the standby SIM,
  which GL only stores (no AT; it applies it when it next dials that slot), so there is nothing to
  confirm; `panic` resets both slots. The watchdog is armed **before** the
  write (mudimodemd `change_arm`, then the plugin checks the marker itself: no marker, no write).
  The sh watchdog stays the timer and the restore; `panic` must keep working from ssh with
  nothing else running.
- The browser cannot call dotted objects (`/rpc` dot rule); only our undotted `mudimodem` plugin
  calls them, server-side. Any free-form string arg needs a validator entry.
- Nothing slow inside the nginx plugin: 4.10 runs **one** nginx worker, so `os.execute`/`io.popen`
  stall the whole admin. Slow work is a `mudimodemd` job (`job_start`/`job_wait`, AT via
  `at_start`/`at_wait`) reached over `oui.ubus` (a cosocket), waited on in <30 s slices with
  `{pending, id}` → `job_result`; fire-and-forget work runs detached (`mudimodem-detach`).
- **Never `pcall` an `oui.ubus.call`** (cosocket yield). OpenWrt Lua 5.1 ints are 32-bit.
- Page code lives in `src/web` (ES modules) and is built by `npm run build:web` into `dist/views`
  (committed — install.sh fetches raw files); never edit `dist/`. Each chunk is one eval-able
  expression, `render(h)` only (Vue 2.6 runtime-only), served as `.gz`. Use only CSS variables
  GL's theme defines. All /rpc goes through `kit/rpc.js`: background calls `rpcSilent`,
  user-initiated one-shots `rpc` (GL banner). User-visible text is English in the source and
  translated by `kit/i18n.js` (sentences with values as `t("… {x} …", {x})`); add every new string
  to `src/web/locales/zh-cn.js`.
- Nothing of ours under `/www`; every shipped file comes from `manifest.txt`, which also generates
  the firmware-upgrade keep list. Never write `/etc/sysupgrade.conf`.
- A malformed menu JSON or i18n file breaks GL's whole admin — validate before shipping.
- RF readers consume the collector (`latest.json` / `mudimodem.collect`), never `cell_info`.
- Keep the real router IP out of the repo (`<router-ip>`).

## Layout
```
manifest.txt            what ships where (single source; install/deploy/uninstall/keep.d)
install.sh uninstall.sh bootstrap scripts run on the router (curl | sh)
src/installer/          the one on-box installer every path runs
src/web/main/          the main chunk: index.js (shell) + strip/change/bands/lock/config/… modules
src/web/tabs/          lazy tab chunks (tracking, console, speedtest, battery)
src/web/kit/           shared: rpc, i18n, compose, chunks, fmt, carriers (one reading of a sample's
                        carriers for every page), clipboard, csv     src/web/locales/  zh-cn table
dist/views/            BUILT chunks (committed, shipped)           src/menu/*.json   menu entries
src/rpc/mudimodem       nginx Lua plugin loader (object "mudimodem"); its code is src/lib/rpc/ (core.lua
                        shared helpers + one file per concern); src/validator/ its arg validator
src/sbin/ src/lib/      daemons + helpers: mudimodemd (eco; src/lib/mudimodemd/: collector, AT queue +
                        direct port, jobs, speed test, change arming), revert watchdog, battery limit
src/ws/mudimodem.lua    /ws seed module; src/nginx/ the gl-conf.d alias
tools/                  build, deploy (ssh), verify (live box), page preview, i18n keys
tools/mudi-emu/         SUBMODULE: firmware fetch/extract, router userland, fake GL bus, GL's own stack
                        + the RG650V model, RE tools/notes (its README)
test/                   every suite; tools/test-local.sh runs them all (host + router userland via
                        mudi-emu); test/mudiemu.py = how the Python suites reach it; test/emu/ = our
                        drivers + the gl-real scenario; test/fixtures/carriers.json = the SA/LTE/CA/
                        NSA pictures every surface and get_lock must agree on
reference/              quectel-at-reference.md (AT evidence); GL file copies are in
                        tools/mudi-emu/reference/e5800-4.10.0/ (theme-vars.txt feeds the CSS lint)
docs/                   architecture.md · cellular-api-4.10.md · knowledge.md · audit · design/ (history)
```

## Commands
```sh
git submodule update --init                            # tools/mudi-emu (once per clone)
tools/mudi-emu/bin/mudi-emu fetch && tools/mudi-emu/bin/mudi-emu extract   # official 4.10.0 image
tools/test-local.sh                                    # all suites; router userland via mudi-emu if extracted
tools/mudi-emu/bin/mudi-emu run sh|lua|eco|bin …       # the router's own userland under qemu
node tools/preview.js --matrix                         # every tab x phone/desktop x light/dark, GL's theme, fake data
npm ci && npm run build:web                            # src/web -> dist/views (esbuild); test-local checks freshness
node tools/i18n-keys.mjs --check zh-cn                 # UI strings missing from the Chinese table
node tools/preview.js --i18n-audit --locale zh-cn      # any English left in the rendered page
tools/build.sh                                         # payload tarball (what deploy pushes)
MUDI_HOST=mudi tools/deploy.sh                         # push to a box over ssh (no sftp: uses cat)
MUDI_HOST=mudi tools/verify.sh                         # on-box assertions (optional, last)
```
Dev-box packages the tests use: `lua5.1 lua-cjson busybox qemu-user-static e2fsprogs
binutils-aarch64-linux-gnu shellcheck`, Node ≥ 20, Python 3. `mudi-emu up` (the GL-real
suite) also needs root.

## Where the truth lives
- `docs/architecture.md` — current structure and the 3.0 refactor plan (phases R0–R4).
- `docs/cellular-api-4.10.md` — every GL shape/RPC we depend on, with evidence.
- `docs/knowledge.md` — platform + domain knowledge (band model, sub_id, AT, persistence, gotchas).
- `reference/quectel-at-reference.md` — AT evidence.
- mudi-emu: `docs/gl-behaviour.md` (GL measured by running it), `docs/re-notes-4.10.md` (read from
  its binaries), `reference/e5800-4.10.0/` (GL file copies, checked against the image),
  `modem/README.md` (the model, its evidence and scenarios).
- `docs/audit-2026-11-02.md` — open improvement list; `CHANGELOG.md` — what each release changed.
  `docs/design/` and `docs/history/` are background only (4.8-era unless dated later), not
  instructions.

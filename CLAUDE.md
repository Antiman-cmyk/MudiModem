# MudiModem

A community add-on that installs a **Modem** page into the GL.iNet **GL-E5800 ("Mudi 7")** stock
web admin (GL firmware **4.10 only**): band lock with the carrier-policy layer GL hides,
confirm-or-revert cell lock, live RF tracking, AT console + community AT library, speed test,
battery history + charge limit. It adds files alongside GL's; it patches nothing of GL's.

Rule of scope (owner): ship only what stock 4.10 lacks or does incompletely.

## How to work here
- **Firmware first.** Any question about how GL behaves is answered from the official image:
  `tools/firmware.sh fetch && tools/firmware.sh extract` puts the 4.10.0 rootfs in
  `firmware/rootfs/` (gitignored). Read Lua/JSON/JS there; for binaries use the scripts and
  method in `reference/4.10/` (`re-notes.md`, `re-tools/`). Record new facts in
  `docs/cellular-api-4.10.md` or `docs/knowledge.md` with their evidence.
- **Emulation first.** Run code under the router's own userland on the dev box
  (`qemu-aarch64-static -L firmware/rootfs …`: its `lua`, `eco`, `busybox`, `jsonfilter`,
  `nginx`) with fake GL services, not on a router. `tools/test-local.sh` does this for every suite.
- **A real box is the last resort**, only for what is genuinely runtime (RF state, modem replies,
  timing). Mark such items 🔴, batch them, and never make a change wait on one. Never run write
  commands (band/lock/CFUN/NV) on a box unprompted.
- No mandated process: plan, spec or not as the task needs. Keep the docs below **current** —
  edit the fact in place instead of appending corrections or session logs.

## Invariants (breaking one strands the user's link or breaks GL's admin)
- **Never send `sub_id=0`**; resolve slot → sub_id (slot first, IMSI-confirmed). Writes carry the
  slot the page read and refuse if the active SIM changed.
- Every band/cell-lock write is **confirm-or-revert**, written through GL's own store
  (`modem.set_band_config` / `set_cell_tower` via glc), and the watchdog is armed **before** the
  write. `panic` must keep working from ssh with nothing else running.
- The browser cannot call dotted objects (`/rpc` dot rule); only our undotted `mudimodem` plugin
  calls them, server-side. Any free-form string arg needs a validator entry.
- Nothing slow inside the nginx plugin: 4.10 runs **one** nginx worker, so `os.execute`/`io.popen`
  stall the whole admin. Long work runs detached (via `mudimodem-detach`) or in a daemon.
- **Never `pcall` an `oui.ubus.call`** (cosocket yield). OpenWrt Lua 5.1 ints are 32-bit.
- Chunks: one eval-able expression (`module.exports = …`), `render(h)` only, served as `.gz`.
  Use only CSS variables GL's theme defines. Background calls use rpcSilent, never `$rpcRequest`.
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
src/views/*.js          page chunks (plain JS, render(h)); src/menu/*.json menu entries
src/rpc/mudimodem       nginx Lua plugin (object "mudimodem"); src/validator/ its arg validator
src/sbin/ src/lib/      daemons + helpers (collector, revert watchdog, speedtest, battery limit)
src/ws/mudimodem.lua    /ws seed module; src/nginx/ the gl-conf.d alias
tools/                  build, deploy (ssh), verify (live box), firmware fetch/extract, AT/lib/speedtest tools
test/                   every suite; tools/test-local.sh runs them all (host + router userland via qemu)
reference/4.10/         GL files copied from the image + RE notes/tools
docs/                   architecture.md · cellular-api-4.10.md · knowledge.md · audit · design/ (history)
```

## Commands
```sh
tools/firmware.sh fetch && tools/firmware.sh extract   # official 4.10.0 image -> firmware/rootfs
tools/test-local.sh                                    # all suites; router userland via qemu if rootfs present
tools/build.sh                                         # gzip chunks into build/
MUDI_HOST=mudi tools/deploy.sh                         # push to a box over ssh (no sftp: uses cat)
MUDI_HOST=mudi tools/verify.sh                         # on-box assertions (optional, last)
```
Dev-box packages the tests use: `lua5.1 lua-cjson busybox qemu-user-static
binutils-aarch64-linux-gnu shellcheck`, Node ≥ 20, Python 3.

## Where the truth lives
- `docs/architecture.md` — current structure and the 3.0 refactor plan (phases R0–R4).
- `docs/cellular-api-4.10.md` — every GL shape/RPC we depend on, with evidence.
- `docs/knowledge.md` — platform + domain knowledge (band model, sub_id, AT, persistence, gotchas).
- `reference/quectel-at-reference.md` — AT evidence; `reference/4.10/` — GL source copies + RE.
- `docs/audit-2026-11-02.md` — open improvement list. `docs/design/` and `docs/history/` are
  background only (4.8-era unless dated later), not instructions.

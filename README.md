# MudiModem

The Mudi 7 is a great cell modem/router but I found one thing a bit lacking, which is modem control.   I spent a weekend vibe coding a new modem control panel that brings all things modem into one section of the built in UI.


---

## Features

MudiModem is a tabbed page. Every screen anchors to a persistent **live signal strip** across the top
(RSRP, updating in real time) so you can always see what a change did to the connection. The tabs
documented below are Tracking, Bands, Cell lock, AT console, SIM, Speedtest, Battery and LCD Display;
there is also a Config tab (version / self-update).

### 📈 Tracking

![Tracking tab](docs/screenshots/01-tracking.jpg)

Watch the radio over time. RSRP, SINR, and RSRQ share one time axis so you can see them move together,
with lanes below showing exactly when the **band**, **cell**, or **SIM** changed — and an **event log**
that records every change with a timestamp and who caused it (*you*, the *network*, or the safety
watchdog). Pick a window from 15 minutes to 24 hours. Two badges on the signal strip show at a glance
whether a **mode lock** (Auto / 4G-only / 5G-only) or a **tower lock** is in force; click either to jump
to its tab.

### 📶 Bands

![Bands tab](docs/screenshots/02-bands.jpg)

Choose which cellular bands the modem may use. Each band is colored for its **real** state — *active*,
*permitted but not selected*, or **blocked by carrier policy** (shown and explained, but not selectable,
because the modem will never use it ). A network-mode selector (Auto /
5G only / 4G only) sits on top.

Band changes are **confirm-or-revert**: applying one starts a ~60-second countdown and automatically
rolls back unless you confirm you want to keep it — so a bad lock can't strand the cellular link you're
administering over.

### 🔒 Cell lock

![Cell lock tab](docs/screenshots/03-cell-lock.jpg)

Pin the modem to a specific cell so it won't hand over. The tab shows your current serving cell and can
**scan for nearby lockable cells**, listed with your **serving carrier's cells first** and **5G above
LTE**, each with a one-click Lock. Same confirm-or-revert safety as Bands.

⚠️ A kept cell lock lives in the modem's own memory and survives reboot, reflash, *and* factory reset —
the panel documents the ssh recovery path right on the page. (A scan takes the modem offline for up to
~10 minutes.)

### ⌨️ AT console

![AT console tab](docs/screenshots/04-at-console.jpg)

A raw AT terminal to the modem, on its **own** channel so it doesn't collide with GL's polling. Alongside
it, a searchable **community command library** where every entry carries a **risk badge** — `read` (query
only), `set` (runtime, gone on reboot), or `nv` (**writes permanent memory; survives factory reset**).
Nothing ever runs by itself: clicking a library entry just fills the prompt, and `set`/`nv` commands stay
locked until you tick "enable higher-risk commands."

### 📇 SIM

![SIM tab](docs/screenshots/05-sim.jpg)

Both SIM slots, side by side. This box is DSDS — both SIMs register, but only one carries data — and the
tab makes the split the stock UI hides plainly visible: the **selected** slot and the **data-carrying**
slot can differ. Each card shows identity (hidden by default), APN with quick-pick suggestions, auth, IP
type, and roaming state, with an editable dial profile, a one-click slot switch, and a failover summary.

### 🚀 Speedtest

![Speedtest tab](docs/screenshots/06-speedtest.jpg)

The Mudi has no built-in speed test. This one runs download, upload and latency against Cloudflare's
public endpoints over the box's own uplink — no server to run, nothing to install. Hit **Run speed
test** and the phase text walks you through it (*Testing download… → upload… → latency…*); results
land in a **Latest result** panel with the three headline numbers, then in a history graph below —
download and upload sharing one Mbps axis, latency in a thin lane underneath. Hover any point for the
full detail.

The thing that makes it more than a speed test: **every stored result carries a snapshot of what the
radio was doing at that moment** — carrier, SIM slot, band, cell ID, RSRP, SINR and RSRQ. So a dip in
throughput isn't just a slow number, it's a slow number you can attribute to a band change, a
handover, or a weak cell.

Pick which uplink to test — **Cellular** or **Wired WAN** — and the dropdown marks one *(not
connected)* rather than letting you start a test doomed to fail. The history graph has its own
interface filter, because wired and cellular differ by enough that plotting them together would flatten
the cellular trend into a line along the bottom.

Optional **automatic background tests** on a 30 m – 24 h interval build the history while you're not
looking; **off by default**, because each test spends about 22 MiB of your data plan. Results are
capped at the last 500 and stored in `/etc/mudimodem`, so unlike the RF history they **survive a
reboot**.

### 🔋 Battery

![Battery tab](docs/screenshots/07-battery.jpg)

The Mudi runs on a battery, and the stock UI shows you a single percentage. This tab records the
battery every 20 seconds and plots the last **24 hours** as **four stacked lanes on one time axis** —
charge %, current (mA), voltage (V) and temperature (°C). They are deliberately *not* normalized onto
a shared scale: each lane keeps its real units, because the number that matters most is when current
hits exactly **zero**, and normalizing would turn zero into "low". Pick a window of 15 m / 1 h / 6 h /
24 h, and hover anywhere to read every lane at that instant. Shading behind the chart marks what the
battery was actually doing — *Charging*, *On battery*, *Full*, *Charge blocked (limit)*, *Draining on
power* — and ticks mark each plug and unplug.

Above the chart, a headline estimate — **"3 h 20 m remaining"** or **"1 h 5 m to 80 %"** — fitted from
the recent trend, with the span it was fitted over shown beside it so you can judge it. It refuses to
print a number it can't defend, and while the charge limiter is holding the pack it says **"Holding at
80 %"** rather than inventing a time-to-empty the device is designed to falsify.

The tab also carries the **charge limit** control: cap charging at a target percentage to spare the
cell from sitting at 100 % on permanent mains power. Set the target with a slider and the card reports
whether the limit is *Off*, *Armed* (will apply when the charger connects), or *Active*.

⚠️ Two charge scales exist on this box and they disagree by about 9 points, so every figure is labelled
with which one it is: **GL UI Reported Charge** (what GL's admin and the front panel show) and **IC
Reported Charge** (the raw fuel-gauge reading, which is what the limiter actually enforces against).

The charge-limit stack is based on **[ChiliApple](https://github.com/ChiliApple)'s battery control
scripts**; this tab exists because of their issue #1.

### 🖥️ LCD Display

![LCD Display tab](docs/screenshots/08-lcd.jpg)

MudiModem can also take over the Mudi's **front LCD** with its own cellular status screen — the
[MudiUI](https://github.com/kevinherzig/MudiUI) renderer, folded into this project. It is **off by
default** and changes nothing until you tick the box.

From this tab: enable or disable the panel, set **brightness**, set the **screen timeout** (30 s
through 60 m, or never), and choose the **default page**. Status shows whether the renderer is
currently running.

Enabling it takes the panel over from GL's stock screen — **long-press the panel (~1.6 s) to toggle
back and forth** at any time (GL's screen is reloaded from scratch, so give it a couple of seconds to
reappear). The renderer reads its cellular data from the same collector that feeds the Tracking and
Battery charts rather than polling the modem itself, so the front panel costs the modem nothing extra.

---

## Installing it

One line — no app store, no firmware flash. From a **root shell on the router** (`ssh root@<router>`
first if you're remote):

```sh
curl -fsSL https://raw.githubusercontent.com/kevinherzig/MudiModem/main/install.sh | sh
```

The installer downloads every file from GitHub, gzips the page chunks with the box's own `gzip`, and drops
them into place — no toolchain, nothing to build. Then **reload the GL admin in your browser** and a
**MODEM** item appears in the top navigation. There's no reboot.

**Uninstall** is the mirror image:

```sh
curl -fsSL https://raw.githubusercontent.com/kevinherzig/MudiModem/main/uninstall.sh | sh
```

Both scripts **refuse to run against anything that isn't a GL-E5800** (they check the model first — a
safeguard because GL's default `192.168.8.1` may be a *different* router on your LAN), are idempotent, and
register/de-register the files in `/etc/sysupgrade.conf` so a firmware upgrade doesn't wipe them.

> Developing on it? `./tools/deploy.sh` pushes your local checkout to the box over ssh (set
> `MUDI_HOST`), and `./tools/verify.sh` runs the on-device assertions.

> **Heads up — it's a travel router on cellular.** If you administer the Mudi *over* its own cellular
> link, a bad band or cell lock can drop the connection you're using. MudiModem's confirm-or-revert
> watchdog is built for exactly this, and the panel documents an ssh panic-restore for the worst case —
> but treat band/lock changes with care when you're remote.

## Hardware / compatibility

- **Router:** GL.iNet GL-E5800 ("Mudi"), GL firmware 4.8.5 / OpenWrt 23.05.4
- **Modem:** Quectel **RG650V-NA** (the North America variant)

This was built and verified against one specific box. The band model and AT commands are Quectel- and
firmware-specific; treat other hardware as untested.

## Under the hood

MudiModem is a native page in GL's own **oui**/Vue admin — a view chunk plus a menu entry, so it loads
alongside GL's UI with no rebuild and no patched binaries. Most data arrives free over GL's existing
websocket; a small Lua backend handles the writes and the AT passthrough, guarded by a detached
auto-revert watchdog.

The full reverse-engineering notes live in [`CLAUDE.md`](CLAUDE.md), and the Quectel AT knowledge (marked
verified-on-box vs. from-the-manual) in
[`reference/quectel-at-reference.md`](reference/quectel-at-reference.md). The community AT library is its
own project at [`kevinherzig/mudi7-at-library`](https://github.com/kevinherzig/mudi7-at-library).

## Status

Working today: live tracking, band read/write with auto-revert, cell scan + lock, the AT console and
library, the SIM/APN tab, the speed test with scheduling, the battery history chart + charge limit, and
the front-LCD panel. Still in progress: making band writes durable across a modem-manager
restart, finishing the cell-lock write path, and a one-shot install/uninstall script. See `CLAUDE.md` §12
for the live status.

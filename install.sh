#!/bin/sh
# MudiModem installer — run ON the GL-E5800 ("Mudi"). Self-contained: fetches
# every source file from GitHub and installs it, gzipping the view chunks on the
# box (busybox gzip). No toolchain, no committed artifacts. Idempotent.
# Run it from a root shell on the router (ssh root@<router> first if remote):
#
#   curl -fsSL https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main/install.sh | sh
#
# Env: MUDIMODEM_REF (branch/tag, default main), MUDIMODEM_BASE (override raw URL —
# use this to install from a fork/branch:
#   B=https://raw.githubusercontent.com/<user>/MudiModem/<branch>
#   curl -fsSL "$B/install.sh" | MUDIMODEM_BASE="$B" sh
# The base is recorded in /etc/mudimodem/version.json so the Config tab's update
# check and "Update now" keep following the same source).
set -eu

REF="${MUDIMODEM_REF:-main}"
BASE="${MUDIMODEM_BASE:-https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/$REF}"

# Model guard: on some LANs 192.168.8.1 is a DIFFERENT GL router (AXT1800). Never
# write to anything that isn't a Mudi. GL's own code keys on /proc/gl-hw-info/model.
MODEL=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
HWMODEL=$(cat /proc/gl-hw-info/model 2>/dev/null | tr -d '\0')
case "$MODEL:$HWMODEL" in
  *E5800*|*e5800*) echo "target OK: ${MODEL:-$HWMODEL}" ;;
  *) echo "REFUSING: this is not a GL-E5800 (got: '${MODEL:-unknown}' / '${HWMODEL:-unknown}')" >&2; exit 1 ;;
esac

# Firmware floor: MudiModem 2.x is built for GL firmware 4.10's cellular API
# (per-slot band config, merged websocket state, cell_info). It does NOT run on
# 4.8 — install the 1.x line there (MUDIMODEM_REF=legacy-4.8).
GLVER=$(cat /etc/glversion 2>/dev/null | tr -d '\r\n')
GLMAJ=${GLVER%%.*}; GLREST=${GLVER#*.}; GLMIN=${GLREST%%.*}
if [ -z "${GLVER:-}" ] || [ "${GLMAJ:-0}" -lt 4 ] || { [ "${GLMAJ:-0}" -eq 4 ] && [ "${GLMIN:-0}" -lt 10 ]; }; then
  echo "REFUSING: MudiModem 2.x needs GL firmware >= 4.10 (found '${GLVER:-unknown}')." >&2
  echo "          For 4.8.x use: MUDIMODEM_REF=legacy-4.8 sh install.sh" >&2
  exit 1
fi
echo "firmware OK: $GLVER"

fetch() { curl -fsSL "$BASE/$1"; }   # curl -f => nonzero on HTTP error => set -e aborts

# Fetch a source file to a temp path first, so a mid-stream curl failure can't
# leave a truncated file in place (POSIX sh has no pipefail).
grab() { tmp=$(mktemp); fetch "$1" > "$tmp" || { echo "fetch failed: $1" >&2; rm -f "$tmp"; exit 1; }; }

gz_install()  { grab "$1"; gzip -9 -c "$tmp" > "$2"; rm -f "$tmp"; echo "  $2"; }         # $1 src, $2 .gz target
cp_install()  { grab "$1"; cat "$tmp" > "$2"; chmod "$3" "$2"; rm -f "$tmp"; echo "  $2"; } # $1 src, $2 target, $3 mode

mkdir -p /www/views /www/mudimodem /usr/lib/mudimodem /usr/share/oui/menu.d \
         /usr/share/gl-validator.d /usr/lib/oui-httpd/rpc /usr/sbin /usr/bin \
         /etc/init.d /etc/mudimodem /etc/hotplug.d/i2c /usr/share/gl-ngx/websocket

echo "installing view chunks + menu + library:"
gz_install src/views/mudimodem.js          /www/views/gl-sdk4-ui-mudimodem.common.js.gz
gz_install src/views/mudimodem-tracking.js /www/views/gl-sdk4-ui-mudimodem-tracking.common.js.gz
gz_install src/views/mudimodem-console.js  /www/views/gl-sdk4-ui-mudimodem-console.common.js.gz
gz_install src/views/mudimodem-speedtest.js /www/views/gl-sdk4-ui-mudimodem-speedtest.common.js.gz
# Battery tab is an in-page lazy chunk (no menu JSON) — same pattern as Tracking.
gz_install src/views/mudimodem-battery.js  /www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz
gz_install src/at-library.snapshot.json    /www/mudimodem/at-library.json.gz
cp_install src/menu/mudimodem.json          /usr/share/oui/menu.d/mudimodem.json          0644
cp_install src/menu/mudimodem-tracking.json /usr/share/oui/menu.d/mudimodem-tracking.json 0644
cp_install src/menu/mudimodem-speedtest.json /usr/share/oui/menu.d/mudimodem-speedtest.json 0644
# Record WHERE this install came from next to the version: the Config tab's
# update check and the self-updater follow that base, so an install from a fork
# or branch keeps updating from the same place (never silently from upstream).
grab version.json
VER=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp" | head -n1); rm -f "$tmp"
printf '{"version":"%s","base":"%s"}\n' "${VER:-unknown}" "$BASE" > /etc/mudimodem/version.json
chmod 0644 /etc/mudimodem/version.json
echo "  /etc/mudimodem/version.json (${VER:-unknown} from $BASE)"

echo "installing shared library + helpers:"
# cellular_compat.py: the one place Python knows GL 4.10's cellular shapes
# (collectd, speedtest). mudimodem-detach: detached-child wrapper.
# websocket/mudimodem.lua: GL's /ws seeds the mudimodem.collect subscription
# from it (dofile'd per subscribe — no nginx restart needed to update).
cp_install src/lib/cellular_compat.py /usr/lib/mudimodem/cellular_compat.py 0644
cp_install src/lib/mudimodem-detach   /usr/lib/mudimodem/mudimodem-detach   0755
cp_install src/ws/mudimodem.lua       /usr/share/gl-ngx/websocket/mudimodem.lua 0644

echo "installing AT channel + library tool:"
cp_install tools/mudimodem-at.py /usr/lib/mudimodem/mudimodem-at.py 0644
cp_install tools/mudimodem-lib   /usr/lib/mudimodem/mudimodem-lib   0755

echo "installing speedtest runner + scheduler:"
cp_install tools/mudimodem-speedtest.py      /usr/lib/mudimodem/mudimodem-speedtest.py 0755
cp_install src/sbin/mudimodem-speedtestd     /usr/sbin/mudimodem-speedtestd           0755
cp_install src/etc/init.d/mudimodem-speedtestd /etc/init.d/mudimodem-speedtestd       0755
# Scheduler is off-by-default in its config; enable the service so a user who
# turns scheduling on later doesn't need a separate enable step (matches deploy).
/etc/init.d/mudimodem-speedtestd enable  2>/dev/null || true
/etc/init.d/mudimodem-speedtestd restart 2>/dev/null || true
echo "  speedtest installed + scheduler (re)started"

echo "installing watchdog + validator + backend:"
# Watchdog + validator BEFORE the backend: set_bands needs the watchdog present,
# and the validator must exist before nginx reloads the plugin (§8).
cp_install src/sbin/mudimodem-revert  /usr/sbin/mudimodem-revert            0755
cp_install src/sbin/mudimodem-selfupdate /usr/sbin/mudimodem-selfupdate     0755
cp_install src/validator/mudimodem.lua /usr/share/gl-validator.d/mudimodem.lua 0644
cp_install src/rpc/mudimodem          /usr/lib/oui-httpd/rpc/mudimodem       0644
# RESTART not reload: nginx caches the plugin per worker; reload leaves stale
# workers serving -32601 for the new methods (§8). ~1s admin blip, no link touch.
/etc/init.d/nginx restart 2>/dev/null || true
echo "  nginx restarted"

# 1.x shipped a front-LCD renderer (mudi.py + the mudi/mudi-watch procd
# services). 2.x has none: a box upgrading in place still has them enabled,
# and a running mudi.py would keep the panel seized while reconnecting to a
# collector socket that no longer exists. Remove every trace — the same block
# uninstall.sh runs — idempotently, and hand the panel back to gl_screen only
# if we actually stopped something.
if [ -x /etc/init.d/mudi ] || [ -x /etc/init.d/mudi-watch ] || [ -f /usr/bin/mudi.py ]; then
  echo "removing 1.x LCD renderer leftovers:"
  for svc in mudi mudi-watch; do
    if [ -x /etc/init.d/$svc ]; then
      /etc/init.d/$svc stop    2>/dev/null || true
      /etc/init.d/$svc disable 2>/dev/null || true
      rm -f /etc/init.d/$svc
      echo "  /etc/init.d/$svc stopped + removed"
    fi
  done
  rm -f /usr/bin/mudi.py /usr/bin/mudi-watch.py /etc/config/mudi
  /etc/init.d/gl_screen start 2>/dev/null || true
  # De-register the 1.x LCD paths from sysupgrade.conf (per-line: busybox grep
  # has no multi-line -F).
  f=/etc/sysupgrade.conf
  if [ -f "$f" ]; then
    for p in /usr/bin/mudi.py /usr/bin/mudi-watch.py /etc/init.d/mudi /etc/init.d/mudi-watch /etc/config/mudi; do
      grep -vxF "$p" "$f" > "$f.tmp" 2>/dev/null && mv "$f.tmp" "$f" || rm -f "$f.tmp"
    done
  fi
fi

echo "installing history collector service:"
cp_install src/sbin/mudimodem-collectd        /usr/sbin/mudimodem-collectd    0755
cp_install src/etc/init.d/mudimodem-collectd  /etc/init.d/mudimodem-collectd  0755
/etc/init.d/mudimodem-collectd enable  2>/dev/null || true
/etc/init.d/mudimodem-collectd restart 2>/dev/null || true
echo "  collector enabled + started"

echo "installing battery charge limit:"
# Off first if a previous install's watcher is active — replacing the binary
# under a running watcher is racy.
if [ -x /usr/bin/glbattlimit ]; then
  /usr/bin/glbattlimit off 2>/dev/null || true
fi
cp_install src/sbin/glbattlimit           /usr/bin/glbattlimit                 0755
cp_install src/hotplug/20-glbattlimit     /etc/hotplug.d/i2c/20-glbattlimit    0755
cp_install src/etc/init.d/glbattlimit     /etc/init.d/glbattlimit              0755
# Default policy only if absent — never clobber user settings on upgrade.
if [ ! -f /etc/mudimodem/battlimit.json ]; then
  echo '{"enabled":false,"limit_gui":80}' > /etc/mudimodem/battlimit.json
  chmod 0644 /etc/mudimodem/battlimit.json
  echo "  /etc/mudimodem/battlimit.json (default disabled)"
fi
# History eMMC backup policy — off by default; never clobber user choice.
if [ ! -f /etc/mudimodem/history.json ]; then
  echo '{"enabled":false}' > /etc/mudimodem/history.json
  chmod 0644 /etc/mudimodem/history.json
  echo "  /etc/mudimodem/history.json (default disabled)"
fi
/etc/init.d/glbattlimit enable 2>/dev/null || true
# Do NOT start a limit on install (default disabled; start would no-op anyway).
echo "  battery charge limit stack installed"

# Python for the collector, the speed test and the AT tool. python3-light carries
# everything they import (json/os/subprocess/select/fcntl/socket). Offline-tolerant.
if ! opkg list-installed 2>/dev/null | grep -q "^python3-light "; then
  opkg update 2>/dev/null || true
  opkg install python3-light || true
fi

# Survive a firmware upgrade (our files live outside /etc/config). Idempotent.
echo "registering files in /etc/sysupgrade.conf:"
f=/etc/sysupgrade.conf; touch "$f"
for p in \
  /www/views/gl-sdk4-ui-mudimodem.common.js.gz \
  /www/views/gl-sdk4-ui-mudimodem-tracking.common.js.gz \
  /www/views/gl-sdk4-ui-mudimodem-console.common.js.gz \
  /www/views/gl-sdk4-ui-mudimodem-speedtest.common.js.gz \
  /www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz \
  /www/mudimodem/at-library.json.gz \
  /usr/share/oui/menu.d/mudimodem.json \
  /usr/share/oui/menu.d/mudimodem-tracking.json \
  /usr/share/oui/menu.d/mudimodem-speedtest.json \
  /usr/lib/mudimodem/cellular_compat.py \
  /usr/lib/mudimodem/mudimodem-detach \
  /usr/share/gl-ngx/websocket/mudimodem.lua \
  /usr/lib/mudimodem/mudimodem-at.py \
  /usr/lib/mudimodem/mudimodem-lib \
  /usr/lib/mudimodem/mudimodem-speedtest.py \
  /usr/sbin/mudimodem-speedtestd \
  /etc/init.d/mudimodem-speedtestd \
  /usr/sbin/mudimodem-revert \
  /usr/sbin/mudimodem-selfupdate \
  /usr/share/gl-validator.d/mudimodem.lua \
  /usr/lib/oui-httpd/rpc/mudimodem \
  /usr/sbin/mudimodem-collectd \
  /etc/init.d/mudimodem-collectd \
  /etc/mudimodem/version.json \
  /usr/bin/glbattlimit \
  /etc/hotplug.d/i2c/20-glbattlimit \
  /etc/init.d/glbattlimit \
  /etc/mudimodem/battlimit.json \
  /etc/mudimodem/history.json \
  /etc/mudimodem/history \
; do grep -qxF "$p" "$f" || echo "$p" >> "$f"; done
echo "  done"

echo ""
echo "MudiModem installed. Reload the GL admin in your browser — a MODEM item"
echo "appears in the top navigation. No reboot needed."

#!/bin/sh
# tools/deploy.sh - push Phase 0 artifacts to the Mudi.
# No scp: the box has no sftp-server, so we stream over ssh `cat`.
set -eu
cd "$(dirname "$0")/.."
HOST="${MUDI_HOST:-mudi}"

# Model guard: 192.168.8.1 on this LAN is a DIFFERENT GL router (AXT1800).
MODEL=$(ssh -o BatchMode=yes "root@$HOST" 'cat /proc/device-tree/model' 2>/dev/null | tr -d '\0')
case "$MODEL" in
  *E5800*) : ;;
  *) echo "REFUSING: '$HOST' is not a GL-E5800 (got: '$MODEL')" >&2; exit 1 ;;
esac
echo "target OK: $MODEL"
# Firmware floor (MudiModem 2.x is 4.10-only — see install.sh). Numeric
# major.minor compare, the SAME expression install.sh uses: a glob such as
# `4.[2-9]*` also matches 4.8.5/4.9.0, exactly the firmware this must refuse.
GLVER=$(ssh -o BatchMode=yes "root@$HOST" 'cat /etc/glversion' 2>/dev/null | tr -d '\r\n')
GLMAJ=${GLVER%%.*}; GLREST=${GLVER#*.}; GLMIN=${GLREST%%.*}
case "$GLMAJ$GLMIN" in *[!0-9]*|"") GLMAJ=0; GLMIN=0 ;; esac
if [ -z "${GLVER:-}" ] || [ "${GLMAJ:-0}" -lt 4 ] || { [ "${GLMAJ:-0}" -eq 4 ] && [ "${GLMIN:-0}" -lt 10 ]; }; then
  echo "REFUSING: MudiModem 2.x needs GL firmware >= 4.10 (found '${GLVER:-unknown}')" >&2; exit 1
fi
echo "firmware OK: $GLVER"

./tools/build.sh

# Same as install.sh: python3 for the collector / speed test / AT tool, BEFORE
# any of those services restarts below (their init scripts would otherwise
# spawn a heal that races this opkg run).
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/lib/mudimodem && cat > /usr/lib/mudimodem/mudimodem-deps && chmod 0755 /usr/lib/mudimodem/mudimodem-deps' \
  < src/lib/mudimodem-deps
ssh -o BatchMode=yes "root@$HOST" '/usr/lib/mudimodem/mudimodem-deps install' || true

# Web payload under /usr/share/mudimodem/www (a firmware upgrade never restores
# /www) + the gl-conf.d alias that serves it; nginx loads it at the restart below.
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/share/mudimodem/www/views /usr/share/mudimodem/www/mudimodem /etc/nginx/gl-conf.d'
ssh -o BatchMode=yes "root@$HOST" 'cat > /etc/nginx/gl-conf.d/mudimodem.conf' \
  < src/nginx/mudimodem.conf
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/mudimodem/www/views/gl-sdk4-ui-mudimodem.common.js.gz' \
  < build/gl-sdk4-ui-mudimodem.common.js.gz
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/oui/menu.d/mudimodem.json' \
  < src/menu/mudimodem.json

# Tracking page (hidden level:0 route) — second chunk + menu entry.
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/mudimodem/www/views/gl-sdk4-ui-mudimodem-tracking.common.js.gz' \
  < build/gl-sdk4-ui-mudimodem-tracking.common.js.gz
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/oui/menu.d/mudimodem-tracking.json' \
  < src/menu/mudimodem-tracking.json
echo "tracking chunk + menu deployed"

# Phase 3: AT console chunk + community library + our own AT channel tool.
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/mudimodem/www/views/gl-sdk4-ui-mudimodem-console.common.js.gz' \
  < build/gl-sdk4-ui-mudimodem-console.common.js.gz
# AT library: the bundled snapshot only fills a missing/unreadable cache —
# `mudimodem-lib refresh` writes the same file with newer data and nothing in
# the library is orderable (same rule as install.sh). To push a changed
# snapshot while iterating on it, delete the cache on the box first.
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/share/mudimodem/www/mudimodem; f=/usr/share/mudimodem/www/mudimodem/at-library.json.gz; cat > "$f.new"
  if gzip -t "$f" 2>/dev/null && gzip -dc "$f" 2>/dev/null | grep -q "\"entries\"" && gzip -dc "$f" 2>/dev/null | grep -q "\"revision\""; then
    rm -f "$f.new"; echo "AT library cache kept (existing copy)"
  else
    mv "$f.new" "$f"; echo "AT library snapshot installed"
  fi' < build/at-library.json.gz
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/lib/mudimodem && cat > /usr/lib/mudimodem/mudimodem-at.py' \
  < tools/mudimodem-at.py
echo "console chunk + AT tool deployed"

# Shared 4.10 helpers: the Python cellular compat lib, the detach wrapper, and
# GL's /ws seed module for mudimodem.collect (dofile'd per subscribe).
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/lib/mudimodem && cat > /usr/lib/mudimodem/cellular_compat.py' \
  < src/lib/cellular_compat.py
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/lib/mudimodem/mudimodem-detach && chmod 0755 /usr/lib/mudimodem/mudimodem-detach' \
  < src/lib/mudimodem-detach
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/share/gl-ngx/websocket && cat > /usr/share/gl-ngx/websocket/mudimodem.lua' \
  < src/ws/mudimodem.lua
echo "cellular_compat + detach + ws seed module deployed"

# Library check/refresh tool — pulls the community AT library from the
# external mudi7-at-library repo (fail-silent when unreachable; §4).
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/lib/mudimodem && cat > /usr/lib/mudimodem/mudimodem-lib && chmod 0755 /usr/lib/mudimodem/mudimodem-lib' \
  < tools/mudimodem-lib
echo "library check/refresh tool deployed"

# Phase: Speedtest chunk + menu + own-script runner + optional scheduler.
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/mudimodem/www/views/gl-sdk4-ui-mudimodem-speedtest.common.js.gz' \
  < build/gl-sdk4-ui-mudimodem-speedtest.common.js.gz
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/oui/menu.d/mudimodem-speedtest.json' \
  < src/menu/mudimodem-speedtest.json
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /usr/lib/mudimodem && cat > /usr/lib/mudimodem/mudimodem-speedtest.py && chmod 0755 /usr/lib/mudimodem/mudimodem-speedtest.py' \
  < tools/mudimodem-speedtest.py
echo "speedtest chunk + menu + runner deployed"

# Battery tab (issue #1) — chunk only; no menu JSON (it is an in-page tab, not
# a standalone route) and no new backend file (get_battery_history ships inside
# the existing rpc/mudimodem).
ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/mudimodem/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz' \
  < build/gl-sdk4-ui-mudimodem-battery.common.js.gz
echo "battery chunk deployed"

if [ -f src/sbin/mudimodem-speedtestd ]; then
  ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/sbin/mudimodem-speedtestd && chmod 0755 /usr/sbin/mudimodem-speedtestd' \
    < src/sbin/mudimodem-speedtestd
  ssh -o BatchMode=yes "root@$HOST" 'cat > /etc/init.d/mudimodem-speedtestd && chmod 0755 /etc/init.d/mudimodem-speedtestd' \
    < src/etc/init.d/mudimodem-speedtestd
  ssh -o BatchMode=yes "root@$HOST" '/etc/init.d/mudimodem-speedtestd enable; /etc/init.d/mudimodem-speedtestd restart' 2>/dev/null || true
  echo "speedtest scheduler deployed + service (re)started (off by default)"
fi

# Confirm-or-revert watchdog + panic restore (§5). Inert until invoked; install
# it BEFORE the backend so set_bands can always find it.
if [ -f src/sbin/mudimodem-revert ]; then
  ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/sbin/mudimodem-revert && chmod 0755 /usr/sbin/mudimodem-revert && mkdir -p /etc/mudimodem' \
    < src/sbin/mudimodem-revert
ssh -o BatchMode=yes "root@$HOST" 'cat > /etc/init.d/mudimodem-revert && chmod 0755 /etc/init.d/mudimodem-revert && /etc/init.d/mudimodem-revert enable' \
  < src/etc/init.d/mudimodem-revert
echo "watchdog boot hook deployed + enabled"
  echo "watchdog installed (/usr/sbin/mudimodem-revert)"
fi

# Self-update script (Task 3). Detached, lockdir-guarded; install.sh restarts
# nginx at the end, so mudimodem.self_update launches this rather than running
# install.sh in-handler (which would drop the /rpc connection).
if [ -f src/sbin/mudimodem-selfupdate ]; then
  ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/sbin/mudimodem-selfupdate && chmod 0755 /usr/sbin/mudimodem-selfupdate' \
    < src/sbin/mudimodem-selfupdate
  echo "self-update script installed (/usr/sbin/mudimodem-selfupdate)"
fi

# Arg validator for the mudimodem object. ⚠️ REQUIRED for the AT console: without
# it, oui applies a default allowlist that rejects '+', '=', '"' — so every real
# AT command -32602's before the backend runs (only bare ATI/AT slip through).
# Push BEFORE the backend so the nginx restart below picks up a consistent set.
if [ -f src/validator/mudimodem.lua ]; then
  ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/share/gl-validator.d/mudimodem.lua' \
    < src/validator/mudimodem.lua
  echo "arg validator deployed (/usr/share/gl-validator.d/mudimodem.lua)"
fi

# RPC backend (Lua plugin). nginx caches the plugin per worker (oui/rpc.lua
# objects[]). ⚠️ Use RESTART, not reload: reload (HUP) leaves old workers alive
# — and long-lived /ws websocket connections keep them alive — still serving
# /rpc from the STALE cached plugin. A newly-ADDED method then returns -32601
# "Method not found" on those workers, intermittently, which pops GL's global
# "Unknown error" banner. restart forces every worker to re-dofile the current
# file. Costs a ~1s admin-UI blip; does NOT touch the cellular link. (CLAUDE.md §8)
# A charge-limit watcher started from the web panel by an older glbattlimit
# holds nginx's listening sockets (it inherited them): stop it first, or the
# restarted nginx can't bind 80/443 (see install.sh). Re-applied further down.
if [ -f src/rpc/mudimodem ]; then
  ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/lib/oui-httpd/rpc/mudimodem' \
    < src/rpc/mudimodem
  ssh -o BatchMode=yes "root@$HOST" '[ -x /usr/bin/glbattlimit ] && /usr/bin/glbattlimit off
    for p in $(pgrep -f "glbattlimi[t] _watch"); do kill -9 "$p"; done; true' 2>/dev/null || true
  ssh -o BatchMode=yes "root@$HOST" '/etc/init.d/nginx restart' 2>/dev/null || true
  echo "backend deployed + nginx restarted"
fi

# Background history collector (Python daemon + procd service). Poll ubus only.
if [ -f src/sbin/mudimodem-collectd ]; then
  ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/sbin/mudimodem-collectd && chmod 0755 /usr/sbin/mudimodem-collectd' \
    < src/sbin/mudimodem-collectd
  ssh -o BatchMode=yes "root@$HOST" 'cat > /etc/init.d/mudimodem-collectd && chmod 0755 /etc/init.d/mudimodem-collectd' \
    < src/etc/init.d/mudimodem-collectd
  # enable (start on boot) + (re)start now so a new binary takes effect.
  ssh -o BatchMode=yes "root@$HOST" '/etc/init.d/mudimodem-collectd enable; /etc/init.d/mudimodem-collectd restart' 2>/dev/null || true
  echo "collector deployed + service (re)started"
fi

# Battery charge limit: glbattlimit + hotplug + init + default policy JSON.
# Off first if a previous watcher is active — replacing the binary mid-run is racy;
# then kill a survivor an older glbattlimit leaves behind (see install.sh), and
# re-apply the saved policy once the new files are in place.
if [ -f src/sbin/glbattlimit ]; then
  ssh -o BatchMode=yes "root@$HOST" '[ -x /usr/bin/glbattlimit ] && /usr/bin/glbattlimit off
    for p in $(pgrep -f "glbattlimi[t] _watch"); do kill -9 "$p"; done; true' 2>/dev/null || true
  ssh -o BatchMode=yes "root@$HOST" 'cat > /usr/bin/glbattlimit && chmod 0755 /usr/bin/glbattlimit' \
    < src/sbin/glbattlimit
  ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /etc/hotplug.d/i2c; cat > /etc/hotplug.d/i2c/20-glbattlimit && chmod 0755 /etc/hotplug.d/i2c/20-glbattlimit' \
    < src/hotplug/20-glbattlimit
  ssh -o BatchMode=yes "root@$HOST" 'cat > /etc/init.d/glbattlimit && chmod 0755 /etc/init.d/glbattlimit' \
    < src/etc/init.d/glbattlimit
  ssh -o BatchMode=yes "root@$HOST" '
    mkdir -p /etc/mudimodem
    [ -f /etc/mudimodem/battlimit.json ] || echo "{\"enabled\":false,\"limit_gui\":80}" > /etc/mudimodem/battlimit.json
    # History eMMC backup policy — off by default; never clobber an existing choice.
    [ -f /etc/mudimodem/history.json ] || echo "{\"enabled\":false}" > /etc/mudimodem/history.json
    /etc/init.d/glbattlimit enable 2>/dev/null || true
    /etc/init.d/glbattlimit start 2>/dev/null || true
  '
  echo "battery charge limit stack deployed (saved policy re-applied)"
fi

# History persist policy (also ensured when battlimit block is skipped).
ssh -o BatchMode=yes "root@$HOST" '
  mkdir -p /etc/mudimodem
  [ -f /etc/mudimodem/history.json ] || echo "{\"enabled\":false}" > /etc/mudimodem/history.json
'
echo "history persist policy present (default off)"

# Survive a firmware upgrade: abfota_update keeps exactly what keep.d lists.
ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /lib/upgrade/keep.d && cat > /lib/upgrade/keep.d/mudimodem' \
  < src/upgrade/keep.d/mudimodem
echo "keep.d registered"

# Same as install.sh: drop a 2.0.0 install's /www payload and sysupgrade.conf entries.
ssh -o BatchMode=yes "root@$HOST" 'rm -f /www/views/gl-sdk4-ui-mudimodem*.common.js.gz; rm -rf /www/mudimodem
  f=/etc/sysupgrade.conf
  if [ -f "$f" ] && grep -q -e mudimodem -e glbattlimit "$f"; then
    grep -v -e mudimodem -e glbattlimit "$f" > "$f.tmp" || true
    cat "$f.tmp" > "$f"; rm -f "$f.tmp"
  fi'
echo "2.0.0 leftovers cleared"

# Last, once every file above is in place (a deploy that died half-way must not
# claim the new version): the installed-version marker read by
# mudimodem.app_version — version + the source the box should self-update from
# (MUDIMODEM_BASE, default upstream main).
VER=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' version.json | head -n1)
UPD_BASE="${MUDIMODEM_BASE:-https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main}"
printf '{"version":"%s","base":"%s"}\n' "$VER" "$UPD_BASE" \
  | ssh -o BatchMode=yes "root@$HOST" 'mkdir -p /etc/mudimodem && cat > /etc/mudimodem/version.json'
echo "version.json deployed ($VER, updates from $UPD_BASE)"
echo "deployed to $HOST"

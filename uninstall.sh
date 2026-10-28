#!/bin/sh
# MudiModem uninstaller — run ON the GL-E5800 ("Mudi"). Removes every file the
# installer placed (keep.d entry included) and restarts nginx.
# Idempotent. Does NOT touch the modem's band/cell-lock NV — clear those from the
# panel (or the ssh panic-restore) BEFORE uninstalling if you want them gone.
# The one exception: a change still in its confirm-or-revert window is reverted
# first, exactly as its watchdog would have done.
# Run it from a root shell on the router (ssh root@<router> first if remote):
#
#   curl -fsSL https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main/uninstall.sh | sh
set -eu

MODEL=$(cat /proc/device-tree/model 2>/dev/null | tr -d '\0')
HWMODEL=$(cat /proc/gl-hw-info/model 2>/dev/null | tr -d '\0')
case "$MODEL:$HWMODEL" in
  *E5800*|*e5800*) echo "target OK: ${MODEL:-$HWMODEL}" ;;
  *) echo "REFUSING: this is not a GL-E5800 (got: '${MODEL:-unknown}' / '${HWMODEL:-unknown}')" >&2; exit 1 ;;
esac

# Every file install.sh writes outside our own directories (DIRS below);
# test/test_install_wiring.sh checks it against install.sh.
FILES="
/lib/upgrade/keep.d/mudimodem
/etc/nginx/gl-conf.d/mudimodem.conf
/usr/share/oui/menu.d/mudimodem.json
/usr/share/oui/menu.d/mudimodem-tracking.json
/usr/share/oui/menu.d/mudimodem-speedtest.json
/usr/share/gl-ngx/websocket/mudimodem.lua
/usr/share/gl-validator.d/mudimodem.lua
/usr/lib/oui-httpd/rpc/mudimodem
/usr/sbin/mudimodem-speedtestd
/etc/init.d/mudimodem-speedtestd
/usr/sbin/mudimodem-revert
/etc/init.d/mudimodem-revert
/usr/sbin/mudimodem-selfupdate
/usr/sbin/mudimodem-collectd
/etc/init.d/mudimodem-collectd
/usr/bin/glbattlimit
/etc/hotplug.d/i2c/20-glbattlimit
/etc/init.d/glbattlimit
"
# Ours entirely: web payload, helpers + tools, state (pending-revert marker,
# version, battlimit, history, speedtest).
DIRS="/usr/share/mudimodem /usr/lib/mudimodem /etc/mudimodem"

# FIRST, before anything is stopped or removed: a band/cell-lock change still
# inside its confirm-or-revert window exists only as /etc/mudimodem/pending +
# a sleeping watchdog. Deleting them would make the trial change permanent
# (the watchdog wakes to "confirmed"), so undo it now — the same synchronous
# restore the page's "Revert now" runs, while nginx/gl-session are still up —
# and refuse to go on if it fails (the watchdog then stays armed).
if [ -f /etc/mudimodem/pending ]; then
  echo "an unconfirmed band/cell-lock change is pending - reverting it first:"
  if [ -x /usr/sbin/mudimodem-revert ] && out=$(/usr/sbin/mudimodem-revert restore-now 2>&1); then
    echo "  $out"
  else
    echo "  ${out:-/usr/sbin/mudimodem-revert is missing}" >&2
    echo "ABORTING: the pending change could not be reverted; removing MudiModem now would keep it." >&2
    echo "  Retry in a minute, or run: /usr/sbin/mudimodem-revert panic" >&2
    echo "  (or keep the change: rm /etc/mudimodem/pending) and re-run the uninstaller." >&2
    exit 1
  fi
fi
# Then stand down any watchdog still sleeping, and a boot-check retry loop
# (pending is gone, they would only wake to a no-op; [t]: never match this shell).
for p in $(pgrep -f 'mudimodem-rever[t] watch' 2>/dev/null) $(pgrep -f 'mudimodem-rever[t] boot-check' 2>/dev/null); do
  kill "$p" 2>/dev/null || true
done

# Release charge limit before removing the binary (restores factory charge path).
if [ -x /usr/bin/glbattlimit ]; then
  /usr/bin/glbattlimit off 2>/dev/null || true
  echo "charge limit released"
fi
if [ -x /etc/init.d/glbattlimit ]; then
  /etc/init.d/glbattlimit disable 2>/dev/null || true
fi

# Stop + disable services before removing their files.
if [ -x /etc/init.d/mudimodem-collectd ]; then
  /etc/init.d/mudimodem-collectd stop    2>/dev/null || true
  /etc/init.d/mudimodem-collectd disable 2>/dev/null || true
  echo "collector stopped + disabled"
fi
if [ -x /etc/init.d/mudimodem-revert ]; then
  /etc/init.d/mudimodem-revert disable 2>/dev/null || true
fi
if [ -x /etc/init.d/mudimodem-speedtestd ]; then
  /etc/init.d/mudimodem-speedtestd stop    2>/dev/null || true
  /etc/init.d/mudimodem-speedtestd disable 2>/dev/null || true
  echo "speedtest scheduler stopped + disabled"
fi

# 1.x shipped an LCD renderer (mudi.py) that seized the front panel; if a
# leftover is still there, stop it and hand the panel back to gl_screen.
# Every step is `|| true`: under `set -e` a procd `stop` on a service that was
# never registered exits non-zero and would abort the uninstall half-way.
for svc in mudi mudi-watch; do
  if [ -x /etc/init.d/$svc ]; then
    /etc/init.d/$svc stop    2>/dev/null || true
    /etc/init.d/$svc disable 2>/dev/null || true
    rm -f /etc/init.d/$svc || true
    echo "1.x LCD service $svc stopped + removed"
  fi
done
rm -f /usr/bin/mudi.py /usr/bin/mudi-watch.py /etc/config/mudi || true
/etc/init.d/gl_screen start 2>/dev/null || true

echo "removing files:"
for p in $FILES $DIRS; do [ -e "$p" ] && rm -rf "$p" && echo "  $p"; done

# A box still on 2.0.0 (or updated from it before install.sh cleaned up) has
# its web payload in /www and its files registered in /etc/sysupgrade.conf.
rm -f /www/views/gl-sdk4-ui-mudimodem*.common.js.gz
rm -rf /www/mudimodem
f=/etc/sysupgrade.conf
if [ -f "$f" ] && grep -q -e mudimodem -e glbattlimit "$f"; then
  grep -v -e mudimodem -e glbattlimit "$f" > "$f.tmp" || true
  cat "$f.tmp" > "$f"; rm -f "$f.tmp"
  echo "  2.0.0 sysupgrade.conf entries removed"
fi

# Restart nginx so the cached RPC plugin and our gl-conf.d alias are dropped
# and the removed chunks 404.
/etc/init.d/nginx restart 2>/dev/null || true
echo "nginx restarted"

echo ""
echo "MudiModem removed. Reload the GL admin — the MODEM item is gone. No reboot"
echo "needed. (Any band/cell lock you set lives in modem NV and is unaffected.)"

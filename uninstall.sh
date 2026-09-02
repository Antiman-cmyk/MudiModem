#!/bin/sh
# MudiModem uninstaller — run ON the GL-E5800 ("Mudi"). Removes every file the
# installer placed, de-registers them from sysupgrade.conf, and restarts nginx.
# Idempotent. Does NOT touch the modem's band/cell-lock NV — clear those from the
# panel (or the ssh panic-restore) BEFORE uninstalling if you want them gone.
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

# Must stay in lockstep with install.sh's sysupgrade list.
FILES="
/www/views/gl-sdk4-ui-mudimodem.common.js.gz
/www/views/gl-sdk4-ui-mudimodem-tracking.common.js.gz
/www/views/gl-sdk4-ui-mudimodem-console.common.js.gz
/www/views/gl-sdk4-ui-mudimodem-speedtest.common.js.gz
/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz
/www/mudimodem/at-library.json.gz
/usr/share/oui/menu.d/mudimodem.json
/usr/share/oui/menu.d/mudimodem-tracking.json
/usr/share/oui/menu.d/mudimodem-speedtest.json
/usr/lib/mudimodem/cellular_compat.py
/usr/lib/mudimodem/mudimodem-detach
/usr/share/gl-ngx/websocket/mudimodem.lua
/usr/lib/mudimodem/mudimodem-at.py
/usr/lib/mudimodem/mudimodem-lib
/usr/lib/mudimodem/mudimodem-speedtest.py
/usr/sbin/mudimodem-speedtestd
/etc/init.d/mudimodem-speedtestd
/usr/sbin/mudimodem-revert
/usr/sbin/mudimodem-selfupdate
/usr/share/gl-validator.d/mudimodem.lua
/usr/lib/oui-httpd/rpc/mudimodem
/usr/sbin/mudimodem-collectd
/etc/init.d/mudimodem-collectd
/etc/mudimodem/version.json
/usr/bin/glbattlimit
/etc/hotplug.d/i2c/20-glbattlimit
/etc/init.d/glbattlimit
/etc/mudimodem/battlimit.json
/etc/mudimodem/history.json
/etc/mudimodem/history
"

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
for p in $FILES; do [ -e "$p" ] && rm -f "$p" && echo "  $p"; done

# Our own dirs + runtime state (pending-revert marker, version, battlimit,
# speedtest history). Only remove if empty/ours.
rm -rf /usr/lib/mudimodem /www/mudimodem /etc/mudimodem 2>/dev/null || true

# De-register from sysupgrade.conf (drop exactly our lines, keep everything else).
# Per-line loop is portable across busybox/GNU grep (multi-line -F is not).
f=/etc/sysupgrade.conf
if [ -f "$f" ]; then
  tmp=$(mktemp)
  : > "$tmp"
  while IFS= read -r line || [ -n "$line" ]; do
    keep=1
    for p in $FILES; do
      if [ "$line" = "$p" ]; then keep=0; break; fi
    done
    [ "$keep" -eq 1 ] && printf '%s\n' "$line" >> "$tmp"
  done < "$f"
  cat "$tmp" > "$f"
  rm -f "$tmp"
  echo "de-registered from sysupgrade.conf"
fi

# Restart nginx so the cached RPC plugin is dropped and the removed chunks 404.
/etc/init.d/nginx restart 2>/dev/null || true
echo "nginx restarted"

echo ""
echo "MudiModem removed. Reload the GL admin — the MODEM item is gone. No reboot"
echo "needed. (Any band/cell lock you set lives in modem NV and is unaffected.)"

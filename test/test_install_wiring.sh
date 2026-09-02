#!/bin/sh
# Static assertions on install.sh / uninstall.sh wiring. No device needed.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $1" >&2; exit 1; }

# --- no LCD renderer in 2.x; python3 for the daemons is ensured explicitly ---
grep -qE 'src/lcd|cp_install .*(mudi\.py|mudi-watch|init\.d/mudi[^m]|config/mudi)' install.sh && fail "install.sh must not ship the LCD renderer (removed in 2.0)"
grep -q 'rm -f /usr/bin/mudi.py' install.sh      || fail "install.sh must purge a 1.x LCD renderer left on the box"
grep -q 'python3-light' install.sh              || fail "install.sh must ensure python3-light (collector/speedtest/AT tool)"
grep -q '/etc/init.d/gl_screen start' uninstall.sh || fail "uninstall.sh must hand the panel back if a 1.x renderer is left"

# --- 4.10 shared helpers (2.0.0) ---
grep -q 'src/lib/cellular_compat.py' install.sh   || fail "install.sh must install cellular_compat.py"
grep -q 'src/lib/mudimodem-detach' install.sh     || fail "install.sh must install mudimodem-detach"
grep -q 'src/ws/mudimodem.lua' install.sh         || fail "install.sh must install the ws seed module"
grep -q '/usr/share/gl-ngx/websocket/mudimodem.lua' uninstall.sh || fail "uninstall.sh must remove the ws seed module"
grep -q '/etc/glversion' install.sh               || fail "install.sh must enforce the 4.10 firmware floor"
grep -q 'pkill -' src/rpc/mudimodem               && fail "backend must not use pkill (absent from 4.10 busybox)"
# (grep -q prints nothing, so it can never feed a second grep — match, then filter.)
if grep 'gl_modem' tools/mudimodem-at.py | grep -v poller | grep -q .; then fail "AT tool must not touch gl_modem"; fi
grep -q 'init.d/mudi' install.sh                  || fail "install.sh must purge 1.x LCD leftovers (mudi/mudi-watch) on upgrade"
grep -q 'src/etc/init.d/mudimodem-revert' install.sh && grep -q 'init.d/mudimodem-revert enable' install.sh || fail "install.sh must install + enable the watchdog boot hook"
grep -q '/etc/init.d/mudimodem-revert' uninstall.sh && grep -q 'init.d/mudimodem-revert disable' uninstall.sh || fail "uninstall.sh must disable + remove the boot hook"
grep -q 'boot-check' src/etc/init.d/mudimodem-revert || fail "boot hook must run mudimodem-revert boot-check"
grep -q 'set_cell_tower' src/sbin/mudimodem-revert || fail "panic must clear GL's stored cell lock per slot (sub_id-agnostic)"
grep -q 'gl-stale\|MUDIMODEM_STALE' src/rpc/mudimodem src/sbin/mudimodem-revert && fail "gl-stale marker file was removed in 2.0.0; stale is derived live" || true

# --- selfupdate + version (previous leaks) ---
grep -q 'src/sbin/mudimodem-selfupdate' install.sh || fail "install.sh must install selfupdate"
grep -q '/usr/sbin/mudimodem-selfupdate' uninstall.sh || fail "uninstall.sh must remove selfupdate"
grep -q '/etc/mudimodem/version.json' install.sh      || fail "install.sh must place version.json"
grep -q '"base":"%s"' install.sh                       || fail "install.sh must record its install source (base) in version.json"
grep -q 'MUDIMODEM_BASE=' src/sbin/mudimodem-selfupdate || fail "self-update must pass the recorded base to install.sh"
grep -q '/etc/mudimodem/version.json' uninstall.sh    || fail "uninstall.sh must list version.json (sysupgrade de-register)"

# --- deploy.sh must register every file it pushes (parity with install.sh) ---
# Extract both /etc/sysupgrade.conf lists (the `for p in ... ; do` blocks) and
# require deploy.sh's to be a superset of install.sh's minus nothing.
inst_list=$(sed -n '/registering files in \/etc\/sysupgrade.conf/,/done/p' install.sh | grep -o '^\s*/[^ \\]*' | tr -d ' \t' | sort -u)
dep_list=$(sed -n '/f=\/etc\/sysupgrade.conf; touch/,/done/p' tools/deploy.sh | grep -o '^\s*/[^ \\]*' | tr -d ' \t' | sort -u)
for p in $inst_list; do
  echo "$dep_list" | grep -qxF "$p" || fail "deploy.sh sysupgrade list is missing $p (install.sh has it)"
done
# The firmware gate must be the numeric compare, never a glob (4.[2-9]* matches 4.8.5).
grep -hv '^[[:space:]]*#' tools/deploy.sh tools/verify.sh | grep -q '4\.\[2-9\]' && fail "deploy/verify firmware gate must not be a glob" || true
grep -q 'GLMIN' tools/deploy.sh && grep -q 'GLMIN' tools/verify.sh || fail "deploy/verify must use install.sh's numeric firmware compare"

# --- speedtest (parity with deploy.sh) ---
grep -q 'src/views/mudimodem-speedtest.js' install.sh || fail "install.sh must install speedtest chunk"
grep -q 'src/menu/mudimodem-speedtest.json' install.sh || fail "install.sh must install speedtest menu"
grep -q 'tools/mudimodem-speedtest.py' install.sh || fail "install.sh must install speedtest runner"
grep -q 'src/sbin/mudimodem-speedtestd' install.sh || fail "install.sh must install speedtestd"
grep -q '/www/views/gl-sdk4-ui-mudimodem-speedtest.common.js.gz' uninstall.sh || fail "uninstall must remove speedtest chunk"
grep -q '/usr/sbin/mudimodem-speedtestd' uninstall.sh || fail "uninstall must remove speedtestd"
grep -q 'mudimodem-speedtestd stop' uninstall.sh || fail "uninstall must stop speedtestd before remove"

# --- battery tab (lazy chunk; parity with deploy.sh — was missing, broke curl install) ---
grep -q 'src/views/mudimodem-battery.js' install.sh || fail "install.sh must install battery chunk"
grep -q '/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz' install.sh || fail "install.sh must register battery chunk in sysupgrade"
grep -q '/www/views/gl-sdk4-ui-mudimodem-battery.common.js.gz' uninstall.sh || fail "uninstall must remove battery chunk"

# --- install destinations must exist as sources ---
# shellcheck disable=SC2016
srcs=$(grep -E '^\s*(gz_install|cp_install)\s+' install.sh | awk '{print $2}')
for s in $srcs; do
  [ -f "$s" ] || fail "install source missing: $s"
done

# --- install/uninstall path parity ---
# Extract install sysupgrade paths and uninstall FILES paths; every install path
# except intentional keeps must appear in uninstall.
install_paths=$(awk '/registering files/,/^echo "  done"/' install.sh \
  | grep -E '^\s*/' | tr -d ' \\' | sed 's/;.*//')
uninstall_paths=$(awk '/^FILES="/,/^"/' uninstall.sh | grep -E '^\s*/' | tr -d ' ')

for p in $install_paths; do
  # /etc/config/mudi is never in sysupgrade list from the loop above (only
  # written conditionally) — if it ever appears, uninstall must keep it.
  echo "$uninstall_paths" | grep -qxF "$p" \
    || fail "install sysupgrade path missing from uninstall FILES: $p"
done

echo "install wiring OK"

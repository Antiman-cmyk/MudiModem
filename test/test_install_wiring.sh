#!/bin/sh
# Static assertions on install.sh / uninstall.sh wiring. No device needed.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $1" >&2; exit 1; }

# --- LCD (default off) ---
grep -q 'src/lcd/mudi.py' install.sh            || fail "install.sh does not deploy mudi.py"
grep -q 'src/lcd/mudi-watch.py' install.sh      || fail "install.sh does not deploy mudi-watch.py"
grep -q 'src/lcd/mudi.init' install.sh          || fail "install.sh does not deploy mudi.init"
grep -q 'src/lcd/mudi-watch.init' install.sh    || fail "install.sh does not deploy mudi-watch.init"
grep -q 'src/lcd/mudi.config' install.sh        || fail "install.sh does not seed mudi.config"
# default OFF: installer must NOT enable/start the mudi service
grep -q '/etc/init.d/mudi enable' install.sh    && fail "install.sh must NOT enable mudi (default off)"
grep -q '/etc/init.d/mudi start'  install.sh    && fail "install.sh must NOT start mudi (default off)"
for p in /usr/bin/mudi.py /usr/bin/mudi-watch.py /etc/init.d/mudi /etc/init.d/mudi-watch; do
  grep -q "$p" install.sh || fail "install.sh missing sysupgrade entry: $p"
done
grep -q '/etc/init.d/gl_screen start' uninstall.sh || fail "uninstall.sh must restore gl_screen"
grep -q '/usr/bin/mudi.py' uninstall.sh            || fail "uninstall.sh must remove mudi.py"
grep -qE 'rm.*etc/config/mudi' uninstall.sh        && fail "uninstall.sh must NOT delete user config /etc/config/mudi"

# --- selfupdate + version (previous leaks) ---
grep -q 'src/sbin/mudimodem-selfupdate' install.sh || fail "install.sh must install selfupdate"
grep -q '/usr/sbin/mudimodem-selfupdate' uninstall.sh || fail "uninstall.sh must remove selfupdate"
grep -q '/etc/mudimodem/version.json' install.sh      || fail "install.sh must place version.json"
grep -q '/etc/mudimodem/version.json' uninstall.sh    || fail "uninstall.sh must list version.json (sysupgrade de-register)"

# --- speedtest (parity with deploy.sh) ---
grep -q 'src/views/mudimodem-speedtest.js' install.sh || fail "install.sh must install speedtest chunk"
grep -q 'src/menu/mudimodem-speedtest.json' install.sh || fail "install.sh must install speedtest menu"
grep -q 'tools/mudimodem-speedtest.py' install.sh || fail "install.sh must install speedtest runner"
grep -q 'src/sbin/mudimodem-speedtestd' install.sh || fail "install.sh must install speedtestd"
grep -q '/www/views/gl-sdk4-ui-mudimodem-speedtest.common.js.gz' uninstall.sh || fail "uninstall must remove speedtest chunk"
grep -q '/usr/sbin/mudimodem-speedtestd' uninstall.sh || fail "uninstall must remove speedtestd"
grep -q 'mudimodem-speedtestd stop' uninstall.sh || fail "uninstall must stop speedtestd before remove"

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

# No accidental enable of LCD on install
grep -E '/etc/init\.d/mudi(-watch)? (enable|start)' install.sh \
  && fail "install must not enable/start mudi services" || true

echo "install wiring OK"

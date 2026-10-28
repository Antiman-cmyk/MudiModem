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

# --- firmware gate: the SAME numeric compare in install/deploy/verify, and it
# fails closed on a non-numeric version (dash's `[` errors -> would pass) ---
gate() { grep -E '^(GLMAJ=|case "\$GLMAJ\$GLMIN"|if \[ -z "\$\{GLVER:-\}" \])' "$1" | sed 's/; then.*/; then/'; }
[ "$(gate install.sh | wc -l)" -eq 3 ] || fail "install.sh firmware gate: expected the GLMAJ / case / if lines"
[ "$(gate install.sh)" = "$(gate tools/deploy.sh)" ] || fail "install.sh and deploy.sh firmware gates differ"
[ "$(gate install.sh)" = "$(gate tools/verify.sh)" ] || fail "install.sh and verify.sh firmware gates differ"
gate_src=$(gate install.sh)
for v in 4.10.0:ok 4.10:ok 4.11.2:ok 5.0:ok 4.8.5:refuse 4.9.0:refuse 4.8-rc1:refuse 4.x:refuse 3.215:refuse :refuse; do
  got=$( (GLVER=${v%:*}; eval "$gate_src echo refuse; else echo ok; fi") 2>/dev/null )
  [ "$got" = "${v##*:}" ] || fail "firmware gate: '${v%:*}' -> '$got', want ${v##*:}"
done

# --- order: python before any python service starts; version.json only after
# every file is installed (a half-done install must not claim the new version) ---
first() { grep -nE "$2" "$1" | head -n1 | cut -d: -f1; }
last()  { grep -nE "$2" "$1" | tail -n1 | cut -d: -f1; }
py=$(first install.sh 'opkg install python3-light')
for svc in mudimodem-speedtestd mudimodem-collectd; do
  [ "$py" -lt "$(first install.sh "init.d/$svc restart")" ] || fail "install.sh restarts $svc before installing python3-light"
done
[ "$(first tools/deploy.sh 'opkg install python3-light')" -lt "$(first tools/deploy.sh 'mudimodem-speedtestd restart')" ] \
  || fail "deploy.sh restarts a python service before installing python3-light"
[ "$(first install.sh '> /etc/mudimodem/version.json')" -gt "$(last install.sh '^[[:space:]]*(gz_install|cp_install)[[:space:]]')" ] \
  || fail "install.sh writes version.json before the last file is installed"
[ "$(first tools/deploy.sh 'cat > /etc/mudimodem/version.json')" -gt "$(grep -n 'cat > /' tools/deploy.sh | grep -v version.json | tail -n1 | cut -d: -f1)" ] \
  || fail "deploy.sh writes version.json before the last file is pushed"

# --- battery limit: stopped for the binary swap, survivors killed, policy re-applied ---
for f in install.sh tools/deploy.sh; do
  off=$(first "$f" 'glbattlimit off'); kill=$(first "$f" 'glbattlimi\[t\] _watch')
  swap=$(first "$f" 'cat > /usr/bin/glbattlimit|src/sbin/glbattlimit[[:space:]]+/usr/bin/glbattlimit')
  re=$(first "$f" 'init.d/glbattlimit start')
  [ -n "$off" ] && [ -n "$kill" ] && [ -n "$swap" ] && [ -n "$re" ] || fail "$f: battlimit off / survivor kill / swap / re-apply missing"
  [ "$off" -lt "$swap" ] && [ "$kill" -lt "$swap" ] && [ "$swap" -lt "$re" ] || fail "$f: battlimit stop -> swap -> re-apply out of order"
done
grep -q 'mudimodem-detach' src/sbin/glbattlimit || fail "glbattlimit must launch its watcher through mudimodem-detach (nginx fds)"

# --- AT library: the bundled snapshot never replaces a readable cache ---
grep -qE '^gz_install src/at-library' install.sh && fail "install.sh installs the AT library snapshot unconditionally (clobbers a refreshed cache)"
eval "$(grep '^lib_ok()' install.sh)"
LT=$(mktemp -d)
gzip -c src/at-library.snapshot.json > "$LT/good.gz"
head -c 200 "$LT/good.gz" > "$LT/trunc.gz"
echo '{}' | gzip -c > "$LT/empty.gz"
cp src/at-library.snapshot.json "$LT/plain.json"
lib_ok "$LT/good.gz"  || { rm -rf "$LT"; fail "lib_ok rejects a good library cache"; }
for bad in trunc.gz empty.gz plain.json missing.gz; do
  lib_ok "$LT/$bad" && { rm -rf "$LT"; fail "lib_ok accepts a bad cache ($bad)"; }
done
rm -rf "$LT"

# --- uninstall: a pending change is reverted BEFORE anything is removed, and a
# failed revert aborts (the watchdog stays armed) ---
rn=$(first uninstall.sh 'mudimodem-revert restore-now')
[ -n "$rn" ] || fail "uninstall.sh must revert a pending change (restore-now)"
for later in 'glbattlimit off' 'rm -rf /usr/lib/mudimodem' 'removing files' 'mudimodem-rever\[t\] watch'; do
  [ "$rn" -lt "$(first uninstall.sh "$later")" ] || fail "uninstall.sh: restore-now must come before '$later'"
done
UT=$(mktemp -d)
blk=$(sed -n '/^if \[ -f \/etc\/mudimodem\/pending \]/,/^done$/p' uninstall.sh \
      | sed "s|/etc/mudimodem/pending|$UT/pending|g; s|/usr/sbin/mudimodem-revert|$UT/revert|g; s|pgrep|false|g")
touch "$UT/pending"
printf '#!/bin/sh\necho "{\\"ok\\":false}"; exit 1\n' > "$UT/revert"; chmod +x "$UT/revert"
( set -eu; eval "$blk"; echo CONTINUED ) > "$UT/out" 2>&1 && { rm -rf "$UT"; fail "uninstall.sh went on after a failed restore-now"; }
grep -q ABORTING "$UT/out" || { rm -rf "$UT"; fail "uninstall.sh: no abort message on a failed revert"; }
printf '#!/bin/sh\necho "{\\"ok\\":true}"; exit 0\n' > "$UT/revert"
( set -eu; eval "$blk"; echo CONTINUED ) > "$UT/out" 2>&1 && grep -q CONTINUED "$UT/out" \
  || { cat "$UT/out" >&2; rm -rf "$UT"; fail "uninstall.sh stopped although restore-now succeeded"; }
rm -rf "$UT"

# --- boot-check retries in the background, never blocking boot ---
grep -qE 'mudimodem-revert boot-check.*&[[:space:]]*$' src/etc/init.d/mudimodem-revert \
  || fail "init.d/mudimodem-revert must run boot-check in the background"

echo "install wiring OK"

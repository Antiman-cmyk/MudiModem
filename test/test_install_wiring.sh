#!/bin/sh
# Static assertions on install.sh / uninstall.sh wiring. No device needed.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $1" >&2; exit 1; }

# --- no LCD renderer in 2.x; python3 for the daemons is ensured explicitly ---
grep -qE 'src/lcd|cp_install .*(mudi\.py|mudi-watch|init\.d/mudi[^m]|config/mudi)' install.sh && fail "install.sh must not ship the LCD renderer (removed in 2.0)"
grep -q 'rm -f /usr/bin/mudi.py' install.sh      || fail "install.sh must purge a 1.x LCD renderer left on the box"
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

# The firmware gate must be the numeric compare, never a glob (4.[2-9]* matches 4.8.5).
grep -hv '^[[:space:]]*#' tools/deploy.sh tools/verify.sh | grep -q '4\.\[2-9\]' && fail "deploy/verify firmware gate must not be a glob" || true
grep -q 'GLMIN' tools/deploy.sh && grep -q 'GLMIN' tools/verify.sh || fail "deploy/verify must use install.sh's numeric firmware compare"

# --- speedtest (parity with deploy.sh) ---
grep -q 'src/views/mudimodem-speedtest.js' install.sh || fail "install.sh must install speedtest chunk"
grep -q 'src/menu/mudimodem-speedtest.json' install.sh || fail "install.sh must install speedtest menu"
grep -q 'tools/mudimodem-speedtest.py' install.sh || fail "install.sh must install speedtest runner"
grep -q 'src/sbin/mudimodem-speedtestd' install.sh || fail "install.sh must install speedtestd"
grep -q '/usr/sbin/mudimodem-speedtestd' uninstall.sh || fail "uninstall must remove speedtestd"
grep -q 'mudimodem-speedtestd stop' uninstall.sh || fail "uninstall must stop speedtestd before remove"

# --- battery tab (lazy chunk; parity with deploy.sh — was missing, broke curl install) ---
grep -q 'src/views/mudimodem-battery.js' install.sh || fail "install.sh must install battery chunk"

# --- install destinations must exist as sources ---
# shellcheck disable=SC2016
srcs=$(grep -E '^\s*(gz_install|cp_install)\s+' install.sh | awk '{print $2}')
for s in $srcs; do
  [ -f "$s" ] || fail "install source missing: $s"
done

# Every path install.sh writes (2nd arg of gz_install/cp_install).
dests=$(grep -E '^\s*(gz_install|cp_install)\s+' install.sh | awk '{print $3}')

# --- install/uninstall parity: uninstall removes every installed file ---
u_files=$(awk '/^FILES="/,/^"/' uninstall.sh | grep '^/')
u_dirs=$(sed -n 's/^DIRS="\(.*\)"/\1/p' uninstall.sh)
for d in $dests; do
  echo "$u_files" | grep -qxF "$d" && continue
  for x in $u_dirs; do case "$d" in "$x"/*) continue 2 ;; esac; done
  fail "uninstall.sh leaves $d behind"
done

# --- firmware upgrade: abfota_update keeps exactly what keep.d lists ---
# (never /etc/sysupgrade.conf; only /etc /usr /lib /bin /sbin /data /var
# entries; one literal path per line — read in the 4.10 image, CLAUDE.md §9).
KEEP=src/upgrade/keep.d/mudimodem
keep=$(grep '^/' "$KEEP")
kept() {  # exact entry, or under a listed directory (trailing /)
  for k in $keep; do
    case "$k" in */) case "$1" in "$k"*) return 0 ;; esac ;; *) [ "$1" = "$k" ] && return 0 ;; esac
  done
  return 1
}
for d in $dests; do kept "$d" || fail "keep.d does not carry $d over a firmware upgrade"; done
bad=$(grep -vE '^(#|$|/(etc|usr|lib|bin|sbin|data|var)/[^][*? ]*$)' "$KEEP" || true)
[ -z "$bad" ] || fail "keep.d lines abfota_update would drop or misparse: $bad"
kept /lib/upgrade/keep.d/mudimodem || fail "keep.d must list itself (the next upgrade reads it)"
grep -E '^\s*(gz_install|cp_install)\s+.*\s/www/' install.sh && fail "install.sh must not write /www (an upgrade drops it)"
grep -q "cat > /www/" tools/deploy.sh && fail "deploy.sh must not write /www (an upgrade drops it)"
grep -q 'sysupgrade.conf' tools/deploy.sh && fail "deploy.sh must register keep.d, not sysupgrade.conf (never read on the E5800)"
# procd enable links: an upgrade keeps a service only if its S/K link is listed.
for f in src/etc/init.d/*; do
  n=$(basename "$f"); st=$(sed -n 's/^START=//p' "$f"); sp=$(sed -n 's/^STOP=//p' "$f")
  [ -z "$st" ] || kept "/etc/rc.d/S$st$n" || fail "keep.d is missing the enable link /etc/rc.d/S$st$n"
  [ -z "$sp" ] || kept "/etc/rc.d/K$sp$n" || fail "keep.d is missing the enable link /etc/rc.d/K$sp$n"
done
grep -q 'src/upgrade/keep.d/mudimodem' tools/deploy.sh || fail "deploy.sh must push keep.d"

# --- web payload: /usr/share/mudimodem/www, served by our gl-conf.d alias ---
grep -q 'location ^~ /views/gl-sdk4-ui-mudimodem' src/nginx/mudimodem.conf \
  && grep -q 'location ^~ /mudimodem/' src/nginx/mudimodem.conf \
  && [ "$(grep -c 'root /usr/share/mudimodem/www;' src/nginx/mudimodem.conf)" = 2 ] \
  || fail "nginx alias must map /views/gl-sdk4-ui-mudimodem* and /mudimodem/ onto /usr/share/mudimodem/www"
echo "$dests" | grep -qxF /etc/nginx/gl-conf.d/mudimodem.conf || fail "install.sh must install the nginx alias"
grep -q 'src/nginx/mudimodem.conf' tools/deploy.sh || fail "deploy.sh must push the nginx alias"
grep -q 'DEFAULT_CACHE = "/usr/share/mudimodem/www/mudimodem/at-library.json.gz"' tools/mudimodem-lib \
  || fail "library refresh must write the copy nginx serves (/usr/share/mudimodem/www/mudimodem/)"

# --- python3 runtime (opkg; wiped by an upgrade): one recipe, healed at boot ---
py_svcs=$(grep -l '/usr/bin/python3' src/etc/init.d/* | xargs -n1 basename | sort | tr '\n' ' ')
deps_svcs=$(sed -n 's/^SERVICES="\(.*\)"/\1/p' src/lib/mudimodem-deps | tr ' ' '\n' | sort | tr '\n' ' ')
[ "$py_svcs" = "$deps_svcs" ] || fail "mudimodem-deps SERVICES ($deps_svcs) must be the python services ($py_svcs)"
for n in $py_svcs; do
  grep -q '"$DEPS" check' "src/etc/init.d/$n" && grep -q '"$DEPS" heal' "src/etc/init.d/$n" \
    || fail "$n must defer to mudimodem-deps heal when python3 is missing"
done
grep -hv '^[[:space:]]*#' install.sh tools/deploy.sh | grep -q 'opkg' \
  && fail "install/deploy must go through mudimodem-deps, not opkg directly"
for f in install.sh tools/deploy.sh; do
  d=$(grep -n 'mudimodem-deps install' "$f" | head -n1 | cut -d: -f1)
  r=$(grep -nE 'init\.d/mudimodem-[a-z]+ (enable|restart)|init\.d/mudimodem-[a-z]+ enable;' "$f" | head -n1 | cut -d: -f1)
  [ -n "$d" ] && [ -n "$r" ] && [ "$d" -lt "$r" ] \
    || fail "$f must run mudimodem-deps install before starting any service (a heal would race it)"
done

echo "install wiring OK"

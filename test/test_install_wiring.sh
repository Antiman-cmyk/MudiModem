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
grep -q '>> "$f"' install.sh tools/deploy.sh && fail "register files in keep.d, not sysupgrade.conf (never read on the E5800)"
# Updating from 2.0.0 (and uninstalling it): its /www payload and its
# sysupgrade.conf entries (every one names mudimodem or glbattlimit) must go.
for f in install.sh uninstall.sh tools/deploy.sh; do
  grep -q 'rm -f /www/views/gl-sdk4-ui-mudimodem\*.common.js.gz' "$f" && grep -q 'rm -rf /www/mudimodem' "$f" \
    && grep -q 'grep -v -e mudimodem -e glbattlimit "$f"' "$f" \
    || fail "$f must drop a 2.0.0 install's /www payload and sysupgrade.conf entries"
done
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
py=$(first install.sh 'mudimodem-deps install')
[ -n "$py" ] || fail "install.sh never runs mudimodem-deps install"
for svc in mudimodem-speedtestd mudimodem-collectd; do
  [ "${py:-99999}" -lt "$(first install.sh "init.d/$svc restart")" ] || fail "install.sh restarts $svc before installing python3-light"
done
[ "$(first tools/deploy.sh 'mudimodem-deps install')" -lt "$(first tools/deploy.sh 'mudimodem-speedtestd restart')" ] \
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
for later in 'glbattlimit off' 'for p in \$FILES \$DIRS' 'removing files' 'mudimodem-rever\[t\] watch'; do
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

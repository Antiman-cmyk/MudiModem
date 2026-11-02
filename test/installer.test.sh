#!/bin/sh
# End-to-end installer test in a fake root (MUDIMODEM_ROOT) — no router needed.
#
#   sh test/installer.test.sh                 host dash
#   busybox sh test/installer.test.sh         host busybox ash
#   tools/mudi-emu/bin/mudi-emu run sh test/installer.test.sh   the ROUTER's busybox ash + applets (qemu)
#
# Runs install.sh / uninstall.sh exactly as a user would (MUDIMODEM_BASE = this checkout), then
# checks the resulting tree, the generated firmware-upgrade keep list, the recorded service
# actions and their order, settings/cache preservation, legacy cleanup, refusals, and that an
# uninstall removes ours and nothing of GL's.
set -eu
cd "$(dirname "$0")/.."
REPO=$(pwd)
INST=src/installer/mudimodem-install
T=$(mktemp -d /tmp/mm-installer-test.XXXXXX)
trap 'rm -rf "$T"' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok - $*"; }

VER=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' version.json | head -n1)
recs() { sed -e 's/#.*$//' -e '/^[[:space:]]*$/d' manifest.txt; }
mkroot() {  # $1 dir, $2 glversion, $3 model
  mkdir -p "$1/proc/device-tree" "$1/proc/gl-hw-info" "$1/etc"
  printf '%s\0' "${3:-GL.iNet E5800, Qualcomm Technologies, Inc. SDXPINN IDP MBB}" > "$1/proc/device-tree/model"
  case "${3:-E5800}" in *E5800*) echo e5800 ;; *) echo axt1800 ;; esac > "$1/proc/gl-hw-info/model"
  echo "${2-4.10.0}" > "$1/etc/glversion"
}
line_of() { grep -nxF "$2" "$1/.mm-actions" | head -n1 | cut -d: -f1; }   # first line number
must_before() {  # $1 root, $2 earlier action, $3 later action
  a=$(line_of "$1" "$2"); b=$(line_of "$1" "$3")
  [ -n "$a" ] || fail "action not recorded: $2"
  [ -n "$b" ] || fail "action not recorded: $3"
  [ "$a" -lt "$b" ] || fail "'$2' (line $a) must come before '$3' (line $b)"
}
install_into() {  # $1 root; extra env passed by caller
  MUDIMODEM_ROOT="$1" MUDIMODEM_BASE="$REPO" sh install.sh > "$1.out" 2>&1 || { cat "$1.out" >&2; return 1; }
}
uninstall_from() {
  MUDIMODEM_ROOT="$1" MUDIMODEM_BASE="$REPO" sh uninstall.sh > "$1.un" 2>&1
}
snapshot() {  # stable listing of a tree: mode + checksum + path (no actions log)
  ( cd "$1" && find . -type f ! -name .mm-actions | sort | while read -r f; do
      case "$f" in *.gz) sum=$(gzip -dc "$f" | cksum) ;; *) sum=$(cksum < "$f") ;; esac   # gzip headers carry a timestamp
      echo "$(stat -c %a "$f") ${sum%% *} $f"; done )
}

# ---- 1. fresh install ---------------------------------------------------------------------------
R="$T/r1"; mkroot "$R"
install_into "$R" || fail "fresh install failed"
recs | while read -r t a b c; do
  case "$t" in file|gz|cache|default) ;; *) continue ;; esac
  [ -f "$R$b" ] || fail "not installed: $b"
  m=$(stat -c %a "$R$b"); [ "$m" = "${c#0}" ] || fail "$b has mode $m, want ${c#0}"
  case "$t" in
    gz|cache) gzip -dc "$R$b" | cmp -s - "$a" || fail "$b is not gzip($a)" ;;
    *)        cmp -s "$R$b" "$a" || fail "$b differs from $a" ;;
  esac
done
ok "every manifest file placed with its mode and content"

KD="$R/lib/upgrade/keep.d/mudimodem"
[ -f "$KD" ] || fail "keep.d list not written"
sh "$INST" keepd --from . | cmp -s - "$KD" || fail "installed keep.d differs from 'keepd --from .'"
bad=$(grep -vE '^(#|$|/(etc|usr|lib|bin|sbin|data|var)/[^][*? ]*$)' "$KD" || true)
[ -z "$bad" ] || fail "keep.d lines abfota_update would drop or misparse: $bad"
grep -qxF /lib/upgrade/keep.d/mudimodem "$KD" || fail "keep.d must list itself"
kept() { while read -r k; do case "$k" in "#"*|"") continue ;; */) case "$1" in "$k"*) return 0 ;; esac ;; *) [ "$1" = "$k" ] && return 0 ;; esac; done < "$KD"; return 1; }
( cd "$R" && find . -type f ! -name .mm-actions ! -path ./proc/\* ! -path ./etc/glversion | sed 's#^\.##' ) | while read -r f; do
  kept "$f" || fail "keep.d does not carry $f over a firmware upgrade"
done
for f in src/etc/init.d/*; do
  n=$(basename "$f"); st=$(sed -n 's/^START=//p' "$f"); sp=$(sed -n 's/^STOP=//p' "$f")
  [ -z "$st" ] || grep -qxF "/etc/rc.d/S$st$n" "$KD" || fail "keep.d is missing /etc/rc.d/S$st$n"
  [ -z "$sp" ] || grep -qxF "/etc/rc.d/K$sp$n" "$KD" || fail "keep.d is missing /etc/rc.d/K$sp$n"
done
grep -q '^/www' "$KD" && fail "keep.d lists /www (an upgrade never restores it)"
ok "keep.d: generated, abfota-parsable, covers every placed file and every enable link"

[ "$(cat "$R/etc/mudimodem/version.json")" = "{\"version\":\"$VER\",\"base\":\"$REPO\"}" ] || fail "version.json: $(cat "$R/etc/mudimodem/version.json")"
[ "$(tail -n1 "$R/.mm-actions")" = "place /etc/mudimodem/version.json" ] || fail "version.json must be the very last write"
must_before "$R" "place /usr/lib/oui-httpd/rpc/mudimodem" "svc nginx restart"
must_before "$R" "place /usr/share/gl-validator.d/mudimodem.lua" "place /usr/lib/oui-httpd/rpc/mudimodem"
must_before "$R" "place /usr/sbin/mudimodem-revert" "place /usr/lib/oui-httpd/rpc/mudimodem"
must_before "$R" "sys kill glbattlimit watchers" "svc nginx restart"
must_before "$R" "place /usr/bin/glbattlimit" "svc glbattlimit start"
must_before "$R" "svc mudimodem-revert enable" "svc mudimodem-collectd enable"
grep -qxF "sys glbattlimit off" "$R/.mm-actions" && fail "fresh install ran 'glbattlimit off' with no glbattlimit present"
ok "version.json last; validator + watchdog before the plugin; nginx after"

# ---- 2. update in place: settings, cache, ordering of the battery-limit swap --------------------
echo '{"enabled":true,"limit_gui":70}' > "$R/etc/mudimodem/battlimit.json"
L="$R/usr/share/mudimodem/www/mudimodem/at-library.json.gz"
printf '{"version":1,"revision":"refreshed-xyz","entries":[]}' | gzip -c > "$L"
before=$(snapshot "$R")
install_into "$R" || fail "update install failed"
[ "$(cat "$R/etc/mudimodem/battlimit.json")" = '{"enabled":true,"limit_gui":70}' ] || fail "update clobbered battlimit.json"
gzip -dc "$L" | grep -q refreshed-xyz || fail "update replaced a readable AT-library cache"
must_before "$R" "sys glbattlimit off" "place /usr/bin/glbattlimit"
must_before "$R" "sys glbattlimit off" "svc nginx restart"
after=$(snapshot "$R")
[ "$after" = "$before" ] || { echo "$before" > "$T/b"; echo "$after" > "$T/a"; diff "$T/b" "$T/a" >&2 || true; fail "a second install changed the tree"; }
ok "update keeps settings + refreshed library, stops the limiter before the swap, is idempotent"

printf "not a gzip" > "$L"
install_into "$R" || fail "install over a broken cache failed"
gzip -dc "$L" | cmp -s - src/at-library.snapshot.json || fail "a broken library cache was not replaced by the snapshot"
ok "a broken library cache is replaced"

# ---- 3. leftovers from 1.x / 2.0.0; GL's own files untouched ------------------------------------
R="$T/r3"; mkroot "$R"
mkdir -p "$R/www/views" "$R/www/mudimodem" "$R/etc/init.d" "$R/usr/bin" "$R/etc/config"
echo x > "$R/www/views/gl-sdk4-ui-mudimodem.common.js.gz"
echo x > "$R/www/views/gl-sdk4-ui-mudimodem-tracking.common.js.gz"
echo GL > "$R/www/views/gl-sdk4-ui-internet.common.js.gz"
printf '{"version":1,"revision":"from-200","entries":[]}' | gzip -c > "$R/www/mudimodem/at-library.json.gz"
printf '#!/bin/sh\n' > "$R/etc/init.d/mudi"; chmod +x "$R/etc/init.d/mudi"
echo x > "$R/usr/bin/mudi.py"; echo x > "$R/etc/config/mudi"
printf '/etc/config/wireless\n/etc/mudimodem/\n/usr/bin/glbattlimit\n/usr/bin/mudi.py\n/etc/init.d/mudi\n' > "$R/etc/sysupgrade.conf"
install_into "$R" || fail "install over 1.x/2.0.0 leftovers failed"
for p in /www/views/gl-sdk4-ui-mudimodem.common.js.gz /www/views/gl-sdk4-ui-mudimodem-tracking.common.js.gz \
         /www/mudimodem /etc/init.d/mudi /usr/bin/mudi.py /etc/config/mudi; do
  [ -e "$R$p" ] && fail "leftover not removed: $p"
done
[ -f "$R/www/views/gl-sdk4-ui-internet.common.js.gz" ] || fail "install removed GL's own chunk"
[ "$(cat "$R/etc/sysupgrade.conf")" = /etc/config/wireless ] || fail "sysupgrade.conf after cleanup: $(tr '\n' ' ' < "$R/etc/sysupgrade.conf")"
gzip -dc "$R/usr/share/mudimodem/www/mudimodem/at-library.json.gz" | grep -q from-200 || fail "2.0.0's refreshed library cache was not carried over"
for a in "svc mudi stop" "svc mudi disable" "svc gl_screen start"; do grep -qxF "$a" "$R/.mm-actions" || fail "not recorded: $a"; done
ok "1.x LCD + 2.0.0 /www + sysupgrade.conf leftovers removed; GL's files kept; old cache migrated"

# ---- 3b. what an older install shipped and this one does not: retired before the new files land -----
# A 2.x box (python3 era, no installed manifest): the scheduler service + the python files.
R="$T/r3b"; mkroot "$R"
mkdir -p "$R/etc/init.d" "$R/usr/sbin" "$R/usr/lib/mudimodem" "$R/etc/mudimodem"
printf '#!/bin/sh\n' > "$R/etc/init.d/mudimodem-speedtestd"; chmod +x "$R/etc/init.d/mudimodem-speedtestd"
for f in /usr/sbin/mudimodem-speedtestd /usr/sbin/mudimodem-collectd /usr/lib/mudimodem/mudimodem-speedtest.py \
         /usr/lib/mudimodem/mudimodem-at.py /usr/lib/mudimodem/mudimodem-lib /usr/lib/mudimodem/cellular_compat.py \
         /usr/lib/mudimodem/mudimodem-deps /etc/mudimodem/collector; do echo old > "$R$f"; done
echo '{"enabled":true,"limit":70}' > "$R/etc/mudimodem/battlimit.json"
install_into "$R" || fail "install over 2.x python leftovers failed"
for f in /etc/init.d/mudimodem-speedtestd /usr/sbin/mudimodem-speedtestd /usr/sbin/mudimodem-collectd \
         /usr/lib/mudimodem/mudimodem-speedtest.py /usr/lib/mudimodem/mudimodem-at.py /usr/lib/mudimodem/mudimodem-lib \
         /usr/lib/mudimodem/cellular_compat.py /usr/lib/mudimodem/mudimodem-deps /etc/mudimodem/collector; do
  [ -e "$R$f" ] && fail "2.x leftover not retired: $f"
done
must_before "$R" "svc mudimodem-speedtestd stop" "svc mudimodem-speedtestd disable"
must_before "$R" "svc mudimodem-speedtestd disable" "remove /etc/init.d/mudimodem-speedtestd"
must_before "$R" "remove /usr/lib/mudimodem/mudimodem-deps" "place /usr/sbin/mudimodemd"
[ "$(cat "$R/etc/mudimodem/battlimit.json")" = '{"enabled":true,"limit":70}' ] || fail "the user's battlimit settings were touched"
[ -x "$R/etc/init.d/mudimodem-collectd" ] || fail "the kept service's init script must stay"
# A newer box whose installed manifest names a file + a service this payload dropped.
R="$T/r3c"; mkroot "$R"; install_into "$R" || fail "base install for 3c failed"
printf '#!/bin/sh\n' > "$R/etc/init.d/old-svc"; chmod +x "$R/etc/init.d/old-svc"; echo old > "$R/usr/lib/mudimodem/old-thing"
{ cat manifest.txt; printf 'file src/x /usr/lib/mudimodem/old-thing 0644\nfile src/y /etc/init.d/old-svc 0755\nservice old-svc enable\n'; } \
  > "$R/usr/lib/mudimodem/manifest.txt"
install_into "$R" || fail "update over a manifest with dropped entries failed"
[ -e "$R/usr/lib/mudimodem/old-thing" ] && fail "a file the new manifest dropped was kept"
[ -e "$R/etc/init.d/old-svc" ] && fail "a dropped service's init script was kept"
must_before "$R" "svc old-svc stop" "remove /etc/init.d/old-svc"
grep -qxF "remove /usr/sbin/mudimodemd" "$R/.mm-actions" && fail "a file still shipped was removed"
ok "retired: 2.x python leftovers and whatever an older manifest shipped that this one does not; settings kept"

# ---- 4. refusals touch nothing ------------------------------------------------------------------
for v in 4.10.0:ok 4.10:ok 4.11.2:ok 5.0:ok 4.8.5:refuse 4.9.0:refuse 4.8-rc1:refuse 4.x:refuse 3.215:refuse :refuse; do
  R="$T/gate-$$"; rm -rf "$R"; mkroot "$R" "${v%:*}"
  if MUDIMODEM_ROOT="$R" sh "$INST" preflight >/dev/null 2>&1; then got=ok; else got=refuse; fi
  [ "$got" = "${v##*:}" ] || fail "firmware gate: '${v%:*}' -> $got, want ${v##*:}"
done
R="$T/r4"; mkroot "$R" 4.8.5
install_into "$R" 2>/dev/null && fail "install went ahead on 4.8.5"
[ -e "$R/usr" ] && fail "a refused install wrote files"
R="$T/r4b"; mkroot "$R" 4.10.0 "GL.iNet AXT1800"
install_into "$R" 2>/dev/null && fail "install went ahead on a non-E5800"
[ -e "$R/usr" ] && fail "a refused (wrong model) install wrote files"
P="$T/payload"; mkdir -p "$P"; cp manifest.txt version.json "$P/"
sh "$INST" sources --from . | while read -r f; do mkdir -p "$P/$(dirname "$f")"; cp "$f" "$P/$f"; done
rm "$P/src/rpc/mudimodem"
R="$T/r4c"; mkroot "$R"
MUDIMODEM_ROOT="$R" sh "$P/$INST" install --from "$P" >/dev/null 2>&1 && fail "install went ahead with an incomplete payload"
[ -e "$R/usr" ] && fail "an incomplete payload wrote files"
ok "firmware gate table; wrong firmware, wrong model and an incomplete payload write nothing"

# ---- 5. uninstall -------------------------------------------------------------------------------
R="$T/r5"; mkroot "$R"
install_into "$R" || fail "install for uninstall failed"
mkdir -p "$R/usr/share/oui/menu.d" "$R/usr/lib/oui-httpd/rpc" "$R/www/views"
echo GL > "$R/usr/share/oui/menu.d/internet.json"; echo GL > "$R/usr/lib/oui-httpd/rpc/modem.so"
echo GL > "$R/www/views/gl-sdk4-ui-internet.common.js.gz"
uninstall_from "$R" || { cat "$R.un" >&2; fail "uninstall failed"; }
recs | while read -r t a b c; do
  case "$t" in file|gz|cache|default) [ -e "$R$b" ] && fail "uninstall left $b" ;;
               own|keepd) [ -e "$R$a" ] && fail "uninstall left $a" ;; esac
  true
done
for p in /usr/share/oui/menu.d/internet.json /usr/lib/oui-httpd/rpc/modem.so /www/views/gl-sdk4-ui-internet.common.js.gz; do
  [ -f "$R$p" ] || fail "uninstall removed GL's $p"
done
must_before "$R" "svc glbattlimit stop" "svc mudimodem-collectd stop"
must_before "$R" "svc mudimodem-collectd stop" "svc mudimodem-revert stop"
must_before "$R" "sys glbattlimit off" "remove /usr/bin/glbattlimit"
[ "$(tail -n1 "$R/.mm-actions")" = "svc nginx restart" ] || fail "uninstall must end with an nginx restart"
ok "uninstall removes every manifest path + our dirs, services stopped in reverse, GL's files kept"

# A box from before the installer existed (no installed copy): the manifest is fetched instead.
R="$T/r5b"; mkroot "$R"
install_into "$R" || fail "install for legacy uninstall failed"
rm -f "$R/usr/lib/mudimodem/mudimodem-install" "$R/usr/lib/mudimodem/manifest.txt"
uninstall_from "$R" || { cat "$R.un" >&2; fail "legacy uninstall failed"; }
[ -e "$R/usr/lib/oui-httpd/rpc/mudimodem" ] && fail "legacy uninstall left the plugin"
ok "uninstall of a pre-installer box fetches the manifest"

# A pending confirm-or-revert change is reverted first; a failed revert aborts with nothing removed.
R="$T/r6"; mkroot "$R"
install_into "$R" || fail "install for pending test failed"
touch "$R/etc/mudimodem/pending"
printf '#!/bin/sh\necho "{\\"ok\\":false}"; exit 1\n' > "$R/usr/sbin/mudimodem-revert"
uninstall_from "$R" && fail "uninstall went on after a failed restore-now"
grep -q ABORTING "$R.un" || fail "no ABORTING message on a failed revert"
[ -f "$R/usr/lib/oui-httpd/rpc/mudimodem" ] || fail "a failed revert must leave the install in place"
printf '#!/bin/sh\n[ "$1" = restore-now ] && echo "{\\"ok\\":true}"\n' > "$R/usr/sbin/mudimodem-revert"
uninstall_from "$R" || { cat "$R.un" >&2; fail "uninstall stopped although restore-now succeeded"; }
[ -e "$R/usr/lib/oui-httpd/rpc/mudimodem" ] && fail "uninstall after a good revert left files"
ok "pending change: reverted first, a failed revert aborts and removes nothing"

echo "installer OK ($(sh "$INST" sources --from . | wc -l | tr -d ' ') sources, shell: $(readlink /proc/$$/exe 2>/dev/null || echo sh))"

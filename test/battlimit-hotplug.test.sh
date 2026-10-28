#!/bin/sh
# Isolation test for config-aware glbattlimit hotplug/init glue.
# Uses a stub glbattlimit that records its argv; never touches real sysfs.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

STUB="$TMP/glbattlimit"
LOG="$TMP/calls.log"
CFG="$TMP/battlimit.json"
PIDF="$TMP/glbattlimit.pid"   # never the real /tmp one (a live watcher on the box)
HOTPLUG="$ROOT/src/hotplug/20-glbattlimit"
INIT="$ROOT/src/etc/init.d/glbattlimit"

cat > "$STUB" <<'EOF'
#!/bin/sh
echo "$*" >> "$CALL_LOG"
exit 0
EOF
chmod +x "$STUB"

# ---- helpers that inject CFG/BIN/CHG into the scripts under test ----
# The production scripts must honour:
#   MUDIMODEM_BATTLIMIT_FILE, MUDIMODEM_BATTLIMIT_BIN, MUDIMODEM_BATTLIMIT_CHG_ONLINE,
#   MUDIMODEM_BATTLIMIT_PIDF
# (env overrides for tests; production defaults to the real paths / sysfs read).

run_hotplug() {
  CALL_LOG="$LOG" \
  MUDIMODEM_BATTLIMIT_FILE="$CFG" \
  MUDIMODEM_BATTLIMIT_BIN="$STUB" \
  MUDIMODEM_BATTLIMIT_CHG_ONLINE="$1" \
  MUDIMODEM_BATTLIMIT_PIDF="$PIDF" \
  DRIVER=cw221X \
  sh "$HOTPLUG"
}
run_init() {
  CALL_LOG="$LOG" \
  MUDIMODEM_BATTLIMIT_FILE="$CFG" \
  MUDIMODEM_BATTLIMIT_BIN="$STUB" \
  MUDIMODEM_BATTLIMIT_CHG_ONLINE="$1" \
  MUDIMODEM_BATTLIMIT_PIDF="$PIDF" \
  sh -c '. "'"$INIT"'"; start'
}

# Case A: missing config → no-op (defaults disabled)
rm -f "$CFG" "$LOG"
run_hotplug 1
[ ! -f "$LOG" ] || { echo "FAIL A: expected no call"; cat "$LOG"; exit 1; }

# Case B: enabled false → no-op
echo '{"enabled":false,"limit_gui":80}' > "$CFG"
run_hotplug 1
[ ! -f "$LOG" ] || { echo "FAIL B: expected no call"; cat "$LOG"; exit 1; }

# Case C: enabled true, charger offline → no-op
echo '{"enabled":true,"limit_gui":80}' > "$CFG"
run_hotplug 0
[ ! -f "$LOG" ] || { echo "FAIL C: expected no call when offline"; cat "$LOG"; exit 1; }

# Case D: enabled true, charger online → on 80 gui
echo '{"enabled":true,"limit_gui":80}' > "$CFG"
rm -f "$LOG"
run_hotplug 1
grep -qx 'on 80 gui' "$LOG" || { echo "FAIL D: expected 'on 80 gui'"; cat "$LOG"; exit 1; }

# Case E: init start with enabled + online
echo '{"enabled":true,"limit_gui":75}' > "$CFG"
rm -f "$LOG" "$PIDF"
run_init 1
grep -qx 'on 75 gui' "$LOG" || { echo "FAIL E: init start"; cat "$LOG"; exit 1; }

# Case E2: init start (also what install/deploy run to re-apply) is a no-op when
# the policy is disabled or the charger is offline.
echo '{"enabled":false,"limit_gui":75}' > "$CFG"; rm -f "$LOG"
run_init 1
[ ! -f "$LOG" ] || { echo "FAIL E2: init start acted on a disabled policy"; cat "$LOG"; exit 1; }
echo '{"enabled":true,"limit_gui":75}' > "$CFG"
run_init 0
[ ! -f "$LOG" ] || { echo "FAIL E2: init start acted with the charger offline"; cat "$LOG"; exit 1; }

# Case F: a watcher is already running (the hotplug got there first at boot) ->
# init start and the hotplug leave it alone instead of restarting it.
echo $$ > "$PIDF"                        # this shell: certainly alive
run_init 1
run_hotplug 1
[ ! -f "$LOG" ] || { echo "FAIL F: restarted a running watcher"; cat "$LOG"; exit 1; }

# Case G: a stale pid file (watcher long gone) does not block the apply.
sh -c 'exit 0' & dead=$!; wait "$dead"
echo "$dead" > "$PIDF"
run_init 1
grep -qx 'on 75 gui' "$LOG" || { echo "FAIL G: stale pid file blocked the init apply"; cat "$LOG"; exit 1; }
rm -f "$PIDF"

echo "battlimit-hotplug OK"

# ---- the real glbattlimit watcher, against a fake sysfs (repo checkout only:
# verify.sh runs this file on the box without src/sbin) ----
GLB_SRC="$ROOT/src/sbin/glbattlimit"
[ -f "$GLB_SRC" ] || { echo "glbattlimit watcher tests SKIPPED (no src/sbin/glbattlimit)"; exit 0; }
FS="$TMP/root"
mkdir -p "$FS/tmp" "$FS/sys/class/power_supply/cw221X-bat" \
         "$FS/sys/class/power_supply/sgm41600-standalone/device/sgm41600" \
         "$FS/sys/class/power_supply/charger/device/sgm41542s" "$TMP/bin"
B="$FS/sys/class/power_supply"
echo 70      > "$B/cw221X-bat/capacity"
echo 4000000 > "$B/cw221X-bat/voltage_now"
echo 0       > "$B/cw221X-bat/current_now"
echo 1       > "$B/charger/online"
echo 2       > "$B/sgm41600-standalone/device/sgm41600/charge_en"
echo 4400000 > "$B/charger/device/sgm41542s/vreg"
VREG="$B/charger/device/sgm41542s/vreg"
WPIDF="$FS/tmp/glbattlimit.pid"; WLIMF="$FS/tmp/glbattlimit.limit"
GLB="$TMP/glbattlimit-real"; cp "$GLB_SRC" "$GLB"; chmod +x "$GLB"
# Under `busybox sh test/…` run glbattlimit itself (and its re-exec'd watcher)
# under busybox ash too — the router's /bin/sh — not the host's /bin/sh.
case "$(readlink "/proc/$$/exe" 2>/dev/null)" in
  *busybox*) mkdir -p "$TMP/bb"; ln -s "$(command -v busybox)" "$TMP/bb/sh"
             sed -i "1s|.*|#!$TMP/bb/sh|" "$GLB" ;;
esac
printf '#!/bin/sh\nexit 0\n' > "$TMP/bin/logger"; chmod +x "$TMP/bin/logger"   # keep syslog quiet
# The real fd-closing wrapper, run by busybox ash — the router's /bin/sh. (dash
# cannot run it: its close-every-fd loop also closes dash's own script fd 10,
# so it dies before the exec; busybox ash moves that fd out of the way.)
DETACH_REAL="$TMP/detach"
if command -v busybox >/dev/null 2>&1; then
  printf '#!/bin/sh\nexec busybox sh "%s" "$@"\n' "$ROOT/src/lib/mudimodem-detach" > "$DETACH_REAL"
else
  printf '#!/bin/sh\nexec sh "%s" "$@"\n' "$ROOT/src/lib/mudimodem-detach" > "$DETACH_REAL"
fi
chmod +x "$DETACH_REAL"

glb() {  # $POLL / $DET from the caller
  PATH="$TMP/bin:$PATH" GLBATTLIMIT_ROOT="$FS" GLBATTLIMIT_POLL="${POLL:-30}" \
    MUDIMODEM_DETACH="${DET:-$DETACH_REAL}" "$GLB" "$@" >/dev/null 2>&1
}
# A pid is alive while it exists and is not a zombie (an orphaned watcher may
# sit unreaped as one, depending on what PID 1 is here).
alive() { [ -n "$1" ] && [ -r "/proc/$1/status" ] && ! grep -q '^State:[[:space:]]*Z' "/proc/$1/status"; }
gone_within() {  # $1 pid, $2 seconds
  i=0; while alive "$1" && [ "$i" -lt $(($2 * 10)) ]; do sleep 0.1; i=$((i + 1)); done
  ! alive "$1"
}
wfail() { echo "FAIL $1"; for p in $(cat "$WPIDF" 2>/dev/null) ${w1:-} ${w2:-} ${w3:-}; do kill "$p" 2>/dev/null; done; exit 1; }

echo "W1. on: watcher runs detached (no inherited fds), gate applied"
glb on 60 7>"$TMP/fdprobe"
w1=$(cat "$WPIDF" 2>/dev/null)
alive "$w1"                      || wfail "W1: no live watcher after on"
[ "$(cat "$WLIMF")" = 60 ]       || wfail "W1: limit file"
[ "$(cat "$VREG")" = 3900000 ]   || wfail "W1: gate not applied (vreg $(cat "$VREG"))"
[ -e "/proc/$w1/fd/7" ]          && wfail "W1: watcher inherited the caller's fd 7 (nginx sockets would leak)"
PATH="$TMP/bin:$PATH" GLBATTLIMIT_ROOT="$FS" "$GLB" status 2>/dev/null | grep -q 'Limit *: active' \
                                 || wfail "W1: status does not report the watcher"

echo "W2. re-running on: the old watcher is gone BEFORE the new one starts"
t0=$(date +%s); glb on 65; t1=$(date +%s)
w2=$(cat "$WPIDF" 2>/dev/null)
alive "$w1"                      && wfail "W2: old watcher still alive after on returned (its late exit would orphan the new one)"
alive "$w2"                      || wfail "W2: no new watcher"
[ "$w2" != "$w1" ]               || wfail "W2: watcher not restarted"
[ "$(cat "$WLIMF")" = 65 ]       || wfail "W2: new limit not recorded"
[ $((t1 - t0)) -le 6 ]           || wfail "W2: on took $((t1 - t0)) s (the stop must not wait out a 30 s poll)"
sleep 1
[ "$(cat "$WPIDF" 2>/dev/null)" = "$w2" ] || wfail "W2: new watcher's pid file was removed"

echo "W3. off: stops it promptly, files removed, gate released"
t0=$(date +%s); glb off; t1=$(date +%s)
alive "$w2"                      && wfail "W3: watcher survived off"
[ ! -e "$WPIDF" ] && [ ! -e "$WLIMF" ] || wfail "W3: pid/limit file left behind"
[ "$(cat "$VREG")" = 4400000 ]   || wfail "W3: gate not released"
[ $((t1 - t0)) -le 3 ]           || wfail "W3: off took $((t1 - t0)) s"

echo "W4. a superseded watcher's exit leaves the owner's files and gate alone"
glb on 60; w3=$(cat "$WPIDF" 2>/dev/null)
echo 999999 > "$WPIDF"           # another watcher now owns the state
kill "$w3"
gone_within "$w3" 2              || wfail "W4: watcher did not exit promptly on TERM"
[ "$(cat "$WPIDF")" = 999999 ]   || wfail "W4: deleted a pid file it did not own"
[ -e "$WLIMF" ]                  || wfail "W4: deleted a limit file it did not own"
[ "$(cat "$VREG")" = 3900000 ]   || wfail "W4: released a gate it did not own"
rm -f "$WPIDF" "$WLIMF"

echo "W5. a watcher that finds another named in the pid file exits by itself"
POLL=1 glb on 60; w3=$(cat "$WPIDF" 2>/dev/null)
echo 999999 > "$WPIDF"
gone_within "$w3" 4              || wfail "W5: duplicate watcher kept running"
[ "$(cat "$WPIDF")" = 999999 ]   || wfail "W5: touched the owner's pid file"
rm -f "$WPIDF" "$WLIMF"

echo "W6. unplug: the watcher restores GL's charge voltage and exits"
POLL=1 glb on 60; w3=$(cat "$WPIDF" 2>/dev/null)
echo 0 > "$B/charger/online"
gone_within "$w3" 4              || wfail "W6: watcher kept running after unplug"
[ "$(cat "$VREG")" = 4400000 ] && [ ! -e "$WPIDF" ] || wfail "W6: GL's charge voltage not restored"
echo 1 > "$B/charger/online"

echo "W7. control: without the detach wrapper (standalone) the nohup path still works"
DET="$TMP/no-such-detach" glb on 60 7>"$TMP/fdprobe"; w3=$(cat "$WPIDF" 2>/dev/null)
alive "$w3"                      || wfail "W7: nohup fallback started no watcher"
[ -e "/proc/$w3/fd/7" ]          || wfail "W7: control broken (fd 7 should be inherited here, so W1 proves nothing)"
glb off
gone_within "$w3" 2              || wfail "W7: off did not stop the nohup watcher"

# W8-W10: the buck's vreg also belongs to GL's quec_battery, which derates it
# (4180 mV warm, 4250-4350 mV for an aged cell) — glbattlimit must give GL's
# value back, never a fixed 4.4 V, and never write vreg while not gating.
echo "W8. release restores GL's own (warm-derated) vreg, not 4.4 V"
echo 4180000 > "$VREG"
POLL=1 glb on 60; w3=$(cat "$WPIDF" 2>/dev/null)
[ "$(cat "$VREG")" = 3900000 ]   || wfail "W8: gate not applied (vreg $(cat "$VREG"))"
glb off
gone_within "$w3" 3              || wfail "W8: off did not stop the watcher"
[ "$(cat "$VREG")" = 4180000 ]   || wfail "W8: released to $(cat "$VREG") instead of GL's 4180000"

echo "W9. below the limit the watcher never writes vreg (GL's aged-cell value stands)"
echo 50 > "$B/cw221X-bat/capacity"; echo 4250000 > "$VREG"
POLL=1 glb on 60; w3=$(cat "$WPIDF" 2>/dev/null)
sleep 3
[ "$(cat "$VREG")" = 4250000 ]   || wfail "W9: overwrote GL's vreg with $(cat "$VREG") while not gating"
glb off
gone_within "$w3" 3              || wfail "W9: off did not stop the watcher"
[ "$(cat "$VREG")" = 4250000 ]   || wfail "W9: off wrote vreg though nothing was gated"
echo 70 > "$B/cw221X-bat/capacity"

echo "W10. GL rewrites vreg mid-gate (thermal change): its new value is the one restored"
echo 4400000 > "$VREG"
POLL=1 glb on 60; w3=$(cat "$WPIDF" 2>/dev/null)
[ "$(cat "$VREG")" = 3900000 ]   || wfail "W10: gate not applied"
echo 4180000 > "$VREG"           # quec_battery: thermal state -> warm
sleep 3
[ "$(cat "$VREG")" = 3900000 ]   || wfail "W10: gate not re-applied after GL's rewrite"
echo 0 > "$B/charger/online"     # unplug
gone_within "$w3" 4              || wfail "W10: watcher kept running after unplug"
[ "$(cat "$VREG")" = 4180000 ]   || wfail "W10: restored $(cat "$VREG"), not GL's latest 4180000"
echo 1 > "$B/charger/online"; echo 4400000 > "$VREG"

echo "glbattlimit watcher OK"

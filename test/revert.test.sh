#!/bin/sh
# Isolation tests for mudimodem-revert. DRY mode + temp paths: never touches the
# modem or /etc. Proves the safety logic before any real band write can exist.
#
# Usage: sh revert.test.sh /path/to/mudimodem-revert
set -u
SCRIPT="${1:-/tmp/mudimodem-revert}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILED=0

pass() { echo "  ok  - $1"; }
fail() { echo "  FAIL- $1"; FAILED=1; }

run() {  # runs the watchdog with isolated env; extra env in $EXTRA
  P="$WORK/pending"; L="$WORK/log"
  env MUDIMODEM_DRY=1 MUDIMODEM_PENDING="$P" MUDIMODEM_LOG="$L" \
      MUDIMODEM_ARMED="$WORK/armed" MUDIMODEM_WINDOW="${WIN:-1}" \
      MUDIMODEM_HIST="$WORK/hist" sh "$SCRIPT" "$@"
}
# LIVE mode (DRY unset) against a FAKE ubus on PATH: $UBUS_BODY is what
# `ubus call gl-session call` prints, $UBUS_RC its exit status. Exercises the
# real glc()/reply_is_error() path with no jsonfilter (the dev box has none),
# i.e. the top-level-key grep fallback.
runlive() {
  FAKE="$WORK/fakebin"; mkdir -p "$FAKE"
  cat > "$FAKE/ubus" <<EOF
#!/bin/sh
echo "ubus \$*" >> "$WORK/ubus.calls"
case "\$*" in
  *get_cell_tower*) printf '%s\n' "\${UBUS_TOWER_BODY:-\$UBUS_BODY}"; exit 0 ;;
  *gl-session\ call*) printf '%s\n' "\$UBUS_BODY"; exit "\${UBUS_RC:-0}" ;;
  *gl-session\ notify*) exit 0 ;;
  *) echo '{}'; exit 0 ;;
esac
EOF
  chmod +x "$FAKE/ubus"
  # A stand-in for libubox's jsonfilter (absent on the dev box, present in the
  # 4.10 image): `-e '@.a.b'` prints the value at that path — objects as JSON,
  # nothing when the path is missing — which is all the watchdog relies on.
  cat > "$FAKE/jsonfilter" <<'EOF'
#!/bin/sh
expr=""; while [ $# -gt 0 ]; do case "$1" in -e) expr="$2"; shift;; esac; shift; done
# (script via -c, so the JSON body stays on stdin)
python3 -c 'import json, sys
p = sys.argv[1]
path = [] if p == "@" else p.lstrip("@").strip(".").split(".")
try: v = json.load(sys.stdin)
except Exception: sys.exit(1)
for k in path:
    if isinstance(v, dict) and k in v: v = v[k]
    else: sys.exit(1)
print(json.dumps(v) if isinstance(v, (dict, list)) else v)' "$expr"
EOF
  chmod +x "$FAKE/jsonfilter"
  P="$WORK/pending"; L="$WORK/log"
  PATH="$FAKE:$PATH" env -u MUDIMODEM_DRY MUDIMODEM_PENDING="$P" MUDIMODEM_LOG="$L" \
      MUDIMODEM_ARMED="$WORK/armed" MUDIMODEM_WINDOW="${WIN:-1}" MUDIMODEM_HIST="$WORK/hist" \
      UBUS_BODY="$UBUS_BODY" UBUS_RC="${UBUS_RC:-0}" sh "$SCRIPT" "$@"
}
# A bands pending: the GL get_band_config snapshot, JSON single-quoted for sh.
mkpending() { printf "KIND=bands\nSLOT=1\nSUB_ID=1\nPREV_BAND_CONFIG='%s'\n" "$1" > "$WORK/pending"; }
SNAP='{"bus":"cpu","slot":1,"band_enable":true,"network_mode":"AUTO","band_list":{"LTE":[3,7],"NR-NSA":[],"NR-SA":[78]}}'
inlog() { grep -q "$1" "$WORK/log" 2>/dev/null; }

echo "1. watch: window elapses, still pending -> reverts to previous"
rm -f "$WORK/log"; mkpending "$SNAP"
WIN=1 run watch
inlog "reverting"                 && pass "logged revert" || fail "no revert logged"
inlog 'set_band_config'           && pass "restored via GL set_band_config" || fail "no set_band_config"
inlog '"NR-SA":\[78\]'            && pass "DRY-wrote the exact snapshot" || fail "snapshot not written verbatim"
inlog 'QNWPREFCFG'                && fail "raw-AT band write leaked" || pass "no raw-AT band write"
[ ! -f "$WORK/pending" ]          && pass "pending cleared" || fail "pending not cleared"

echo "2. watch: confirmed within window -> NO revert"
rm -f "$WORK/log" "$WORK/armed"; mkpending "$SNAP"
WIN=3 run watch &
WPID=$!
sleep 1
[ -f "$WORK/armed" ]              && pass "arm marker present during window" || fail "never armed"
rm -f "$WORK/pending"             # simulate mudimodem.confirm
wait "$WPID"
inlog "confirmed within window"   && pass "logged confirm" || fail "no confirm logged"
inlog "reverting"                 && fail "reverted despite confirm!" || pass "did not revert"
[ ! -f "$WORK/armed" ]            && pass "arm marker cleared after" || fail "arm marker leaked"

echo "3. boot-check: stale pending survives reboot -> reverts"
rm -f "$WORK/log"; mkpending "$SNAP"
run boot-check
inlog "stale pending"             && pass "detected stale" || fail "missed stale pending"
[ ! -f "$WORK/pending" ]          && pass "pending cleared" || fail "pending not cleared"

echo "4. boot-check: nothing pending -> no-op"
rm -f "$WORK/log" "$WORK/pending"
run boot-check
inlog "nothing pending"           && pass "clean no-op" || fail "unexpected action"
inlog "reverting"                 && fail "reverted with no pending!" || pass "did not revert"

echo "5. panic: opens band filtering on both slots + clears cell locks"
rm -f "$WORK/log"; mkpending "$SNAP"
run panic
inlog '"slot":1,"band_enable":false,"network_mode":"AUTO"' \
                                  && pass "slot 1 opened via set_band_config" || fail "slot 1 not opened"
inlog '"slot":2,"band_enable":false' \
                                  && pass "slot 2 opened too" || fail "slot 2 not opened"
inlog 'QNWLOCK=\\"common/4g\\",0' && pass "cleared 4g lock" || fail "did not clear 4g lock"
inlog 'QNWLOCK=\\"common/5g\\",0' && pass "cleared 5g lock" || fail "did not clear 5g lock"
[ ! -f "$WORK/pending" ]          && pass "pending cleared" || fail "pending not cleared"

echo "6. watch (KIND=cell): reverts by raw-AT unlock + restores prefs (no marker file: stale is derived live)"
rm -f "$WORK/log"
printf 'KIND=cell\nSUB_ID=1\nSLOT=1\nRAT=5g\nPREV_SAVE_CTRL=0,0\nPREV_mode_pref=NR5G\nPREV_nr5g_disable_mode=0\n' > "$WORK/pending"
WIN=1 run watch
inlog 'QNWLOCK=\\"common/5g\\",0'      && pass "unlocked 5g" || fail "no 5g unlock"
inlog 'QNWLOCK=\\"save_ctrl\\",0,0'    && pass "restored save_ctrl" || fail "no save_ctrl restore"
inlog 'mode_pref\\",NR5G'              && pass "restored mode_pref" || fail "no mode_pref restore"
inlog 'nr5g_disable_mode\\",0'         && pass "restored nr5g_disable_mode" || fail "no disable_mode restore"
[ ! -f "$WORK/pending" ]               && pass "pending cleared" || fail "pending not cleared"

echo "7. watch (KIND=cell, 4g): unlocks the right RAT"
rm -f "$WORK/log"
printf 'KIND=cell\nSUB_ID=1\nSLOT=1\nRAT=4g\nPREV_SAVE_CTRL=0,0\nPREV_mode_pref=AUTO\nPREV_nr5g_disable_mode=\n' > "$WORK/pending"
WIN=1 run watch
inlog 'QNWLOCK=\\"common/4g\\",0'      && pass "unlocked 4g" || fail "no 4g unlock"
inlog 'QNWLOCK=\\"common/5g\\",0'      && fail "touched 5g needlessly" || pass "left 5g alone"

echo "8. panic: also resets save_ctrl, mode_pref, and nr5g_disable_mode; GL-unlocks per slot"
rm -f "$WORK/log"
run panic 1
inlog '"slot":2' && fail "panic with an explicit slot touched slot 2" || pass "explicit slot honoured"
inlog 'set_cell_tower.*"slot":1,"lock":false' && pass "GL store unlocked on slot 1 (sub_id-agnostic)" || fail "no per-slot GL unlock"
inlog 'QNWLOCK=\\"save_ctrl\\",0,0'    && pass "save_ctrl reset" || fail "no save_ctrl reset"
inlog 'mode_pref\\",AUTO'              && pass "mode_pref AUTO" || fail "no mode_pref reset"
inlog 'nr5g_disable_mode\\",0'         && pass "nr5g_disable_mode reset (M1)" || fail "no nr5g_disable_mode reset"

echo "9. watch (I1): a superseded watchdog (arm nonce no longer ours) stands down"
rm -f "$WORK/log"; mkpending "$SNAP"
WIN=3 run watch &
WPID=$!
sleep 1
[ -f "$WORK/armed" ]              && pass "W1 armed (nonce present)" || fail "W1 never armed"
echo 999999 > "$WORK/armed"       # simulate a newer watchdog taking over the arm
wait "$WPID"
inlog "superseded"               && pass "W1 logged stand-down" || fail "W1 did not detect supersede"
inlog "reverting"                && fail "superseded W1 reverted anyway!" || pass "superseded W1 did not revert"
[ -f "$WORK/pending" ]           && pass "pending left intact for the new owner" || fail "W1 wrongly cleared pending"
[ "$(cat "$WORK/armed" 2>/dev/null)" = "999999" ] && pass "newer arm marker left intact" || fail "W1 stomped the newer arm marker"

echo "10. LIVE glc: both restores refused -> pending KEPT, failure event, exit 1"
rm -f "$WORK/log" "$WORK/ubus.calls" "$WORK/hist/events.jsonl"; mkpending "$SNAP"
# gl-session's envelope for a refusal: a TOP-LEVEL error object (ubus pretty-print, one tab).
UBUS_BODY=$(printf '{\n\t"error": {\n\t\t"code": 20002044,\n\t\t"message": "Unknown"\n\t}\n}')
WIN=1 UBUS_BODY="$UBUS_BODY" runlive watch; rc=$?
[ -f "$WORK/pending" ]            && pass "pending KEPT when nothing could be written" || fail "pending deleted although both restores failed"
inlog "restore FAILED"            && pass "logged the failure" || fail "no failure logged"
grep -c 'set_band_config' "$WORK/ubus.calls" 2>/dev/null | grep -q '^2$' \
                                  && pass "tried the snapshot, then the open-state fallback" || fail "expected exactly 2 set_band_config attempts"
grep -q 'Auto-revert FAILED' "$WORK/hist/events.jsonl" 2>/dev/null \
                                  && pass "timeline event says FAILED, not restored" || fail "event claims a restore that never happened"

echo "11. LIVE glc: a SUCCESS body containing a nested \"error\" key is still a success"
rm -f "$WORK/log" "$WORK/ubus.calls" "$WORK/hist/events.jsonl"; mkpending "$SNAP"
UBUS_BODY=$(printf '{\n\t"result": {\n\t\t"error": "",\n\t\t"error_code": 0\n\t}\n}')
WIN=1 UBUS_BODY="$UBUS_BODY" runlive watch
[ ! -f "$WORK/pending" ]          && pass "pending cleared on a real success" || fail "nested \"error\" substring mistaken for a refusal"
grep -c 'set_band_config' "$WORK/ubus.calls" 2>/dev/null | grep -q '^1$' \
                                  && pass "no open-state fallback after a success" || fail "fell back to open state on a success (would wipe the allowlist)"
grep -q 'Auto-revert fired' "$WORK/hist/events.jsonl" 2>/dev/null \
                                  && pass "timeline event says restored" || fail "no restored event"

echo "12. LIVE glc: ubus itself fails (gl-session down / nginx restarting) -> pending kept"
rm -f "$WORK/log" "$WORK/ubus.calls"; mkpending "$SNAP"
WIN=1 UBUS_BODY="Command failed: Not found" UBUS_RC=4 runlive watch
[ -f "$WORK/pending" ]            && pass "pending KEPT when the transport is down" || fail "pending lost on a transport failure"

echo "12b. LIVE panic: GL unlock carries the stored tower fields, ours last (bus/slot/lock:false)"
rm -f "$WORK/log" "$WORK/ubus.calls" "$WORK/pending"
TOWER=$(printf '{\n\t"result": {\n\t\t"slot1": {\n\t\t\t"cellid": "18B1AE035",\n\t\t\t"network_type": "NR5G",\n\t\t\t"pci": 516,\n\t\t\t"freq": 127490\n\t\t},\n\t\t"slot2": { }\n\t}\n}')
OK=$(printf '{\n\t"result": { }\n}')
UBUS_TOWER_BODY="$TOWER" UBUS_BODY="$OK" runlive panic
grep -q 'set_cell_tower.*"pci": *516.*"slot":1,"lock":false}' "$WORK/ubus.calls" \
                                  && pass "slot 1 unlock carries the stored fields, ours last" || fail "slot 1 payload wrong: $(grep set_cell_tower "$WORK/ubus.calls")"
grep -q 'set_cell_tower.*{"bus":"cpu","slot":2,"lock":false}' "$WORK/ubus.calls" \
                                  && pass "slot 2 (nothing stored) gets the minimal payload" || fail "slot 2 payload wrong"
grep -c 'set_band_config' "$WORK/ubus.calls" | grep -q '^2$' && pass "both slots opened" || fail "band open missing"
# also the top-level error detector through the real jsonfilter path
rm -f "$WORK/log" "$WORK/ubus.calls"; mkpending "$SNAP"
UBUS_BODY=$(printf '{\n\t"error": {\n\t\t"code": 20002044\n\t}\n}')
WIN=1 UBUS_BODY="$UBUS_BODY" runlive watch
[ -f "$WORK/pending" ]            && pass "jsonfilter path: refusal detected, pending kept" || fail "jsonfilter path missed the refusal"
rm -f "$WORK/log" "$WORK/ubus.calls"; mkpending "$SNAP"
UBUS_BODY=$(printf '{\n\t"result": {\n\t\t"error": ""\n\t}\n}')
WIN=1 UBUS_BODY="$UBUS_BODY" runlive watch
[ ! -f "$WORK/pending" ]          && pass "jsonfilter path: nested error key is still a success" || fail "jsonfilter path false positive"

echo "13. restore-now (KIND=cell): the same restore as watch, synchronously, JSON answer, watchdog stood down"
rm -f "$WORK/log" "$WORK/hist/events.jsonl"; echo 4242 > "$WORK/armed"
printf 'KIND=cell\nSUB_ID=1\nSLOT=1\nRAT=5g\nPREV_SAVE_CTRL=0,0\nPREV_mode_pref=NR5G\nPREV_nr5g_disable_mode=0\n' > "$WORK/pending"
OUT=$(run restore-now); rc=$?
[ "$rc" = "0" ]                        && pass "exit 0" || fail "exit $rc"
echo "$OUT" | grep -q '"ok":true'      && pass "JSON ok" || fail "no ok JSON: $OUT"
echo "$OUT" | grep -q '"kind":"cell"'  && pass "kind reported" || fail "kind missing"
inlog 'QNWLOCK=\\"common/5g\\",0'      && pass "unlocked 5g (same restore_from_pending)" || fail "no 5g unlock"
inlog 'mode_pref\\",NR5G'              && pass "restored mode_pref" || fail "no mode_pref restore"
[ ! -f "$WORK/pending" ]               && pass "pending cleared" || fail "pending not cleared"
[ ! -f "$WORK/armed" ]                 && pass "arm marker removed (sleeping watchdog stands down)" || fail "arm marker left"
grep -q '"kind":"user".*"Reverted"' "$WORK/hist/events.jsonl" 2>/dev/null \
                                       && pass "user Reverted event written" || fail "no Reverted event"

echo "14. restore-now (KIND=bands): restores the snapshot via GL, JSON ok"
rm -f "$WORK/log"; mkpending "$SNAP"
OUT=$(run restore-now)
echo "$OUT" | grep -q '"ok":true'      && pass "JSON ok" || fail "no ok JSON: $OUT"
inlog '"NR-SA":\[78\]'                && pass "snapshot written" || fail "snapshot not written"
[ ! -f "$WORK/pending" ]               && pass "pending cleared" || fail "pending not cleared"

echo "15. restore-now with nothing pending: harmless"
rm -f "$WORK/log" "$WORK/pending"
OUT=$(run restore-now); rc=$?
[ "$rc" = "0" ] && echo "$OUT" | grep -q nothing_pending && pass "reports nothing pending" || fail "unexpected: rc=$rc $OUT"

echo "16. LIVE restore-now: both band writes refused -> ok:false, exit 1, pending kept"
rm -f "$WORK/log" "$WORK/ubus.calls"; mkpending "$SNAP"
UBUS_BODY=$(printf '{\n\t"error": {\n\t\t"code": 20002044\n\t}\n}')
OUT=$(UBUS_BODY="$UBUS_BODY" runlive restore-now); rc=$?
[ "$rc" = "1" ]                        && pass "exit 1" || fail "exit $rc"
echo "$OUT" | grep -q '"ok":false'     && pass "JSON ok:false" || fail "no failure JSON: $OUT"
[ -f "$WORK/pending" ]                 && pass "pending kept" || fail "pending lost"

echo
if [ "$FAILED" = "0" ]; then echo "ALL REVERT TESTS PASSED"; else echo "REVERT TESTS FAILED"; exit 1; fi

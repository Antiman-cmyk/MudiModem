#!/bin/sh
# Isolation test for mudimodem-selfupdate. All paths + the install command are
# overridden via env so nothing real is fetched or installed. $1 = script path.
set -u
SCRIPT="${1:-/usr/sbin/mudimodem-selfupdate}"
T=$(mktemp -d)
LOCK="$T/lock.d"; RESULT="$T/result.json"; LOG="$T/update.log"
fail() { echo "FAIL: $1" >&2; rm -rf "$T"; exit 1; }

# --- success path: command exits 0 -> result ok:true, lock cleaned up ---
MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_UPDATE_CMD="true" \
  sh "$SCRIPT"
[ -f "$RESULT" ] || fail "no result file after success"
grep -q '"ok":true' "$RESULT" || fail "success did not record ok:true ($(cat "$RESULT"))"
[ -d "$LOCK" ] && fail "lockdir not removed after success"

# --- failure path: command exits nonzero -> result ok:false + error ---
MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_UPDATE_CMD="sh -c 'echo boom >&2; exit 7'" \
  sh "$SCRIPT"
grep -q '"ok":false' "$RESULT" || fail "failure did not record ok:false ($(cat "$RESULT"))"
grep -q '"error"' "$RESULT" || fail "failure did not record an error field"

# --- concurrency: a pre-existing lockdir makes the script a no-op ---
mkdir -p "$LOCK"
rm -f "$RESULT"
MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_UPDATE_CMD="true" \
  sh "$SCRIPT"
[ -f "$RESULT" ] && fail "second run ran despite existing lockdir"
rmdir "$LOCK"

# --- stale lock: a lockdir far older than the threshold gets reaped, so the
# run proceeds instead of wedging forever (SIGKILL/OOM/power-loss recovery) ---
mkdir -p "$LOCK"
touch -t 202001010000 "$LOCK"
rm -f "$RESULT"
MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_UPDATE_CMD="true" \
  sh "$SCRIPT"
[ -f "$RESULT" ] || fail "stale lockdir was not reaped (no result written)"
grep -q '"ok":true' "$RESULT" || fail "stale-reap run did not record ok:true ($(cat "$RESULT"))"
rm -f "$RESULT"
[ -d "$LOCK" ] && rmdir "$LOCK" 2>/dev/null

# --- fresh lock: a lockdir with a current mtime is NOT reaped -> still a no-op ---
mkdir -p "$LOCK"
rm -f "$RESULT"
MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_UPDATE_CMD="true" \
  sh "$SCRIPT"
[ -f "$RESULT" ] && fail "fresh lockdir was reaped (concurrency protection broken)"
rmdir "$LOCK"

rm -rf "$T"

echo "6. default command follows the base recorded in version.json (fork/branch installs)"
T6=$(mktemp -d); LOCK="$T6/lock.d"; RESULT="$T6/result.json"; LOG="$T6/log"
VF="$T6/version.json"; OUT="$T6/base"
printf '{"version":"2.0.0","base":"https://raw.githubusercontent.com/someone/MudiModem/feature-x"}\n' > "$VF"
# A fake curl: its stdout is what `| sh` executes, so make it record the env sh sees.
FAKEBIN=$(mktemp -d)
cat > "$FAKEBIN/curl" <<EOF
#!/bin/sh
echo "\$2" > "$OUT.url"
echo 'echo "\$MUDIMODEM_BASE" > $OUT'
EOF
chmod +x "$FAKEBIN/curl"
PATH="$FAKEBIN:$PATH" MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
  MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_VERSION_FILE="$VF" sh "$SCRIPT"
grep -q 'someone/MudiModem/feature-x/install.sh' "$OUT.url" || fail "curl must fetch install.sh from the recorded base"
[ "$(cat "$OUT")" = "https://raw.githubusercontent.com/someone/MudiModem/feature-x" ] || fail "install.sh must inherit MUDIMODEM_BASE"
grep -q '"ok":true' "$RESULT" || fail "expected ok result"
echo "  ok  - self-update follows the recorded base"
rm -rf "$T6" "$FAKEBIN"

echo "7. a recorded base that is not a plain URL is IGNORED (falls back to upstream), never executed"
T7=$(mktemp -d); LOCK="$T7/lock.d"; RESULT="$T7/result.json"; LOG="$T7/log"
VF="$T7/version.json"; OUT="$T7/base"; PWNED="$T7/PWNED"
printf '{"version":"2.0.0","base":"https://x/$(touch %s)"}\n' "$PWNED" > "$VF"
FAKEBIN=$(mktemp -d)
cat > "$FAKEBIN/curl" <<EOF
#!/bin/sh
echo "\$2" > "$OUT.url"
echo 'echo "\$MUDIMODEM_BASE" > $OUT'
EOF
chmod +x "$FAKEBIN/curl"
PATH="$FAKEBIN:$PATH" MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
  MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_VERSION_FILE="$VF" sh "$SCRIPT"
[ -e "$PWNED" ] && fail "shell metacharacters in the recorded base were EXECUTED"
grep -q 'Antiman-cmyk/MudiModem/main/install.sh' "$OUT.url" || fail "a bad base must fall back to upstream main (got: $(cat "$OUT.url"))"
[ "$(cat "$OUT")" = "https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main" ] || fail "install.sh must see the fallback base"
echo "  ok  - unsafe base ignored, nothing executed"
rm -rf "$T7" "$FAKEBIN"

echo "8. a base with a port (dev box http server) is accepted — same allowlist as the Lua app_version"
T8=$(mktemp -d); LOCK="$T8/lock.d"; RESULT="$T8/result.json"; LOG="$T8/log"
VF="$T8/version.json"; OUT="$T8/base"
printf '{"version":"2.0.0","base":"http://192.168.8.190:8000"}\n' > "$VF"
FAKEBIN=$(mktemp -d)
cat > "$FAKEBIN/curl" <<EOF
#!/bin/sh
echo "\$2" > "$OUT.url"
echo 'echo "\$MUDIMODEM_BASE" > $OUT'
EOF
chmod +x "$FAKEBIN/curl"
PATH="$FAKEBIN:$PATH" MUDIMODEM_UPDATE_LOCK="$LOCK" MUDIMODEM_UPDATE_RESULT="$RESULT" \
  MUDIMODEM_UPDATE_LOG="$LOG" MUDIMODEM_VERSION_FILE="$VF" sh "$SCRIPT"
grep -q '^http://192.168.8.190:8000/install.sh$' "$OUT.url" || fail "a base with a port must be followed (got: $(cat "$OUT.url"))"
echo "  ok  - port base accepted"
rm -rf "$T8" "$FAKEBIN"
echo "selfupdate OK"

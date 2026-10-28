#!/bin/sh
# Isolation test for mudimodem-deps (python3 runtime check / install / heal).
# python3, opkg, logger and the init scripts are stubs driven by flag files in
# $S, so nothing real is installed. $1 = script path.
set -u
SCRIPT="${1:-/usr/lib/mudimodem/mudimodem-deps}"
T=$(mktemp -d); S="$T/state"; mkdir -p "$S" "$T/bin" "$T/initd"
fail() { echo "FAIL: $1" >&2; rm -rf "$T"; exit 1; }

# python3 works iff $S/python_ok. opkg logs every call; `update` fails while
# $S/feed_down holds a positive count; `install` fixes python iff $S/install_fixes,
# `install --force-reinstall` iff $S/reinstall_fixes.
cat > "$T/bin/python3" <<EOF
#!/bin/sh
[ -f "$S/python_ok" ]
EOF
cat > "$T/bin/opkg" <<EOF
#!/bin/sh
echo "\$*" >> "$S/opkg.log"
case "\$1" in
  update) n=\$(cat "$S/feed_down" 2>/dev/null || echo 0)
          [ "\$n" -gt 0 ] && { echo \$((n - 1)) > "$S/feed_down"; exit 1; }; exit 0 ;;
  install) if [ "\$2" = --force-reinstall ]; then f=reinstall_fixes; else f=install_fixes; fi
           [ -f "$S/\$f" ] && touch "$S/python_ok"; exit 0 ;;
esac
EOF
printf '#!/bin/sh\nexit 0\n' > "$T/bin/logger"
for s in mudimodem-collectd mudimodem-speedtestd; do
  cat > "$T/initd/$s" <<EOF
#!/bin/sh
case "\$1" in
  enabled) [ -f "$S/enabled-$s" ] ;;
  start)   echo "$s" >> "$S/started" ;;
esac
EOF
done
chmod +x "$T/bin/"* "$T/initd/"*

LOCK="$T/deps.lock"
deps() { PATH="$T/bin:$PATH" MUDIMODEM_INITD="$T/initd" MUDIMODEM_DEPS_LOCK="$LOCK" \
         MUDIMODEM_DEPS_TRIES=3 MUDIMODEM_DEPS_NAP=0 sh "$SCRIPT" "$@" > "$T/out" 2>&1; }
reset() { rm -f "$S"/*; }
calls() { cat "$S/opkg.log" 2>/dev/null; }

# --- check: the interpreter decides, opkg is never asked ---
reset; touch "$S/python_ok"
deps check || fail "check failed with a working python3"
reset
deps check && fail "check passed without python3"
[ -z "$(calls)" ] || fail "check called opkg: $(calls)"

# --- install: nothing to do when python3 already works ---
reset; touch "$S/python_ok"
deps install || fail "install failed with a working python3"
[ -z "$(calls)" ] || fail "install ran opkg although python3 works: $(calls)"

# --- install: fresh box -> update + install, no forced reinstall ---
reset; touch "$S/install_fixes"
deps install || fail "fresh install failed ($(cat "$T/out"))"
[ "$(calls)" = "$(printf 'update\ninstall python3-light')" ] || fail "fresh install opkg calls: $(calls)"

# --- install: opkg claims the package but python3 still fails -> one forced reinstall ---
reset; touch "$S/reinstall_fixes"
deps install || fail "forced reinstall did not recover ($(cat "$T/out"))"
calls | grep -qx 'install --force-reinstall python3-light' || fail "no --force-reinstall: $(calls)"

# --- install: nothing helps -> nonzero, and it says so ---
reset
deps install && fail "install reported success while python3 is still broken"
grep -q ERROR "$T/out" || fail "failed install did not log an ERROR"

# --- heal: waits out a down feed, installs, starts only ENABLED services ---
reset; echo 2 > "$S/feed_down"; touch "$S/install_fixes" "$S/enabled-mudimodem-collectd"
deps heal || fail "heal failed after the feed came back ($(cat "$T/out"))"
[ "$(calls | grep -c '^update$')" = 3 ] || fail "heal did not retry the feed: $(calls)"
[ "$(cat "$S/started" 2>/dev/null)" = mudimodem-collectd ] \
  || fail "heal started '$(cat "$S/started" 2>/dev/null)', expected only the enabled collector"

# --- heal: feed never comes back -> gives up after TRIES, installs and starts nothing ---
reset; echo 99 > "$S/feed_down"; touch "$S/install_fixes" "$S/enabled-mudimodem-collectd"
deps heal && fail "heal reported success with no feed"
[ "$(calls | grep -c '^update$')" = 3 ] || fail "heal did not stop after TRIES: $(calls)"
calls | grep -q '^install' && fail "heal installed without a feed"
[ -f "$S/started" ] && fail "heal started services without python3"

# --- heal with nothing to heal is a silent no-op ---
reset; touch "$S/python_ok" "$S/enabled-mudimodem-collectd"
deps heal || fail "heal failed with a working python3"
[ -z "$(calls)" ] && [ ! -f "$S/started" ] || fail "no-op heal touched opkg/services"

# --- one runner at a time: a held lock makes install and heal step aside ---
reset; touch "$S/install_fixes"
exec 8>"$LOCK"; flock -n 8 || fail "test could not take the lock"
deps install || fail "install with the lock held should exit 0 (the holder installs)"
deps heal    || fail "heal with the lock held should exit 0"
exec 8>&-
[ -z "$(calls)" ] || fail "opkg ran while another runner held the lock: $(calls)"

# --- usage ---
deps bogus; [ $? = 2 ] || fail "unknown mode should exit 2"

rm -rf "$T"
echo "deps OK"

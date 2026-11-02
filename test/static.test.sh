#!/bin/sh
# Static invariants of the shipped code that are cheaper to grep than to run. Install/uninstall
# behaviour is tested by running it (test/installer.test.sh); the manifest by test/manifest.test.sh.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $*" >&2; exit 1; }
code() { grep -hv '^[[:space:]]*#' "$@"; }   # shell sources without comment lines

# busybox on 4.10 has neither pkill nor setsid (mudimodem-detach probes for setsid and falls back).
code src/rpc/mudimodem src/sbin/* src/lib/mudimodem-deps src/etc/init.d/* src/installer/* install.sh uninstall.sh \
  | grep -qE '(^|[^a-z])(pkill|setsid)[[:space:]]' && fail "pkill/setsid are absent from the router's busybox"
# The one firmware/model gate is the installer's; the dev tools run it on the box instead of copying it.
for f in tools/deploy.sh tools/verify.sh install.sh; do
  grep -q 'GLMIN' "$f" && fail "$f carries its own firmware gate; use the installer's preflight"
done
grep -q "sh -s preflight' < src/installer/mudimodem-install" tools/deploy.sh || fail "deploy.sh must run the installer's preflight on the box"
grep -q "sh -s preflight' < src/installer/mudimodem-install" tools/verify.sh || fail "verify.sh must run the installer's preflight on the box"
# opkg goes through mudimodem-deps only (one recipe, flock-serialized).
code src/installer/mudimodem-install install.sh tools/deploy.sh | grep -q 'opkg' && fail "use mudimodem-deps, not opkg directly"
# keep.d is the E5800's only upgrade-preserve list; sysupgrade.conf is never read there.
code src/installer/mudimodem-install install.sh tools/deploy.sh | grep -q '>>[[:space:]]*.*sysupgrade.conf' \
  && fail "never register files in /etc/sysupgrade.conf (abfota_update never reads it)"

# The AT tool must never touch gl_modem (no such daemon on 4.10; SIGSTOP-ing it was a 4.8 hack).
if grep 'gl_modem' tools/mudimodem-at.py | grep -v poller | grep -q .; then fail "AT tool must not touch gl_modem"; fi
# Watchdog boot hook: restores a pending change after a reboot, in the background.
grep -q 'boot-check' src/etc/init.d/mudimodem-revert || fail "boot hook must run mudimodem-revert boot-check"
grep -qE 'mudimodem-revert boot-check.*&[[:space:]]*$' src/etc/init.d/mudimodem-revert || fail "boot-check must run in the background"
grep -q 'set_cell_tower' src/sbin/mudimodem-revert || fail "panic must clear GL's stored cell lock per slot"
grep -q 'gl-stale\|MUDIMODEM_STALE' src/rpc/mudimodem src/sbin/mudimodem-revert && fail "the gl-stale marker is gone; stale is derived live"
# Detached children never inherit nginx's listening sockets.
grep -q 'mudimodem-detach' src/sbin/glbattlimit || fail "glbattlimit must launch its watcher through mudimodem-detach"
# Self-update follows the recorded install source.
grep -q 'MUDIMODEM_BASE=' src/sbin/mudimodem-selfupdate || fail "self-update must pass the recorded base to install.sh"

# python3 (opkg; wiped by a firmware upgrade) is healed at boot for exactly the python services.
py_svcs=$(grep -l '/usr/bin/python3' src/etc/init.d/* | xargs -n1 basename | sort | tr '\n' ' ')
deps_svcs=$(sed -n 's/^SERVICES="\(.*\)"/\1/p' src/lib/mudimodem-deps | tr ' ' '\n' | sort | tr '\n' ' ')
[ "$py_svcs" = "$deps_svcs" ] || fail "mudimodem-deps SERVICES ($deps_svcs) must be the python services ($py_svcs)"
for n in $py_svcs; do
  grep -q '"$DEPS" check' "src/etc/init.d/$n" && grep -q '"$DEPS" heal' "src/etc/init.d/$n" \
    || fail "$n must defer to mudimodem-deps heal when python3 is missing"
done
echo "static OK"

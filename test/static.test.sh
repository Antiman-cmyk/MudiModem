#!/bin/sh
# Static invariants of the shipped code that are cheaper to grep than to run. Install/uninstall
# behaviour is tested by running it (test/installer.test.sh); the manifest by test/manifest.test.sh.
set -eu
cd "$(dirname "$0")/.."
fail() { echo "FAIL: $*" >&2; exit 1; }
code() { grep -hv '^[[:space:]]*#' "$@"; }   # shell sources without comment lines

# busybox on 4.10 has neither pkill nor setsid (mudimodem-detach probes for setsid and falls back).
code src/rpc/mudimodem src/sbin/* src/etc/init.d/* src/installer/* install.sh uninstall.sh \
  | grep -qE '(^|[^a-z])(pkill|setsid)[[:space:]]' && fail "pkill/setsid are absent from the router's busybox"
# The one firmware/model gate is the installer's; the dev tools run it on the box instead of copying it.
for f in tools/deploy.sh tools/verify.sh install.sh; do
  grep -q 'GLMIN' "$f" && fail "$f carries its own firmware gate; use the installer's preflight"
done
grep -q "sh -s preflight' < src/installer/mudimodem-install" tools/deploy.sh || fail "deploy.sh must run the installer's preflight on the box"
grep -q "sh -s preflight' < src/installer/mudimodem-install" tools/verify.sh || fail "verify.sh must run the installer's preflight on the box"
# No package installs at all: MudiModem needs nothing beyond the image.
code src/installer/mudimodem-install install.sh tools/deploy.sh | grep -q 'opkg' && fail "no opkg: MudiModem needs nothing beyond the image"
# keep.d is the E5800's only upgrade-preserve list; sysupgrade.conf is never read there.
code src/installer/mudimodem-install install.sh tools/deploy.sh | grep -q '>>[[:space:]]*.*sysupgrade.conf' \
  && fail "never register files in /etc/sysupgrade.conf (abfota_update never reads it)"

# The direct AT port never signals a GL process (1.x SIGSTOPped the 4.8 poller; 4.10 has none).
if grep -nE 'kill|SIGSTOP|gl_modem' src/lib/mudimodemd/atport.lua | grep -q .; then fail "the direct AT port must not signal GL processes"; fi
# Watchdog boot hook: restores a pending change after a reboot, in the background.
grep -q 'boot-check' src/etc/init.d/mudimodem-revert || fail "boot hook must run mudimodem-revert boot-check"
grep -qE 'mudimodem-revert boot-check.*&[[:space:]]*$' src/etc/init.d/mudimodem-revert || fail "boot-check must run in the background"
grep -q 'set_cell_tower' src/sbin/mudimodem-revert || fail "panic must clear GL's stored cell lock per slot"
grep -q 'gl-stale\|MUDIMODEM_STALE' src/rpc/mudimodem src/sbin/mudimodem-revert && fail "the gl-stale marker is gone; stale is derived live"
# Detached children never inherit nginx's listening sockets.
grep -q 'mudimodem-detach' src/sbin/glbattlimit || fail "glbattlimit must launch its watcher through mudimodem-detach"
# Self-update follows the recorded install source.
grep -q 'MUDIMODEM_BASE=' src/sbin/mudimodem-selfupdate || fail "self-update must pass the recorded base to install.sh"

# Nothing on the box needs python3 (R3 ⑤): an opkg package a firmware upgrade wipes. Everything
# runs on what the 4.10 image ships (busybox sh, Lua 5.1, lua-eco, curl, jsonfilter).
for f in $(git ls-files --cached --others --exclude-standard src install.sh uninstall.sh 2>/dev/null || find src -type f); do
  head -n1 "$f" 2>/dev/null | grep -q '^#!.*python' && fail "$f is a python script (nothing on the box may need python3)"
done
grep -rnIE '/usr/bin/python|(^|[^-a-z_./])python3?[[:space:]]' src manifest.txt install.sh uninstall.sh \
  | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(--|#|//|\*)' | grep -q . \
  && fail "a python invocation on the box again (everything runs on the image's sh, Lua and eco)"
echo "static OK"

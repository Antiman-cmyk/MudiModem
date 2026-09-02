#!/bin/bash
# tools/test-local.sh — run every MudiModem suite on the dev box, no router needed.
#
# Two passes over the Lua isolation tests:
#   host  : the dev box's lua5.1 + lua-cjson (fast; its cjson LACKS empty_array, so
#           backend-history / backend-battery-history are expected to fail here);
#   router: the ROUTER's own /usr/bin/lua + cjson.so out of an extracted 4.10
#           rootfs, run through qemu-user-static -L <rootfs>. This is the
#           interpreter GL ships — OpenWrt's Lua 5.1 carries the LNUM patch
#           (32-bit integers: string.format("%d", <ms timestamp>) THROWS) and
#           its cjson has empty_array — so this pass catches what the host pass
#           cannot. Set MM_ROOTFS=<dir> (see firmware/README.md + reference/4.10/
#           re-notes.md for the unpack recipe); skipped when absent.
# backend-speedtest.test.lua needs a live ubusd and is skipped in both passes
# (verify.sh runs it on the box).
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export MM_PLUGIN=$PWD/src/rpc/mudimodem MM_VALIDATOR=$PWD/src/validator/mudimodem.lua MM_TMP=$T/mmtmp
export MM_WS_MODULE=$PWD/src/ws/mudimodem.lua
export MUDIMODEM_PENDING=$T/pending MUDIMODEM_ARMED=$T/armed MUDIMODEM_LATEST=$T/latest.json
export MUDIMODEM_BIN=$PWD/src/sbin/mudimodem-revert MUDIMODEM_DETACH=$T/detach MUDIMODEM_HIST=$T/hist
export MUDIMODEM_AT_TOOL=$PWD/test/fake-at-tool.py MUDIMODEM_LIB_TOOL=$PWD/test/fake-lib-tool.py
export MUDIMODEM_VERSION_FILE=$T/mmtmp/local.json MUDIMODEM_CURL=$T/mmtmp/curl.sh
export MUDIMODEM_HISTORY_CFG=$T/history.json MUDIMODEM_HISTORY_PERSIST=$T/persist
export MUDIMODEM_BATTLIMIT_FILE=$T/mmtmp/battlimit.json MUDIMODEM_BATTLIMIT_BIN=$T/mmtmp/glbattlimit
export MUDIMODEM_SPEEDTEST_STATUS=$T/st-status.json MUDIMODEM_ST_SCHEDULE=$T/st-sched.json MUDIMODEM_SPEEDTEST_HIST=$T/st-hist.jsonl
# host lua has no oui.ubus; the tests that don't stub it only need it to load.
mkdir -p "$T/lua/oui"; printf 'return { call = function() return {} end }\n' > "$T/lua/oui/ubus.lua"
export LUA_PATH="$T/lua/?.lua;;"
rc=0
run() { local name="$1"; shift
  rm -rf "$T/pending" "$T/armed" "$T/latest.json" "$T/hist" "$T/mmtmp"; mkdir -p "$T/hist" "$T/mmtmp"
  if "$@" > "$T/out.txt" 2>&1; then echo "PASS  $name"; else echo "FAIL  $name"; tail -n 12 "$T/out.txt" | sed 's/^/      /'; rc=1; fi; }
echo "== python =="
for f in test/*.test.py test/test_collectd.py; do run "$f" env -u MUDIMODEM_CURL python3 "$f"; done
echo "== node =="
for f in test/*.test.js; do run "$f" node --test --test-reporter=tap "$f"; done
echo "== lua (host lua5.1) =="
for f in test/backend-*.test.lua test/ws-seed.test.lua; do
  case "$f" in *backend-speedtest*) echo "SKIP  $f (live ubusd only)"; continue;;
    *backend-history.test.lua|*backend-battery-history*) echo "XFAIL $f on host cjson (no empty_array) — see router pass"; continue;; esac
  run "$f" lua5.1 "$f"
done
# Default to the extracted image under firmware/rootfs (gitignored; see firmware/README.md).
[ -z "${MM_ROOTFS:-}" ] && [ -x firmware/rootfs/usr/bin/lua ] && MM_ROOTFS=firmware/rootfs
if [ -n "${MM_ROOTFS:-}" ] && command -v qemu-aarch64-static >/dev/null && [ -x "$MM_ROOTFS/usr/bin/lua" ]; then
  echo "== lua (ROUTER lua via qemu, rootfs $MM_ROOTFS) =="
  unset LUA_PATH
  for f in test/backend-*.test.lua test/ws-seed.test.lua; do
    case "$f" in *backend-speedtest*) continue;; esac
    run "router:$f" qemu-aarch64-static -L "$MM_ROOTFS" "$MM_ROOTFS/usr/bin/lua" "$f"
  done
else
  echo "== lua (ROUTER lua) SKIPPED: set MM_ROOTFS=<extracted 4.10 rootfs> and install qemu-user-static =="
fi
echo "== sh (dash + busybox ash) =="
for shell in sh "busybox sh"; do
  run "$shell test/revert.test.sh" $shell test/revert.test.sh src/sbin/mudimodem-revert
  run "$shell test/selfupdate.test.sh" $shell test/selfupdate.test.sh src/sbin/mudimodem-selfupdate
  run "$shell test/test_install_wiring.sh" $shell test/test_install_wiring.sh
  run "$shell test/battlimit-hotplug.test.sh" $shell test/battlimit-hotplug.test.sh
done
command -v shellcheck >/dev/null && run "shellcheck" shellcheck -s sh -S warning -e SC2086,SC2034,SC1090,SC2016,SC3043 \
  src/sbin/mudimodem-revert src/sbin/mudimodem-selfupdate install.sh uninstall.sh src/lib/mudimodem-detach
exit $rc

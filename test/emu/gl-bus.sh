#!/bin/sh
# test/emu/gl-bus.sh — start / stop an emulated GL ubus: the image's own ubusd + test/emu/fake-gl.lua
# (both under qemu via tools/emu.sh), on a private socket. For tests on the dev box only.
#
#   test/emu/gl-bus.sh start <dir> <scenario.json>   -> <dir>/ubus.sock, <dir>/bin/ubus (a host
#                                                      wrapper calling the image's ubus CLI on it)
#   test/emu/gl-bus.sh stop <dir>
set -eu
HERE=$(cd "$(dirname "$0")/../.." && pwd)
EMU="$HERE/tools/emu.sh"
cmd=$1; dir=$2
case "$cmd" in
  start)
    scen=$3
    mkdir -p "$dir/bin"; rm -f "$dir/ubus.sock" "$dir/ready" "$dir/calls.jsonl" "$dir/notify.jsonl"
    "$EMU" run sbin/ubusd -s "$dir/ubus.sock" >"$dir/ubusd.log" 2>&1 &
    echo $! > "$dir/ubusd.pid"
    i=0; while [ ! -S "$dir/ubus.sock" ]; do i=$((i + 1)); [ $i -gt 100 ] && { echo "ubusd did not start" >&2; exit 1; }; sleep 0.1; done
    "$EMU" eco "$HERE/test/emu/fake-gl.lua" "$dir/ubus.sock" "$scen" "$dir" >"$dir/fake-gl.log" 2>&1 &
    echo $! > "$dir/fake-gl.pid"
    i=0; while [ ! -f "$dir/ready" ]; do i=$((i + 1)); [ $i -gt 150 ] && { cat "$dir/fake-gl.log" >&2; echo "fake GL did not start" >&2; exit 1; }; sleep 0.1; done
    printf '#!/bin/sh\nexec "%s" run bin/ubus -s "%s" "$@"\n' "$EMU" "$dir/ubus.sock" > "$dir/bin/ubus"
    chmod +x "$dir/bin/ubus"
    ;;
  stop)
    for p in fake-gl ubusd; do
      [ -f "$dir/$p.pid" ] && kill "$(cat "$dir/$p.pid")" 2>/dev/null || true
      rm -f "$dir/$p.pid"
    done
    ;;
  *) echo "usage: $0 start <dir> <scenario.json> | stop <dir>" >&2; exit 2 ;;
esac

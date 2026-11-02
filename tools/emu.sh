#!/bin/sh
# tools/emu.sh — run the ROUTER's own userland (GL 4.10.0 image) on the dev box via qemu-user.
#
#   tools/emu.sh lua  <script> [args]   the image's Lua 5.1 (LNUM, GL's cjson/ubus/posix modules)
#   tools/emu.sh eco  <script> [args]   the image's lua-eco (Lua 5.4 + event loop)
#   tools/emu.sh sh   <script> [args]   the image's busybox ash, with ONLY the image's busybox
#                                       applets on PATH (no pkill, no setsid — like the router)
#   tools/emu.sh run  <prog> [args]     any binary from the image (e.g. usr/bin/jsonfilter)
#   tools/emu.sh check                  is emulation available? (exit 0/1, prints why)
#
# Needs firmware/rootfs (tools/firmware.sh fetch && tools/firmware.sh extract) and
# qemu-user-static. busybox re-execs itself for some applets, which needs the kernel's binfmt_misc
# aarch64 entry; this script registers it when it can (root) and says so when it cannot.
# MM_ROOTFS overrides the rootfs location.
set -eu
HERE=$(cd "$(dirname "$0")/.." && pwd)
ROOTFS=$(cd "${MM_ROOTFS:-$HERE/firmware/rootfs}" 2>/dev/null && pwd || echo "${MM_ROOTFS:-$HERE/firmware/rootfs}")
QEMU=$(command -v "${MM_QEMU:-qemu-aarch64-static}" 2>/dev/null || echo "${MM_QEMU:-qemu-aarch64-static}")
BIN="$HERE/build/emu-bin"

have() {
  command -v "$QEMU" >/dev/null 2>&1 || { echo "emu: $QEMU not installed (apt install qemu-user-static)"; return 1; }
  [ -x "$ROOTFS/usr/bin/lua" ] || { echo "emu: no rootfs at $ROOTFS (tools/firmware.sh fetch && tools/firmware.sh extract)"; return 1; }
}

binfmt() {
  [ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ] && return 0
  [ -w /proc/sys/fs/binfmt_misc/register ] || mount -t binfmt_misc binfmt_misc /proc/sys/fs/binfmt_misc 2>/dev/null || true
  if [ -w /proc/sys/fs/binfmt_misc/register ] && [ -f /usr/lib/binfmt.d/qemu-aarch64.conf ]; then
    cat /usr/lib/binfmt.d/qemu-aarch64.conf > /proc/sys/fs/binfmt_misc/register 2>/dev/null || true
  fi
  [ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ]
}

# One host wrapper per applet the image's busybox provides. The directory is rebuilt when the
# rootfs's busybox changes, so a stale applet list never hides a missing applet.
applets() {
  stamp="$BIN/.stamp"; want="$(cksum < "$ROOTFS/bin/busybox") $QEMU $ROOTFS"
  [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$want" ] && return 0
  rm -rf "$BIN"; mkdir -p "$BIN"
  for a in $("$QEMU" -L "$ROOTFS" "$ROOTFS/bin/busybox" --list); do
    printf '#!/bin/sh\nexec %s -L "%s" "%s/bin/busybox" %s "$@"\n' "$QEMU" "$ROOTFS" "$ROOTFS" "$a" > "$BIN/$a"
    chmod +x "$BIN/$a"
  done
  # The image's own non-busybox tools the scripts call.
  for p in usr/bin/jsonfilter usr/bin/lua; do
    printf '#!/bin/sh\nexec %s -L "%s" "%s/%s" "$@"\n' "$QEMU" "$ROOTFS" "$ROOTFS" "$p" > "$BIN/$(basename "$p")"
    chmod +x "$BIN/$(basename "$p")"
  done
  echo "$want" > "$stamp"
}

cmd=${1:-}; [ $# -gt 0 ] && shift
case "$cmd" in
  check) have && { binfmt && echo "emu: ok (binfmt aarch64 registered)" || echo "emu: ok (no binfmt: busybox self re-exec may fail)"; } ;;
  lua) have >&2; exec "$QEMU" -L "$ROOTFS" "$ROOTFS/usr/bin/lua" "$@" ;;
  eco) have >&2; exec "$QEMU" -L "$ROOTFS" "$ROOTFS/usr/bin/eco" "$@" ;;
  run) have >&2; p=$1; shift; exec "$QEMU" -L "$ROOTFS" "$ROOTFS/${p#/}" "$@" ;;
  sh)
    have >&2; binfmt || true; applets
    QEMU_LD_PREFIX="$ROOTFS" PATH="$BIN" exec "$QEMU" -L "$ROOTFS" "$ROOTFS/bin/busybox" ash "$@" ;;
  *) echo "usage: $0 check|lua|eco|sh|run ..." >&2; exit 2 ;;
esac

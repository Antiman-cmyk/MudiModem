#!/bin/sh
# tools/firmware.sh — get the official GL-E5800 firmware image the code is built against, and
# unpack its root filesystem for analysis and emulation. Dev box only (never the router).
#
#   tools/firmware.sh fetch      download the pinned OTA zip into firmware/ (sha256-checked)
#   tools/firmware.sh extract    system.new.dat -> ext4 -> firmware/rootfs/ (debugfs, no mount)
#   tools/firmware.sh info       what is on disk
#
# Pinned: 4.10.0 release5 — the only firmware MudiModem targets. The sha256 is GL's own (from
# firmware-api.gl-inet.com) and is checked against BOTH the pin below and the API, so neither a
# changed API answer nor a tampered download goes unnoticed. Override for a one-off look at
# another build: MM_FW_URL=<zip url> MM_FW_SHA256=<sha> tools/firmware.sh fetch
#
# Needs: curl, python3, debugfs (e2fsprogs). Unpacking method: reference/4.10/re-notes.md.
set -eu
cd "$(dirname "$0")/.."

FW_DIR=firmware
FW_VER=4.10.0
FW_NAME=e5800-4.10.0_release5-1092-0825-1787643675.zip
FW_URL="${MM_FW_URL:-https://fw.gl-inet.com/firmware/e5800/release/$FW_NAME}"
FW_SHA="${MM_FW_SHA256:-3a6b69579000ac81c3dafcf327816b1bb7bacb4c3238ba87962c0df779cf040c}"
API="https://firmware-api.gl-inet.com/cloud-api/model/info?model=e5800"
ZIP="$FW_DIR/$(basename "$FW_URL")"
ROOTFS="${MM_ROOTFS:-$FW_DIR/rootfs}"

die() { echo "firmware.sh: $*" >&2; exit 1; }
sha_of() { sha256sum "$1" | cut -d' ' -f1; }

fetch() {
  mkdir -p "$FW_DIR"
  if [ -z "${MM_FW_URL:-}" ]; then
    # Cross-check the pin with GL's API (best effort: offline is fine, a MISMATCH is not).
    api=$(curl -fsS -m 30 "$API" 2>/dev/null | python3 -I -c '
import json, sys
name = sys.argv[1]
try:
    info = json.load(sys.stdin).get("info") or []
except ValueError:
    sys.exit(0)
for rel in info:
    for f in rel.get("download") or []:
        if f.get("name") == name:
            print(f.get("sha256", ""))
' "$FW_NAME" || true)
    if [ -n "$api" ] && [ "$api" != "$FW_SHA" ]; then
      die "GL's API now reports sha256 $api for $FW_NAME, the pin says $FW_SHA - investigate"
    fi
    [ -n "$api" ] && echo "API agrees with the pinned sha256"
  fi
  if [ -f "$ZIP" ] && [ "$(sha_of "$ZIP")" = "$FW_SHA" ]; then
    echo "already have $ZIP"; return 0
  fi
  echo "downloading $FW_URL (~370 MB)"
  curl -fL -m 3600 -o "$ZIP.part" "$FW_URL"
  got=$(sha_of "$ZIP.part")
  [ "$got" = "$FW_SHA" ] || { rm -f "$ZIP.part"; die "sha256 mismatch: got $got, want $FW_SHA"; }
  mv "$ZIP.part" "$ZIP"
  echo "ok: $ZIP"
}

extract() {
  [ -f "$ZIP" ] || die "no $ZIP - run: tools/firmware.sh fetch"
  command -v debugfs >/dev/null || die "debugfs missing (apt install e2fsprogs)"
  work=$(mktemp -d "$FW_DIR/.extract.XXXXXX")
  trap 'rm -rf "$work"' EXIT
  python3 -I -c '
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
for n in ("system.new.dat", "system.transfer.list"):
    z.extract(n, sys.argv[2])
' "$ZIP" "$work"
  python3 -I reference/4.10/re-tools/sdat2img.py "$work/system.transfer.list" "$work/system.new.dat" "$work/system.img" >/dev/null
  rm -f "$work/system.new.dat"
  rm -rf "$ROOTFS.new"; mkdir -p "$ROOTFS.new"
  debugfs -R "rdump / $ROOTFS.new" "$work/system.img" >/dev/null 2>&1
  [ -x "$ROOTFS.new/usr/bin/lua" ] || die "extraction produced no usr/bin/lua - image layout changed?"
  # The image ships an empty /proc mount point. qemu's -L redirects every path that exists under
  # the rootfs, so with it present a /proc LISTING (pgrep) sees nothing. Drop it if empty.
  rmdir "$ROOTFS.new/proc" 2>/dev/null || true
  rm -rf "$ROOTFS"; mv "$ROOTFS.new" "$ROOTFS"
  echo "ok: $ROOTFS ($(cat "$ROOTFS/etc/glversion"))"
}

info() {
  [ -f "$ZIP" ] && echo "zip:    $ZIP ($(sha_of "$ZIP"))" || echo "zip:    (none)"
  [ -f "$ROOTFS/etc/glversion" ] && echo "rootfs: $ROOTFS (glversion $(cat "$ROOTFS/etc/glversion"))" || echo "rootfs: (none)"
  echo "pinned: $FW_VER $FW_SHA"
}

case "${1:-}" in
  fetch) fetch ;;
  extract) extract ;;
  info) info ;;
  *) echo "usage: $0 fetch|extract|info" >&2; exit 2 ;;
esac

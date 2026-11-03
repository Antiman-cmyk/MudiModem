#!/bin/sh
# tools/build.sh — pack the install payload: manifest.txt + version.json + every source the
# manifest lists, at their repo paths. This is exactly what tools/deploy.sh pushes and what
# src/installer/mudimodem-install consumes (--from <unpacked dir>); install.sh fetches the same
# files one by one from a raw URL. Output: build/mudimodem-<version>.tar.gz (+ .sha256).
# Nothing is compiled: page chunks are gzipped on the router by the installer.
set -eu
cd "$(dirname "$0")/.."
VER=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' version.json | head -n1)
[ -n "$VER" ] || { echo "build.sh: no version in version.json" >&2; exit 1; }
FILES=$(sh src/installer/mudimodem-install sources --from .)
for f in $FILES; do [ -f "$f" ] || { echo "build.sh: manifest source missing: $f" >&2; exit 1; }; done
mkdir -p build
OUT="build/mudimodem-$VER.tar.gz"
# shellcheck disable=SC2086  # FILES is a list of repo paths without spaces (manifest.test.sh)
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -cf - version.json $FILES \
  | gzip -9 -n > "$OUT"
sha256sum "$OUT" | sed 's#  build/#  #' > "$OUT.sha256"
echo "$OUT ($(wc -c < "$OUT") bytes, $(echo "$FILES" | wc -w) files)"

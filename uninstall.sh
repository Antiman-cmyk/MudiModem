#!/bin/sh
# MudiModem uninstaller bootstrap — run ON the GL-E5800 ("Mudi") from a root shell:
#
#   curl -fsSL https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main/uninstall.sh | sh
#
# Removes every file the manifest placed (the keep.d entry included), stops and disables our
# services, and restarts nginx. Idempotent. It does NOT touch the modem's band/cell-lock NV —
# clear those from the page (or `/usr/sbin/mudimodem-revert panic`) first if you want them gone.
# The one exception: a change still in its confirm-or-revert window is reverted first, exactly as
# its watchdog would have done (and the uninstall stops if that revert fails).
#
# Uses the installer + manifest the box already has (/usr/lib/mudimodem). A box installed before
# 3.0 has neither: they are fetched from MUDIMODEM_BASE (raw URL or local checkout) instead.
set -eu

REF="${MUDIMODEM_REF:-main}"
BASE="${MUDIMODEM_BASE:-https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/$REF}"
ROOT="${MUDIMODEM_ROOT:-}"

STAGE=$(mktemp -d /tmp/mudimodem-uninstall.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT

if [ -f "$ROOT/usr/lib/mudimodem/mudimodem-install" ] && [ -f "$ROOT/usr/lib/mudimodem/manifest.txt" ]; then
  # Run a COPY: the uninstall deletes the installed one.
  cp "$ROOT/usr/lib/mudimodem/mudimodem-install" "$STAGE/mudimodem-install"
  sh "$STAGE/mudimodem-install" uninstall
else
  fetch() { case "$BASE" in /*) cat "$BASE/$1" ;; *) curl -fsSL "$BASE/$1" ;; esac; }
  mkdir -p "$STAGE/src/installer"
  fetch src/installer/mudimodem-install > "$STAGE/src/installer/mudimodem-install" || { echo "fetch failed: $BASE" >&2; exit 1; }
  fetch manifest.txt > "$STAGE/manifest.txt" || { echo "fetch failed: $BASE" >&2; exit 1; }
  sh "$STAGE/src/installer/mudimodem-install" uninstall --from "$STAGE"
fi

#!/bin/sh
# MudiModem installer bootstrap — run ON the GL-E5800 ("Mudi") from a root shell:
#
#   curl -fsSL https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main/install.sh | sh
#
# It downloads the installer, manifest.txt and every file the manifest lists into a staging
# directory FIRST (a dropped connection leaves the box untouched), then hands over to
# src/installer/mudimodem-install, which does the actual install. Idempotent; no reboot.
#
# Env:
#   MUDIMODEM_REF   branch/tag (default main)
#   MUDIMODEM_BASE  where to fetch from — a raw URL (fork/branch installs) or a local directory
#                   holding a checkout (offline installs, tests):
#                     B=https://raw.githubusercontent.com/<user>/MudiModem/<branch>
#                     curl -fsSL "$B/install.sh" | MUDIMODEM_BASE="$B" sh
#                   The base is recorded on the box, so the Config tab's update check and
#                   "Update now" keep following the same source.
set -eu

REF="${MUDIMODEM_REF:-main}"
BASE="${MUDIMODEM_BASE:-https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/$REF}"

fetch() {  # $1 repo path -> stdout
  case "$BASE" in
    /*) cat "$BASE/$1" ;;
    *)  curl -fsSL "$BASE/$1" ;;
  esac
}

STAGE=$(mktemp -d /tmp/mudimodem-install.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT
grab() {  # $1 repo path -> $STAGE/$1 (temp file first: a cut-off download never lands)
  mkdir -p "$STAGE/$(dirname "$1")"
  fetch "$1" > "$STAGE/$1.part" || { echo "fetch failed: $BASE/$1" >&2; exit 1; }
  mv "$STAGE/$1.part" "$STAGE/$1"
}

INSTALLER=src/installer/mudimodem-install
grab "$INSTALLER"
sh "$STAGE/$INSTALLER" preflight        # refuse a non-E5800 / pre-4.10 box before fetching more
grab manifest.txt
grab version.json
echo "fetching payload from $BASE:"
for f in $(sh "$STAGE/$INSTALLER" sources --from "$STAGE"); do
  [ -f "$STAGE/$f" ] || { grab "$f"; echo "  $f"; }
done

sh "$STAGE/$INSTALLER" install --from "$STAGE" --base "$BASE"

#!/bin/sh
# tools/deploy.sh — install the working tree on a Mudi over ssh (dev loop). Prefer emulation
# (tools/test-local.sh) for checking a change; deploy only when a box is genuinely needed.
#
#   MUDI_HOST=mudi tools/deploy.sh
#
# Packs the payload (tools/build.sh), streams it over ssh `cat` (the box has no sftp-server, so
# scp fails) and runs the SAME installer install.sh uses — one implementation, three ssh calls.
# MUDIMODEM_BASE is what the box records as its update source (default: upstream main).
set -eu
cd "$(dirname "$0")/.."
HOST="${MUDI_HOST:-mudi}"
UPD_BASE="${MUDIMODEM_BASE:-https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main}"
SSH="ssh -o BatchMode=yes root@$HOST"

# Model + firmware guard, run ON the box by the installer itself (on some LANs the usual
# address is a DIFFERENT GL router).
$SSH 'sh -s preflight' < src/installer/mudimodem-install

./tools/build.sh
VER=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' version.json | head -n1)

$SSH 'rm -rf /tmp/mm-payload && mkdir -p /tmp/mm-payload && tar -xzf - -C /tmp/mm-payload' \
  < "build/mudimodem-$VER.tar.gz"
q=$(printf %s "$UPD_BASE" | sed "s/'/'\\\\''/g")
$SSH "sh /tmp/mm-payload/src/installer/mudimodem-install install --from /tmp/mm-payload --base '$q'; rc=\$?; rm -rf /tmp/mm-payload; exit \$rc"
echo "deployed $VER to $HOST (updates from $UPD_BASE)"

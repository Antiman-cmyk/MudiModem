#!/bin/sh
# test/emu/gl-real.sh — run GL's OWN cellular stack (cellular_manager, which spawns modem_AT on the
# AT port) under qemu, with a fake RG650V (test/emu/fake-modem.py) behind /dev/smd9, then run a
# command against it. Where test/emu/gl-bus.sh fakes GL's ubus objects, this runs GL's binaries:
# the answer to "what does GL do with X" comes from GL's code, not from our reading of it.
#
#   test/emu/gl-real.sh <workdir> <command...>
#
# How: private mount + pid namespaces (unshare -m -p; everything GL starts ends with the command).
# The root is an overlayfs: the extracted image read-only below, <workdir>/upper above (GL's writes
# land there; it is reset every run unless GLREAL_KEEP=1), plus the /proc/gl-hw-info files the
# E5800 device tree's gl-hw node defines (model, build-in-modem=cpu, modem-cpu=rg650v, …). GL runs
# chrooted in it through binfmt_misc + qemu-user, so its system() shells, its scripts and the
# modem_AT it spawns are all the image's own. /tmp and /dev in the root are private tmpfs mounts
# (/dev holds null/zero/random/urandom/tty/ptmx/pts bound from the host, and smd9 -> the fake
# modem's pty). No /proc is mounted: qemu-user answers /proc/self itself, and /proc/gl-hw-info
# must stay ours.
# The command runs on the host side with $GLR (the merged root), $UBUS (the image's ubus CLI,
# chrooted) and $W set; the fake modem logs every AT command to $W/at.jsonl, GL's syslog lands in
# $W/syslog.txt and its stdout/stderr in $W/cm.out.
set -eu
HERE=$(cd "$(dirname "$0")/../.." && pwd)
W=$(mkdir -p "$1" && cd "$1" && pwd); shift
SRC=$(cd "${MM_ROOTFS:-$HERE/firmware/rootfs}" && pwd)
[ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ] || "$HERE/tools/emu.sh" check >/dev/null 2>&1 || true
[ -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ] || { echo "gl-real: needs the binfmt_misc aarch64 entry (tools/emu.sh check)" >&2; exit 2; }
[ "${GLREAL_INNER:-}" = 1 ] || exec unshare -m -p -f --mount-proc --propagation private env GLREAL_INNER=1 sh "$0" "$W" "$@"

if [ "${GLREAL_KEEP:-}" != 1 ]; then rm -rf "$W/upper" "$W/work"; fi
mkdir -p "$W/upper/proc/gl-hw-info" "$W/work" "$W/root"
for kv in model=e5800 build-in-modem=cpu modem-cpu=rg650v modem-vid=2c7c modem-pid=0133 country_code=US; do
  printf '%s' "${kv#*=}" > "$W/upper/proc/gl-hw-info/${kv%%=*}"
done
GLR=$W/root
mount -t overlay overlay -o "lowerdir=$SRC,upperdir=$W/upper,workdir=$W/work" "$GLR"
mount -t tmpfs none "$GLR/tmp"
mount -t tmpfs none "$GLR/dev"
for n in null zero random urandom tty ptmx; do : > "$GLR/dev/$n"; mount --bind "/dev/$n" "$GLR/dev/$n"; done
mkdir -p "$GLR/dev/pts" "$GLR/tmp/run/ubus" "$GLR/tmp/lock"; mount --bind /dev/pts "$GLR/dev/pts"
UBUS="chroot $GLR /bin/ubus"
export GLR UBUS W
: > "$W/at.jsonl"; : > "$W/syslog.txt"
python3 -I "$HERE/test/emu/syslog-catch.py" "$GLR/dev/log" "$W/syslog.txt" &
python3 -I "$HERE/test/emu/fake-modem.py" "$GLR/dev/smd9" "$W/at.jsonl" "$W/modem-state.json" > "$W/modem.out" 2>&1 &
i=0; while [ ! -L "$GLR/dev/smd9" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
chroot "$GLR" /sbin/ubusd > "$W/ubusd.out" 2>&1 &
i=0; while [ ! -S "$GLR/tmp/run/ubus/ubus.sock" ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done
# Quectel's MCM services (QMI, on the module) drop these when up; GL's check_ql_service_ready
# (libcm_modem.so @0x2ccd4) waits up to 60 s for them before it registers anything.
for f in mcm_atcop_service_ready mcm_service_ready mcm_sim_service_ready; do : > "$GLR/tmp/$f.flag"; done
chroot "$GLR" /usr/bin/cellular_manager > "$W/cm.out" 2>&1 &
"$@"

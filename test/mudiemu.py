"""mudi-emu for the Python suites: the pinned submodule (tools/mudi-emu) or $MUDI_EMU (a CLI path,
e.g. a checkout you are working on), on the image MudiModem targets.

    import mudiemu
    mudiemu.ok()                              # can the router's userland run here?
    mudiemu.cmd("run", "eco", script, ...)    # argv for subprocess
    mudiemu.bus("start", d, scenario)         # the image's ubusd + a fake GL (fakebus)
    mudiemu.rootfs()                          # the extracted image, or None"""
import os, subprocess

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CLI = os.environ.get("MUDI_EMU") or os.path.join(ROOT, "tools", "mudi-emu", "bin", "mudi-emu")
IMAGE = "e5800-4.10.0"                      # GL firmware 4.10 only (CLAUDE.md)
os.environ.setdefault("MUDI_EMU_IMAGE", IMAGE)


def cmd(*args):
    return [CLI] + list(args)


def ok():
    """The image's userland runs here (rootfs extracted, qemu installed)."""
    if not os.access(CLI, os.X_OK):
        return False
    return subprocess.run(cmd("check"), capture_output=True).returncode == 0


def stack_ok():
    """GL's own stack can run here too (`mudi-emu up`: root, unshare, binfmt)."""
    if not os.access(CLI, os.X_OK):
        return False
    r = subprocess.run(cmd("check"), capture_output=True, text=True)
    return r.returncode == 0 and "GL stack (up):  ok" in r.stdout


def bus(action, *args):
    subprocess.run(cmd("fakebus", action, *args), check=True, stdout=subprocess.DEVNULL)


def rootfs():
    if not os.access(CLI, os.X_OK):
        return None
    p = subprocess.run(cmd("path", "rootfs"), capture_output=True, text=True).stdout.strip()
    return p if p and os.path.isdir(p) else None

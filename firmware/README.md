# firmware/

Local drop folder for the GL.iNet firmware image the code is built against — **never committed**
(`.gitignore` keeps everything here except this file out of git).

```sh
tools/firmware.sh fetch      # e5800-4.10.0_release5-1092-0825-1787643675.zip, sha256-pinned (~370 MB)
tools/firmware.sh extract    # -> firmware/rootfs/ (~530 MB): the router's root filesystem
tools/firmware.sh info
```

The zip is GL's official OTA for the GL-E5800 (firmware 4.10.0, OpenWrt 23.05.4, target sdx75).
`extract` turns `system.new.dat` into an ext4 image (`reference/4.10/re-tools/sdat2img.py`) and
copies it out with `debugfs rdump` (no loop mount needed); the method and the tricks for GL's
section-less ELF libraries are in `reference/4.10/re-notes.md`.

What `firmware/rootfs/` is used for:
- **Answering questions about GL from the source of truth** — its Lua, JSON, minified JS chunks
  and binaries. Facts MudiModem relies on are written down in `docs/cellular-api-4.10.md`.
- **Emulation:** `tools/emu.sh` runs the image's own `lua`, `eco`, busybox `ash` + applets,
  `jsonfilter` and `nginx` on the dev box through `qemu-aarch64-static -L firmware/rootfs`;
  `tools/test-local.sh` uses it for the router-userland test passes.
- `reference/4.10/theme-vars.txt` (the CSS variables GL's theme defines) is generated from it.

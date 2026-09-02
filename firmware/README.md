# firmware/

Local drop folder for GL.iNet firmware images used for analysis — **not committed** (the
`.gitignore` keeps everything here except this file out of git).

Currently analysed: `e5800-4.10.0_release5-1092-0825-1787643675.zip` (GL-E5800, firmware 4.10.0,
OpenWrt 23.05.4, target sdx75). Everything MudiModem 2.x relies on from it is written down in
`docs/cellular-api-4.10.md`; GL's own files are copied under `reference/4.10/`, and the
unpacking / reverse-engineering method (sdat2img → debugfs, DTB from boot.img, section-less
ELF tricks) is in `reference/4.10/re-notes.md` with the scripts in `reference/4.10/re-tools/`.

## Extracted rootfs (dev box only)
`firmware/rootfs/` holds the ext4 contents of `e5800-4.10.0_release5` (`re-tools/sdat2img.py` +
`debugfs rdump`, see `reference/4.10/re-notes.md`), ~263 MB, gitignored like the OTA zip.
`tools/test-local.sh` uses it by default to run the Lua tests under the router's own `lua` +
`cjson.so` via `qemu-aarch64-static -L firmware/rootfs`, and it is what the static (readelf /
objdump / strings) analysis reads.

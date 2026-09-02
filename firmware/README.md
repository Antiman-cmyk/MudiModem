# firmware/

Local drop folder for GL.iNet firmware images used for analysis — **not committed** (the
`.gitignore` keeps everything here except this file out of git).

Currently analysed: `e5800-4.10.0_release5-1092-0825-1787643675.zip` (GL-E5800, firmware 4.10.0,
OpenWrt 23.05.4, target sdx75). Everything MudiModem 2.x relies on from it is written down in
`docs/cellular-api-4.10.md`; GL's own files are copied under `reference/4.10/`, and the
unpacking / reverse-engineering method (sdat2img → debugfs, DTB from boot.img, section-less
ELF tricks) is in `reference/4.10/re-notes.md` with the scripts in `reference/4.10/re-tools/`.

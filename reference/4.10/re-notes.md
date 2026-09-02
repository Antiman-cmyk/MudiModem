# 4.10 image reverse-engineering notes (2026-09-02)

How the facts in `docs/cellular-api-4.10.md` §6 were settled WITHOUT a box, so the next
question can be answered the same way. Scripts in `re-tools/` (dev-box only; need
`binutils`, `binutils-aarch64-linux-gnu`, `device-tree-compiler`, python3).

## Unpacking
- OTA zip → `system.new.dat` + `system.transfer.list` (v3) → `re-tools/sdat2img.py` → ext4 →
  `debugfs -R 'rdump /<dir> <dest>'` (loop mounts are blocked in the sandbox).
- `boot.img` carries 17 DTBs appended to the kernel: scan for `d00dfeed`, `dtc -I dtb -O dts`.
  The E5800 one says `model = "GL.iNet E5800, Qualcomm Technologies, Inc. SDXPINN IDP MBB"`.
- `NON-HLOS_*.bin` are FAT16 images of the baseband; `grep -a` finds the revision strings.

## GL's cellular libraries are section-less ELFs
`readelf -S` shows nothing; use `readelf -l -W` (PT_LOAD) for vaddr↔offset and
`readelf --use-dynamic -r -W` for RELATIVE relocs. `objdump` needs the RE segment dumped to
a raw file and `-b binary -m aarch64 --adjust-vma=<vaddr>` (`re-tools/strrefs.py` does this
and prints the ADRP+ADD string references in code order — the cheapest way to see which
object/method/key strings a stretch of code uses).

## What the binaries say about band config (the "can we skip glc?" question)
- `/cgi-bin/glc` dispatches a web RPC `modem.<method>` by `dlopen("<dir>/modem.so")` +
  `dlsym("<method>")` (strings: `%s/%s.so`, `dlsym: %s`, `glc call meth %s/%s`).
- `modem.so` links `libcm_modem.so`, which EXPORTS (`nm -D`): `get_band_config` (0x21834),
  `set_band_config` (0x223fc), `get_sim_config`, `set_sim_config`, `get_slot_failover_config`,
  `set_slot_failover_config`, `process_band_config`, `quectel_get/set_band_info`.
  ⇒ **`get/set_band_config` are in-process C functions, not ubus methods.** No dotted ubus
  object exposes them; the only transports are glc (what our backend uses) or the web `/rpc`.
- Inside them (string refs 0x20650–0x23fb0): `get_band_config` reads
  `cellular.modem get_feature_config` and re-keys `supports_band / band_enable /
  band_filter_mode / network_mode / band_list`; `set_band_config` writes
  `cellular.modem set_feature_config {bus, location_id, data}` (the per-slot store that 1.x's
  Path-B wrote by hand) and then applies to the module (`set_band_config_to_module` →
  `quectel_set_band_info` → `AT+QNWPREFCFG="<lte_band|nr5g_band|nsa_nr5g_band>",…` /
  `"mode_pref",%s`). Reproducing that ourselves over ubus would mean re-implementing GL's
  location_id lookup + reshaping — the fcgiwrap hop is cheaper than that risk. Decision:
  keep glc for band config and cell tower.
- Static `blobmsg_policy` arrays (`re-tools/policies.py`): `libcm_network.so` `{bus:STRING,
  slot:INT32}` (cell_info & friends); `modem_AT` `{cmd:STRING, timeout:INT32,
  source_flag:INT32, sub_id:INT32}` (+ `at_port`, `at_offset`, `level`, `action`); `modem.so`
  `{level, bus, main_type, base_type, sub_type, action, data, slot, interface}`. The band
  handlers parse their args by hand (no static policy for band_enable/band_list).
- `libcm_modem.so` also carries `AT+QUIMSLOT=%d` / `AT+QUIMSLOT?` templates (GL supports other
  modems with AT slot switching) and `AT+QNWLOCK="common/4g|5g"` + `save_ctrl` templates —
  GL's tower lock drives QNWLOCK itself.

## Other image-settled facts
- `lib/functions/modem.sh get_current_sim_slot`: `ubus -t 5 call cellular.modem status |
  jsonfilter '@.modems[@.bus=…].current_sim_slot'` — the no-arg form is `modems[]`-wrapped.
- `websocket/cellular.lua` merge: `simcard.dial_status = net.status` (connection enum);
  internet.js maps `{0:"active",1:"connecting"}`.
- cellular-detail.js maps: display `{2:"2G",3:"3G",4:"4G",41:"4G+",5:"5G SA",51:"5G NSA"}`,
  `hasRssi [4,41,51]`, `formatBand {4:"B",41:"B",5:"n",51:"n"}`; its `getNetworkType`
  string map has 5/51 swapped (GL bug).
- DTB: `/soc/backlight` (`pwm-backlight`, 120 levels) → `soc:backlight`; charger/gauge nodes
  `sgm41542S`, `sgm,sgm41600`, `cellwise,cw2217`, `qcom,battery-charger`, `awinic,aw35615`.
- Baseband in the OTA: NA `RG650VNA01ACR02A04G8G` (= the 4.8 box's), EU `RG650VEU00ADR02A04G8G`.
- busybox applets: no `pkill`; `pgrep pidof killall flock nohup setsid timeout` present.

## Additions 2026-09-02 (second pass — cell_info rows, tower lock, redial)
- `set/get/scan_cell_tower` are exported by **`libcm_network.so`** (0x11e18 / 0x12384 / 0x12b24),
  not `modem.so`: glc's `dlsym` on the modem.so handle resolves through its NEEDED chain. The
  `cellular.network cell_info` **server** handler is the static function @0x8284 (the exported
  `get_cell_info` @0x11858 is the ubus CLIENT stub); the Quectel filler is `libcm_modem.so`
  `quectel_get_qcainfo_signal` @0x2710c (`AT+QENG="servingcell"` @0x271dc, `AT+QCAINFO` @0x274ec).
- `re-tools/strrefs.py` runs `objdump -D` over the whole RE segment; on `libcm_modem.so` objdump
  aborts part-way (bad opcodes), so refs past that point are silently missing — disassemble a
  `--start-address/--stop-address` range when a function's refs look incomplete.
- With `qemu-user-static` installed, the image's own `lua`, `cjson.so` and `jsonfilter` run on the
  dev box: `qemu-aarch64-static -L <rootfs> <rootfs>/usr/bin/lua …` (qemu redirects absolute paths
  that exist under the rootfs). `tools/test-local.sh` uses this for the router-Lua test pass.

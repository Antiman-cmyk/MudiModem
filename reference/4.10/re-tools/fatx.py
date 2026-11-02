#!/usr/bin/env python3
"""Read-only FAT12/16 extractor for the OTA's NON-HLOS_*.bin (the RG650V baseband partition).

    python3 -I fatx.py <image> <dest-dir> [--list]

Copies every file (long names when present) under <dest-dir>, which must not exist yet.
No mounting (loop devices are blocked in the sandbox) and nothing executed: the image is data."""
import os, struct, sys


def main():
    img, dest = sys.argv[1], sys.argv[2]
    listing = "--list" in sys.argv
    f = open(img, "rb")
    bs = f.read(512)
    bps, spc, reserved, nfats, rootents, tot16, _, spf16 = struct.unpack_from("<HBHBHHBH", bs, 11)
    tot32, = struct.unpack_from("<I", bs, 32)
    total = tot16 or tot32
    root_secs = (rootents * 32 + bps - 1) // bps
    fat_off = reserved * bps
    root_off = (reserved + nfats * spf16) * bps
    data_off = root_off + root_secs * bps
    clusters = (total - (reserved + nfats * spf16 + root_secs)) // spc
    fat12 = clusters < 4085
    f.seek(fat_off); fat = f.read(spf16 * bps)
    csize = spc * bps

    def nxt(c):
        if fat12:
            v = struct.unpack_from("<H", fat, c + c // 2)[0]
            return (v >> 4) if c & 1 else (v & 0xFFF)
        return struct.unpack_from("<H", fat, c * 2)[0]

    def chain(c):
        end = 0xFF8 if fat12 else 0xFFF8
        seen = 0
        while 2 <= c < end and seen < clusters + 2:
            yield c
            c = nxt(c); seen += 1

    def read_chain(c, size=None):
        out = bytearray()
        for cl in chain(c):
            f.seek(data_off + (cl - 2) * csize); out += f.read(csize)
        return bytes(out[:size] if size is not None else out)

    def entries(raw):
        lfn = []
        for i in range(0, len(raw), 32):
            e = raw[i:i + 32]
            if e[0] == 0:
                break
            if e[0] == 0xE5:
                lfn = []; continue
            attr = e[11]
            if attr == 0x0F:
                part = e[1:11] + e[14:26] + e[28:32]
                lfn.insert(0, part.decode("utf-16-le", "ignore").split("\0")[0].replace("￿", ""))
                continue
            short = e[0:8].decode("latin-1").rstrip() + ("." + e[8:11].decode("latin-1").rstrip() if e[8:11].strip() else "")
            name = "".join(lfn) or short
            lfn = []
            if name in (".", "..") or attr & 0x08:
                continue
            cl = struct.unpack_from("<H", e, 26)[0]
            size = struct.unpack_from("<I", e, 28)[0]
            yield name, attr, cl, size

    os.makedirs(dest)

    def walk(raw, rel):
        for name, attr, cl, size in entries(raw):
            safe = name.replace("/", "_").replace("\\", "_")
            path = os.path.join(rel, safe)
            if attr & 0x10:
                if listing:
                    print("d", path)
                os.makedirs(os.path.join(dest, path), exist_ok=True)
                walk(read_chain(cl), path)
            else:
                if listing:
                    print("f %10d %s" % (size, path))
                with open(os.path.join(dest, path), "wb") as o:
                    o.write(read_chain(cl, size) if cl else b"")

    f.seek(root_off)
    walk(f.read(root_secs * bps), "")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Indirect calls of one function in a section-less aarch64 ELF, named: GL's libraries call
everything through the GOT (adrp xN, page; ldr xN, [xN, #off]; blr xN), so a plain `bl` scan
finds nothing. Resolves each blr target through the GLOB_DAT/JUMP_SLOT relocations.

    python3 -I gotcalls.py <elf> <function-name> [--strings]"""
import re, subprocess, sys, tempfile
path, fn = sys.argv[1], sys.argv[2]
data = open(path, "rb").read()
syms = {}
for l in subprocess.run(["aarch64-linux-gnu-nm", "-D", path], capture_output=True, text=True).stdout.splitlines():
    p = l.split()
    if len(p) == 3 and p[1] in "Tt":
        syms[p[2]] = int(p[0], 16)
starts = sorted(syms.values())
s = syms[fn]; e = min([x for x in starts if x > s] + [s + 0x4000])
rel = {}
for l in subprocess.run(["readelf", "--use-dynamic", "-r", "-W", path], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r"\s*([0-9a-f]+)\s+\S+\s+R_AARCH64_(?:GLOB_DAT|JUMP_SLOT|ABS64)\s+\S+\s+(\S+)", l)
    if m:
        rel[int(m.group(1), 16)] = m.group(2)
with tempfile.NamedTemporaryFile(suffix=".bin") as t:
    t.write(data); t.flush()
    dis = subprocess.run(["aarch64-linux-gnu-objdump", "-D", "-b", "binary", "-m", "aarch64",
                          "--start-address=0x%x" % s, "--stop-address=0x%x" % e, t.name], capture_output=True, text=True).stdout
strs = {m.start(): m.group(0)[:-1].decode() for m in re.finditer(rb"[\x20-\x7e]{3,80}\0", data)}
page, val = {}, {}
for line in dis.splitlines():
    m = re.match(r"\s*([0-9a-f]+):\s+[0-9a-f]+\s+(\w+)\s+(.*)", line)
    if not m:
        continue
    a, op, args = int(m.group(1), 16), m.group(2), m.group(3)
    if op == "adrp":
        r, v = args.split(", "); page[r] = int(v, 16)
    elif op == "ldr":
        mm = re.match(r"(x\d+), \[(x\d+), #(\d+)\]", args)
        if mm and mm.group(2) in page:
            val[mm.group(1)] = ("got", page[mm.group(2)] + int(mm.group(3)))
    elif op == "add":
        mm = re.match(r"(x\d+), (x\d+), #0x([0-9a-f]+)", args)
        if mm and mm.group(2) in page:
            tgt = page[mm.group(2)] + int(mm.group(3), 16)
            if "--strings" in sys.argv and tgt in strs:
                print("%08x   str %r" % (a, strs[tgt]))
    elif op == "blr":
        r = args.strip()
        if r in val and val[r][0] == "got":
            print("%08x call %s" % (a, rel.get(val[r][1], hex(val[r][1]))))

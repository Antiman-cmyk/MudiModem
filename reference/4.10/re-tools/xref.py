#!/usr/bin/env python3
"""Disassemble a section-less aarch64 ELF's RE segment with ADRP+ADD string
annotations and PLT-call names. Usage:
  xref.py <elf> find <substring>          -> code addresses referencing strings containing it
  xref.py <elf> dis <start_hex> <end_hex> -> annotated disassembly
"""
import re, subprocess, sys, tempfile, os

path = sys.argv[1]
data = open(path, 'rb').read()
segs = []
for line in subprocess.run(['aarch64-linux-gnu-readelf', '-l', '-W', path], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r'\s*LOAD\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+0x[0-9a-f]+\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S.*?)\s+0x', line)
    if m:
        segs.append((int(m.group(1), 16), int(m.group(2), 16), int(m.group(3), 16), m.group(5)))
re_seg = [s for s in segs if 'E' in s[3]][0]
off, vaddr, size, _ = re_seg

def v2o(v):
    for o, va, sz, fl in segs:
        if va <= v < va + sz:
            return o + (v - va)
    return None

def cstr(v):
    o = v2o(v)
    if o is None:
        return None
    e = data.find(b'\0', o)
    if e < 0 or e - o > 200:
        return None
    s = data[o:e]
    if len(s) < 2 or not all(32 <= c < 127 or c in (9, 10, 13) for c in s):
        return None
    return s.decode('latin1')

# PLT/GOT names: map GOT slot vaddr -> symbol via relocations
got = {}
for line in subprocess.run(['aarch64-linux-gnu-readelf', '--use-dynamic', '-r', '-W', path], capture_output=True, text=True).stdout.splitlines():
    m = re.match(r'\s*([0-9a-f]{8,16})\s+[0-9a-f]+\s+R_AARCH64_(?:JUMP_SLOT|GLOB_DAT)\s+[0-9a-f]+\s+(\S+)', line)
    if m:
        got[int(m.group(1), 16)] = m.group(2)

with tempfile.NamedTemporaryFile(suffix='.bin', delete=False) as f:
    f.write(data[off:off + size])
    segf = f.name

def disasm(a=None, b=None):
    cmd = ['aarch64-linux-gnu-objdump', '-D', '-b', 'binary', '-m', 'aarch64', '--adjust-vma=0x%x' % vaddr]
    if a is not None:
        cmd += ['--start-address=0x%x' % a, '--stop-address=0x%x' % b]
    return subprocess.run(cmd + [segf], capture_output=True, text=True).stdout

def annotate(out):
    regs = {}
    res = []
    for line in out.splitlines():
        m = re.match(r'\s*([0-9a-f]+):\s+[0-9a-f]+\s+(\S+)\s*(.*)', line)
        if not m:
            continue
        a, op, args = int(m.group(1), 16), m.group(2), m.group(3)
        note = ''
        if op == 'adrp':
            mm = re.match(r'(x\d+), 0x([0-9a-f]+)', args)
            if mm:
                regs[mm.group(1)] = int(mm.group(2), 16)
        elif op == 'add':
            mm = re.match(r'(x\d+), (x\d+), #0x([0-9a-f]+)', args)
            if mm and mm.group(2) in regs:
                t = regs[mm.group(2)] + int(mm.group(3), 16)
                s = cstr(t)
                note = '  ; "%s"' % s if s else '  ; =0x%x' % t
        elif op == 'ldr':
            mm = re.match(r'(x\d+), \[(x\d+), #(\d+)\]', args)
            if mm and mm.group(2) in regs:
                t = regs[mm.group(2)] + int(mm.group(3))
                if t in got:
                    note = '  ; got:%s' % got[t]
        res.append((a, op, args, note))
    return res

if sys.argv[2] == 'find':
    want = sys.argv[3]
    for a, op, args, note in annotate(disasm()):
        if want in note:
            print('0x%x %s %s%s' % (a, op, args, note))
else:
    a, b = int(sys.argv[3], 16), int(sys.argv[4], 16)
    for x in annotate(disasm(a, b)):
        print('0x%x %-6s %s%s' % x)
os.unlink(segf)

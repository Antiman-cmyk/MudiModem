#!/usr/bin/env python3
"""Linear sequence of string references (ADRP+ADD) in the RE segment of a
section-less aarch64 ELF, filtered to strings of interest."""
import re, subprocess, sys
path=sys.argv[1]; want=set(sys.argv[2:])
data=open(path,'rb').read()
seg=None
for line in subprocess.run(['readelf','-l','-W',path],capture_output=True,text=True).stdout.splitlines():
    m=re.match(r'\s*LOAD\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+0x[0-9a-f]+\s+0x([0-9a-f]+)\s+0x[0-9a-f]+\s+R E',line)
    if m: seg=(int(m.group(1),16),int(m.group(2),16),int(m.group(3),16)); break
off,vaddr,size=seg
open('seg.bin','wb').write(data[off:off+size])
dis=subprocess.run(['aarch64-linux-gnu-objdump','-D','-b','binary','-m','aarch64','--adjust-vma=0x%x'%vaddr,'seg.bin'],capture_output=True,text=True).stdout
# strings table: vaddr -> string
strs={}
for m in re.finditer(rb'[\x20-\x7e]{3,60}\0',data[off:off+size]):
    strs[vaddr+m.start()]=m.group(0)[:-1].decode()
regs={}
out=[]
for line in dis.splitlines():
    m=re.match(r'\s*([0-9a-f]+):\s+[0-9a-f]+\s+(\w+)\s+(.*)',line)
    if not m: continue
    a=int(m.group(1),16); op=m.group(2); args=m.group(3)
    if op=='adrp':
        mm=re.match(r'(x\d+), ([0-9a-fx]+)',args)
        if mm: regs[mm.group(1)]=int(mm.group(2),16)
    elif op=='add':
        mm=re.match(r'(x\d+), (x\d+), #0x([0-9a-f]+)',args)
        if mm and mm.group(2) in regs:
            tgt=regs[mm.group(2)]+int(mm.group(3),16)
            s=strs.get(tgt)
            if s and (not want or s in want): out.append((a,s))
    elif op in ('bl','b','ret'):
        pass
for a,s in out: print('%08x %s'%(a,s))

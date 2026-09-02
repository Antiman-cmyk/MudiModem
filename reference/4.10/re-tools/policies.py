#!/usr/bin/env python3
"""Enumerate static blobmsg_policy arrays ({name*, type} x N) in an aarch64 ELF via RELATIVE relocs."""
import re, struct, subprocess, sys
BT = {0:'UNSPEC',1:'ARRAY',2:'TABLE',3:'STRING',4:'INT64',5:'INT32',6:'INT16',7:'INT8',8:'DOUBLE',9:'BOOL'}
def run(*a): return subprocess.run(a, capture_output=True, text=True).stdout
path=sys.argv[1]; data=open(path,'rb').read()
segs=[]
for line in run('readelf','-l','-W',path).splitlines():
    m=re.match(r'\s*LOAD\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+0x[0-9a-f]+\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+([RWE ]+?)\s+0x',line)
    if m: segs.append((int(m.group(2),16),int(m.group(1),16),int(m.group(3),16)))
def v2f(v):
    for a,o,s in segs:
        if a<=v<a+s: return o+(v-a)
rel={}
for line in run('readelf','--use-dynamic','-r','-W',path).splitlines():
    m=re.match(r'\s*([0-9a-f]+)\s+[0-9a-f]+\s+R_AARCH64_RELATIVE\s+([0-9a-f]+)',line)
    if m: rel[int(m.group(1),16)]=int(m.group(2),16)
def cstr(v):
    f=v2f(v)
    if f is None or f>=len(data): return None
    e=data.find(b'\0',f); s=data[f:e]
    if not s or len(s)>40 or any(c<32 or c>126 for c in s): return None
    return s.decode()
def u32(v):
    f=v2f(v); return struct.unpack('<I',data[f:f+4])[0] if f is not None and f+4<=len(data) else None
def is_pol(o):
    if o not in rel: return False
    n=cstr(rel[o]); t=u32(o+8)
    return bool(n) and t is not None and 0<=t<=9 and u32(o+12)==0 and (o+8) not in rel
seen=set(); arrays=[]
for o in sorted(rel):
    if o in seen or not is_pol(o): continue
    st=o
    while is_pol(st-16): st-=16
    en=st; items=[]
    while is_pol(en):
        seen.add(en); items.append('%s:%s'%(cstr(rel[en]),BT[u32(en+8)])); en+=16
    if len(items)>=1: arrays.append((st,items))
for st,items in arrays:
    print('0x%05x  %s'%(st,' '.join(items)))

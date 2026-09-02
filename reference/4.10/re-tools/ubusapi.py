#!/usr/bin/env python3
"""Recover ubus object/method/arg tables from an aarch64 .so via RELATIVE relocs."""
import re, struct, subprocess, sys
BT = {0:'UNSPEC',1:'ARRAY',2:'TABLE',3:'STRING',4:'INT64',5:'INT32',6:'INT16',7:'INT8',8:'DOUBLE',9:'BOOL'}
def run(*a): return subprocess.run(a, capture_output=True, text=True).stdout
def analyze(path):
    data = open(path,'rb').read()
    # section headers are stripped in GL's libs: map through PT_LOAD segments
    segs = []
    for line in run('readelf','-l','-W',path).splitlines():
        m = re.match(r'\s*LOAD\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+0x[0-9a-f]+\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+([RWE ]+?)\s+0x', line)
        if m: segs.append((int(m.group(2),16), int(m.group(1),16), int(m.group(3),16), m.group(5)))
    def v2f(v):
        for a,o,s,fl in segs:
            if a<=v<a+s: return o+(v-a)
        return None
    text = [(a,a+s) for a,o,s,fl in segs if 'E' in fl][0]
    rel = {}
    for line in run('readelf','--use-dynamic','-r','-W',path).splitlines():
        m = re.match(r'\s*([0-9a-f]+)\s+[0-9a-f]+\s+R_AARCH64_RELATIVE\s+([0-9a-f]+)', line)
        if m: rel[int(m.group(1),16)] = int(m.group(2),16)
    def cstr(v):
        f = v2f(v)
        if f is None or f>=len(data): return None
        e = data.find(b'\0', f)
        s = data[f:e]
        try: return s.decode()
        except: return None
    def u32(v):
        f=v2f(v); return struct.unpack('<I', data[f:f+4])[0] if (f is not None and f+4<=len(data)) else None
    def is_method(o):
        return o in rel and cstr(rel[o]) and (o+8) in rel and text[0]<=rel[o+8]<text[1]
    seen=set(); tables=[]
    for o in sorted(rel):
        if o in seen or not is_method(o): continue
        # walk to table start
        start=o
        while is_method(start-40): start-=40
        end=start
        while is_method(end+40): end+=40
        methods=[]
        for m in range(start,end+1,40):
            seen.add(m)
            name=cstr(rel[m]); pol=rel.get(m+24); npol=u32(m+32) or 0
            args=[]
            if pol and npol<64:
                for i in range(npol):
                    an=cstr(rel.get(pol+16*i,0)) if (pol+16*i) in rel else None
                    at=u32(pol+16*i+8)
                    if an: args.append('%s:%s'%(an,BT.get(at,at)))
            methods.append((name,args))
        # object type name: struct ubus_object_type {name; id; methods; n_methods} -> methods ptr at +16
        objname=None
        for ro,ra in rel.items():
            if ra==start:
                for back in (16,):
                    n=cstr(rel.get(ro-back)) if (ro-back) in rel else None
                    if n: objname=n
        tables.append((objname,methods))
    return tables
for p in sys.argv[1:]:
    print('=====', p)
    for objname, methods in analyze(p):
        if len(methods)<2: continue
        print('--- object:', objname or '?')
        for n,a in methods: print('   %-28s %s'%(n, ' '.join(a)))

#!/usr/bin/env python3
"""Disassemble GL's precompiled Lua 5.1 plugins (LuaQ, OpenWrt LNUM: integer constants are
type 9, int32). Prints every function whose constants include STRING, with its locals and
decoded instructions — enough to read which args feed a command string.
Usage: luaq.py <bytecode file> <string constant>"""
import struct, sys
OPS = ("MOVE LOADK LOADBOOL LOADNIL GETUPVAL GETGLOBAL GETTABLE SETGLOBAL SETUPVAL SETTABLE "
       "NEWTABLE SELF ADD SUB MUL DIV MOD POW UNM NOT LEN CONCAT JMP EQ LT LE TEST TESTSET CALL "
       "TAILCALL RETURN FORLOOP FORPREP TFORLOOP SETLIST CLOSE CLOSURE VARARG").split()
ABX, ASBX = {"LOADK", "GETGLOBAL", "SETGLOBAL", "CLOSURE"}, {"JMP", "FORLOOP", "FORPREP"}
data = open(sys.argv[1], 'rb').read(); pos = 12          # 12-byte LuaQ header
def take(fmt):
    global pos
    v = struct.unpack_from(fmt, data, pos)[0]; pos += struct.calcsize(fmt); return v
def lstr():
    global pos
    n = take('<I'); v = data[pos:pos + n - 1].decode('latin1') if n else None; pos += n; return v
KONST = {0: lambda: None, 1: lambda: bool(take('<B')), 3: lambda: take('<d'), 4: lstr, 9: lambda: take('<i')}
out = []
def func(path):
    lstr(); take('<i'); take('<i'); take('<4B')
    code = [take('<I') for _ in range(take('<i'))]
    ks = [KONST[take('<B')]() for _ in range(take('<i'))]
    for i in range(take('<i')): func(path + [i])
    take('<%di' % take('<i'))                             # line info
    locs = []
    for _ in range(take('<i')): locs.append(lstr()); take('<i'); take('<i')
    for _ in range(take('<i')): lstr()                    # upvalue names
    out.append((path, code, ks, locs))
try: func([])
except struct.error: pass   # GL's dumps can end short in the main chunk's debug tail; nested functions are complete
rk = lambda x, ks: repr(ks[x - 256]) if x >= 256 else 'r%d' % x
for path, code, ks, locs in out:
    if sys.argv[2] not in ks: continue
    print('== function', path, 'locals:', locs)
    for pc, ins in enumerate(code):
        op = OPS[ins & 0x3F]; a = (ins >> 6) & 0xFF; c = (ins >> 14) & 0x1FF; b = ins >> 23; bx = ins >> 14
        if op in ABX: arg = '%d %s' % (a, bx if op == 'CLOSURE' else repr(ks[bx]))
        elif op in ASBX: arg = '%d ->%d' % (a, pc + 1 + bx - 131071)
        else: arg = '%d %s %s' % (a, rk(b, ks), rk(c, ks))
        print('  %4d %-9s %s' % (pc, op, arg))

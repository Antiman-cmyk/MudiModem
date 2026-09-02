#!/usr/bin/env python3
"""Minimal sdat2img: rebuild ext4 image from system.transfer.list + system.new.dat."""
import sys

BLOCK = 4096
tl, dat, out = sys.argv[1], sys.argv[2], sys.argv[3]

with open(tl) as f:
    lines = [l.strip() for l in f if l.strip()]
version = int(lines[0])
total_blocks = int(lines[1])
# version >= 2: lines[2] = stash entries, lines[3] = max stash blocks
cmds = lines[4:] if version >= 2 else lines[2:]

max_block = 0
ops = []
for line in cmds:
    parts = line.split(' ', 1)
    cmd = parts[0]
    if cmd != 'new':
        continue
    nums = [int(x) for x in parts[1].split(',')]
    count, pairs = nums[0], nums[1:]
    assert count == len(pairs)
    ranges = [(pairs[i], pairs[i + 1]) for i in range(0, count, 2)]
    ops.append(ranges)
    for _, e in ranges:
        max_block = max(max_block, e)

with open(dat, 'rb') as fin, open(out, 'wb') as fout:
    fout.truncate(max(max_block, total_blocks) * BLOCK)
    for ranges in ops:
        for begin, end in ranges:
            fout.seek(begin * BLOCK)
            remaining = (end - begin) * BLOCK
            while remaining:
                chunk = fin.read(min(remaining, 1 << 22))
                assert chunk
                fout.write(chunk)
                remaining -= len(chunk)
print(f"done: {max(max_block, total_blocks)} blocks -> {out}")

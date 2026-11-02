#!/usr/bin/env python3
"""Catch syslog datagrams on <path> (the chroot's /dev/log) and append them to <out>, one per line."""
import os, socket, sys
path, out = sys.argv[1], sys.argv[2]
try:
    os.unlink(path)
except OSError:
    pass
s = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
s.bind(path)
with open(out, "ab", buffering=0) as f:
    while True:
        f.write(s.recv(65536).rstrip(b"\0\n") + b"\n")

#!/usr/bin/env python3
"""Stands in for the `ubus` CLI in at_console tests: answers
`ubus -t N call modem.CPU.AT get_result_AT '<json>'` the way GL's modem_AT
does ({"data": "<the module's lines>"}), and logs every call so the test can
assert on argv and the request. It NEVER touches a real bus.

State lives in $MM_TMP (required):
  fake-ubus.mode  "absent" -> exit 4, as ubus does when modem_AT isn't
                  registered (GL's cellular stack down)
  fake-ubus.log   one JSON line per call: {"argv": [...], "req": {...}}
Per-command branches (substring of the AT command):
  __ERR__ -> ERROR   __CME__ -> +CME ERROR: 10   __NOTERM__ -> no final code
  __HANG__ -> exit 249 (timeout: the real CLI exits -7 as a byte on an invoke
              failure)   __GONE__ -> exit 4 (stack died mid-run)
Anything else -> OK, with the request echoed back as REQ:<json>.
"""
import json, os, sys

tmp = os.environ.get("MM_TMP")
if not tmp:
    print("fake-ubus-at: MM_TMP not set", file=sys.stderr)
    sys.exit(99)
try:
    mode = open(os.path.join(tmp, "fake-ubus.mode")).read().strip()
except OSError:
    mode = ""
argv = sys.argv[1:]
req = {}
try:
    req = json.loads(argv[-1])
except (ValueError, IndexError):
    pass
with open(os.path.join(tmp, "fake-ubus.log"), "a") as f:
    f.write(json.dumps({"argv": argv, "req": req}) + "\n")

if mode == "absent":
    sys.exit(4)
if argv[:1] != ["-t"] or argv[2:5] != ["call", "modem.CPU.AT", "get_result_AT"]:
    sys.exit(2)                                   # UBUS_STATUS_INVALID_ARGUMENT
cmd = req.get("cmd", "")
if "__HANG__" in cmd:
    sys.exit(249)
if "__GONE__" in cmd:
    sys.exit(4)
if "__ERR__" in cmd:
    data = "\r\nERROR\r\n"
elif "__CME__" in cmd:
    data = "\r\n+CME ERROR: 10\r\n"
elif "__NOTERM__" in cmd:
    data = "\r\n+PARTIAL: 1\r\n"
else:
    data = "\r\nREQ:" + json.dumps(req, sort_keys=True) + "\r\n\r\nOK\r\n"
print(json.dumps({"data": data}, indent="\t"))   # the ubus CLI pretty-prints

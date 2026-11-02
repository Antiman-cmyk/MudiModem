-- test/emu/speedtest-driver.lua — one speed test through src/lib/mudimodemd/speedtest.lua outside
-- the daemon (tools/verify.sh's live check, with MUDIMODEM_ST_HIST / _STATUS pointing at temp files
-- so a check never lands in the user's history):  eco speedtest-driver.lua <lib dir> <iface>
-- Prints the result (or {error}) as JSON; exit 0 only for a result.
package.path = arg[1] .. "/?.lua;" .. package.path
local cjson = require "cjson"
local ubus = require "eco.ubus"
local cc = require "cellular_compat"
cc.init(cjson.null)
local speedtest = require "mudimodemd.speedtest"
local conn = assert(ubus.connect(os.getenv("MUDIMODEM_UBUS_SOCK")))
conn:settimeout(8)
local r = speedtest.new(conn, speedtest.config()).run({ iface = arg[2], trigger = "manual" })
io.write(cjson.encode(r), "\n")
eco.unloop()
os.exit(r.error and 1 or 0)

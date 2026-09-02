-- On-box: the first row of the speedtest history at arg[1] must carry a real result.
local c = require("cjson")
local f = assert(io.open(arg[1], "r"), "cannot open " .. tostring(arg[1]))
local d = c.decode(f:read("*l")); f:close()
assert(d.down_mbps and d.down_mbps > 0, "down_mbps")
assert(d.up_mbps and d.up_mbps > 0, "up_mbps")
assert(d.latency_ms, "latency_ms")
assert(d.carrier, "carrier")

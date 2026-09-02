-- On-box: the newest battery sample must be fresh (< 60 s) and carry cap + cur.
local f = assert(io.open("/tmp/mudimodem/battery.jsonl", "r"), "no battery.jsonl")
local last
for l in f:lines() do last = l end
f:close()
assert(last, "battery.jsonl is empty")
local o = require("cjson").decode(last)
local age = (os.time() * 1000) - o.t
assert(age <= 60000, "newest battery sample is " .. tostring(age) .. " ms old")
assert(o.cap ~= nil and o.cur ~= nil, "battery sample lacks cap/cur")

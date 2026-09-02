-- On-box: the decompressed AT library at arg[1] must decode with a non-empty entries[].
local c = require("cjson")
local f = assert(io.open(arg[1], "r"), "cannot open " .. tostring(arg[1]))
local d = c.decode(f:read("*a")); f:close()
assert(type(d.entries) == "table" and #d.entries > 0, "library has no entries")

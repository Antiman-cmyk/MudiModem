-- On-box: the file at arg[1] must be valid JSON (a malformed menu JSON breaks
-- ui.get_menu_list for EVERY page). Shipped by verify.sh, never inlined.
local c = require("cjson")
local f = assert(io.open(arg[1], "r"), "cannot open " .. tostring(arg[1]))
local body = f:read("*a"); f:close()
assert(#body > 0, arg[1] .. " is empty")
c.decode(body)

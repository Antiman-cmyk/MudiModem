-- test/emu/atport-driver.lua — one direct-port AT run through src/lib/mudimodemd/atport.lua, for
-- test/atport-emu.test.py:  eco atport-driver.lua <lib dir> <port> <state file> <timeout> <cmd>...
-- Prints the result table as JSON.
package.path = arg[1] .. "/?.lua;" .. package.path
local cjson = require "cjson"
local atport = require "mudimodemd.atport"
local steps = {}
for i = 5, #arg do steps[#steps + 1] = arg[i] end
local p = atport.new({ port = arg[2], state = arg[3] })
io.write(cjson.encode(p.run(steps, tonumber(arg[4]))), "\n")
eco.unloop()

-- eco shared-trim.lua <lib dir> <file> <stop file>: trim <file> in shared mode (as mudimodemd
-- trims events.jsonl) over and over, each time cutting at the newest t minus 50, until <stop
-- file> appears — while test/collectd-emu.test.py appends to it from another process.
package.path = arg[1] .. "/?.lua;" .. package.path
local time = require "eco.time"
local jsonl = require "mudimodemd.jsonl"
jsonl.sleep = time.sleep
local n = 0
while not io.open(arg[3], "r") do
  local last = jsonl.last_t_in_file(arg[2])
  if last then jsonl.trim(arg[2], 50, 1000000, last, true); n = n + 1 end
  time.sleep(0.01)
end
io.write(n, "\n")

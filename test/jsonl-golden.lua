-- Runs src/lib/mudimodemd/{jsonl,battery}.lua over the cases test/jsonl-golden.test.py writes:
--   lua jsonl-golden.lua <cases.json> <base dir>     (case i works in <base dir>/<i>, "{D}" in args)
-- Prints one JSON array of each case's return values. Host lua5.1, router lua and router eco.
local dir = (arg[0]:match("^(.*)/[^/]*$") or ".") .. "/../src/lib/"
package.path = dir .. "?.lua;" .. package.path
local cjson = require "cjson"
local cc = require "cellular_compat"
cc.init(cjson.null)
local jsonl = require "mudimodemd.jsonl"
local battery = require "mudimodemd.battery"
local f = assert(io.open(arg[1], "r")); local cases = cjson.decode(f:read("*a")); f:close()
local FN = {
  trim = jsonl.trim, rotate_segment = jsonl.rotate_segment, seed_tmp_from_persist = jsonl.seed_tmp_from_persist,
  flush_new_lines = jsonl.flush_new_lines, max_t_in_file = jsonl.max_t_in_file,
  first_t_in_file = jsonl.first_t_in_file, last_t_in_file = jsonl.last_t_in_file,
  read_history_config = jsonl.read_history_config, read_battery = battery.read_battery,
  read_limiter = battery.read_limiter,
}
local function subst(v, d)
  if type(v) == "string" then return (v:gsub("{D}", d)) end
  if type(v) == "table" then local o = {}; for k, x in pairs(v) do o[k] = subst(x, d) end; return o end
  if v == cjson.null then return nil end
  return v
end
local UNPACK = unpack or table.unpack
local res = {}
for i, c in ipairs(cases) do
  local d = arg[2] .. "/" .. i
  local a = {}
  for k = 1, c.n do a[k] = subst(c.args[k], d) end
  local r = { FN[c.fn](UNPACK(a, 1, c.n)) }
  local o = {}
  for k = 1, (c.nret or 1) do o[k] = (r[k] == nil) and cjson.null or r[k] end
  res[i] = o
end
io.write(cjson.encode(res))

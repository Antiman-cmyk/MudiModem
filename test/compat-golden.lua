-- Runs src/lib/cellular_compat.lua over the cases test/compat-golden.test.py writes, prints JSON.
-- Works under the host's lua5.1, the router's lua (5.1, LNUM) and the router's eco (5.4).
local dir = (arg[0]:match("^(.*)/[^/]*$") or ".") .. "/../src/lib/"
package.path = dir .. "?.lua;" .. package.path
local cjson = require "cjson"
local cc = require "cellular_compat"
cc.init(cjson.null)
local f = assert(io.open(arg[1], "r")); local cases = cjson.decode(f:read("*a")); f:close()
local EMPTY = (cjson.empty_array ~= nil) and cjson.empty_array or nil
local res = {}
for i, c in ipairs(cases) do
  local a = c.args
  local function A(k) local v = a[k]; if v == cjson.null then return nil end return v end
  local r
  if c.fn == "build_sample" then
    r = cc.build_sample(A(1), A(2), A(3), A(4), A(5), A(6), EMPTY)
    if r and (r.signals == EMPTY or (type(r.signals) == "table" and #r.signals == 0)) then r.signals = "[]" end   -- empty-array marker, comparable across hosts
  elseif c.fn == "cell_info_failed" then r = cc.cell_info_failed(A(1))
  elseif c.fn == "nr_arfcn_to_mhz" then r = cc.nr_arfcn_to_mhz(A(1))
  elseif c.fn == "lte_earfcn_to_mhz" then r = cc.lte_earfcn_to_mhz(A(1), A(2))
  elseif c.fn == "format_band" then r = cc.format_band(A(1), A(2))
  elseif c.fn == "active_slot" then r = cc.active_slot(A(1))
  end
  res[i] = (r == nil) and cjson.null or r
end
io.write(cjson.encode(res))

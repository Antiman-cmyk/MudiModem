-- mudimodemd/battery.lua — one battery sample from sysfs (no ubus, no AT: nothing that can
-- contend with the modem channel). A port of read_battery / read_limiter in
-- src/sbin/mudimodem-collectd, whose comments carry the evidence for every unit below;
-- test/jsonl-parity.test.py compares both on the same fake sysfs trees. Lua 5.1/5.4 subset.
--
-- UNITS ARE PER NODE: voltage_now uV -> mV, temp deci-C -> C, current_now is ALREADY mA (signed:
-- + charging, - discharging, 0 = charging blocked). `cap` is the RAW gauge %. `lim`/`lim_gauge`
-- record glbattlimit's state per sample: the charger reports Full/Trickle both when the cell is
-- full and when the limiter holds charge off, so only the limiter's own pid/limit files tell
-- the two apart.
local cc = require "cellular_compat"

local M = {}

-- Is pid a live process? (the Python version's `kill -0`; /proc answers the same for root, and
-- needs no signal API in plain Lua). Replaceable for tests.
function M.alive(pid)
  local f = io.open("/proc/" .. pid .. "/stat", "r")
  if f then f:close(); return true end
  return false
end

local function readfile(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a"); f:close()
  if s == nil then return nil end
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local num = cc.num                 -- number | nil ("" / junk / the -32768 sentinel -> nil)

-- (running 0|1, target gauge % or nil)
function M.read_limiter(pidf, limf)
  local running = 0
  local raw = readfile(pidf)
  local pid = raw and raw:match("^[+-]?%d+$") and tonumber(raw) or 0
  if pid > 0 and M.alive(pid) then running = 1 end
  local target = num(readfile(limf))
  if target ~= nil then target = target >= 0 and math.floor(target) or -math.floor(-target) end
  return running, target
end

local function out(v) if v == nil then return cc.null end return v end

-- One sample, or nil when the fuel gauge is unreadable (not this hardware: no file at all
-- rather than a file full of nulls).
function M.read_battery(root, t, pidf, limf)
  local bat, chg = root .. "/cw221X-bat/", root .. "/charger/"
  local cap = num(readfile(bat .. "capacity"))
  if cap == nil then return nil end
  local volt = num(readfile(bat .. "voltage_now"))
  local temp = num(readfile(bat .. "temp"))
  if temp ~= nil then
    if temp == math.floor(temp) then temp = temp / 10
    else temp = math.floor(temp + 0.5) / 10 end
  end
  local lim, lim_gauge = M.read_limiter(pidf, limf)
  local online = num(readfile(chg .. "online")) or 0
  online = online >= 0 and math.floor(online) or -math.floor(-online)
  local function str(p) local s = readfile(p); return (s and s ~= "") and s or "" end
  return {
    t = t,
    cap = cap,
    volt = out(volt and math.floor(volt / 1000) or nil),
    cur = out(num(readfile(bat .. "current_now"))),
    temp = out(temp),
    online = online,
    status = str(chg .. "status"),
    ctype = str(chg .. "charge_type"),
    cycles = out(num(readfile(bat .. "cycle_count"))),
    health = str(bat .. "health"),
    lim = lim,
    lim_gauge = out(lim_gauge),
  }
end

return M

-- Isolation test: a speed-test status that says `running` while no test is
-- (tool killed / crashed / never started) must not disable Run forever.
-- Real /proc, real processes: a script whose path names the tool stands in for
-- a live run, a plain `sleep` for a recycled pid. No ubus, no network.
-- Env (set by the runner): MUDIMODEM_SPEEDTEST_STATUS, MM_PLUGIN
local cjson = require "cjson"
local STATUS = assert(os.getenv("MUDIMODEM_SPEEDTEST_STATUS"), "set MUDIMODEM_SPEEDTEST_STATUS")
package.loaded["oui.ubus"] = { call = function() return {} end }
local M = dofile(assert(os.getenv("MM_PLUGIN")))

local dir = os.tmpname(); os.remove(dir); os.execute("mkdir -p " .. dir)
local fake = dir .. "/mudimodem-speedtest-fake.sh"
local f = io.open(fake, "w"); f:write("sleep 30\n"); f:close()
local function spawn(cmd)
  local p = io.popen(cmd .. " >/dev/null 2>&1 & echo $!"); local pid = tonumber(p:read("*a")); p:close()
  return pid
end
local function put(obj) local h = io.open(STATUS, "w"); h:write(cjson.encode(obj)); h:close() end
local live, other = spawn("sh " .. fake), spawn("sleep 30")
os.execute("sleep 0.2")

-- 1. our tool's pid is alive: still running.
put({ running = true, phase = "download", pid = live, started = os.time() - 20 })
assert(M.get_speedtest_status({}).running == true, "a live run must stay running")
assert(M.run_speedtest({ iface = "vpn" }).error, "iface check first")

-- 2. the pid is alive but is NOT our tool (recycled): stale.
put({ running = true, phase = "latency", pid = other, started = os.time() - 20 })
local st = M.get_speedtest_status({})
assert(st.running == false and st.phase == "error" and st.error, "a recycled pid is not a run: " .. cjson.encode(st))
assert(cjson.decode(io.open(STATUS):read("*a")).running == false, "the stale status is rewritten on disk")

-- 3. the pid is gone: stale.
os.execute("kill " .. live .. " 2>/dev/null"); os.execute("sleep 0.2")
put({ running = true, phase = "upload", pid = live, started = os.time() - 20 })
assert(M.get_speedtest_status({}).running == false, "a dead pid is not a run")

-- 4. our "starting" stub (no pid yet): running within the grace, stale after it.
put({ running = true, phase = "starting", started = os.time() - 5 })
assert(M.get_speedtest_status({}).running == true, "the tool gets a grace to write its pid")
put({ running = true, phase = "starting", started = os.time() - 120 })
assert(M.get_speedtest_status({}).running == false, "a tool that never started is not a run")
put({ running = true, phase = "starting" })
assert(M.get_speedtest_status({}).running == false, "an unstamped running status is not trusted")

-- 5. terminal statuses pass through untouched.
put({ running = false, phase = "done", result = { dl = 1 } })
assert(M.get_speedtest_status({}).phase == "done")

os.execute("kill " .. other .. " 2>/dev/null"); os.execute("rm -rf " .. dir)
print("backend-ststatus OK")

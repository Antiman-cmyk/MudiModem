-- On-device isolation test for mudimodem.app_version + device_info.
-- dofiles the REAL plugin with oui.ubus shimmed: device_info calls ubus system board, and
-- app_version asks mudimodemd for a `version_fetch` job — the shim plays the daemon, answering
-- from $TMP/remote.json and recording the URL it was asked to fetch. VERSION_FILE via env.
-- Run by verify.sh. Exit 0 = pass.
local cjson = require "cjson"
local board_ok = true   -- flipped false for Case F to exercise the failure branch
local TMP = os.getenv("MM_TMP") or "/tmp/mm-ver-test"
local fetched, daemon_up = nil, true
local function readf(path) local f = io.open(path, "r"); if not f then return nil end; local s = f:read("*a"); f:close(); return s end
package.loaded["oui.ubus"] = { call = function(obj, method, params)
  if obj == "system" and method == "board" then
    if board_ok then return { model = "GL.iNet E5800 TEST", system = "ARMv8 TEST" } end
    return nil, "err"
  end
  if obj == "mudimodem" then
    if not daemon_up then return nil, "not found" end
    if method == "job_start" then
      assert(params.kind == "version_fetch", "app_version starts a version_fetch job, got " .. tostring(params.kind))
      fetched = params.args.url
      return { id = 7 }
    elseif method == "job_wait" then
      local ok, obj2 = pcall(cjson.decode, readf(TMP .. "/remote.json") or "")
      if ok and type(obj2) == "table" and obj2.version then return { done = true, id = 7, version = tostring(obj2.version) } end
      return { done = true, id = 7, error = "remote version.json unreachable or malformed" }
    end
  end
  return nil, "unused"
end }

os.execute("rm -rf " .. TMP .. "; mkdir -p " .. TMP)

local function writef(path, s) local f = assert(io.open(path, "w")); f:write(s); f:close() end

-- Env (MUDIMODEM_VERSION_FILE, MM_PLUGIN) is set by the ssh wrapper in verify.sh; the plugin
-- reads it via os.getenv at load + call time.
local M = dofile(os.getenv("MM_PLUGIN") or "/usr/lib/oui-httpd/rpc/mudimodem")
assert(type(M.app_version) == "function", "app_version missing")

-- Case A: installed != latest  -> update_available true, checked true.
writef(os.getenv("MUDIMODEM_VERSION_FILE"), '{"version":"1.0.0"}')
writef(TMP .. "/remote.json", '{"version":"1.0.2"}')
local a = M.app_version({})
assert(a.installed == "1.0.0", "A installed: " .. tostring(a.installed))
assert(a.latest == "1.0.2", "A latest: " .. tostring(a.latest))
assert(a.checked == true, "A checked")
assert(a.update_available == true, "A update_available")
assert(a.error == nil, "A no error")

-- Case B: installed == latest  -> update_available false.
writef(TMP .. "/remote.json", '{"version":"1.0.0"}')
local b = M.app_version({})
assert(b.update_available == false, "B up to date")
assert(b.checked == true, "B checked")

-- Case C: malformed remote     -> fail-silent (error set, not checked).
writef(TMP .. "/remote.json", 'not json')
local c = M.app_version({})
assert(c.checked == false, "C not checked")
assert(c.update_available == false, "C no update on failure")
assert(type(c.error) == "string", "C error string")
assert(c.installed == "1.0.0", "C still reports installed")

-- Case D: missing local version file -> installed "unknown".
os.remove(os.getenv("MUDIMODEM_VERSION_FILE"))
writef(TMP .. "/remote.json", '{"version":"1.0.2"}')
local d = M.app_version({})
assert(d.installed == "unknown", "D installed unknown: " .. tostring(d.installed))

-- Case E: device_info returns model + cpu from the ubus board shim.
assert(type(M.device_info) == "function", "device_info missing")
local dv = M.device_info({})
assert(dv.model == "GL.iNet E5800 TEST", "E device_info model: " .. tostring(dv.model))
assert(dv.cpu == "ARMv8 TEST", "E device_info cpu: " .. tostring(dv.cpu))

-- Case F: ubus system board failure -> device_info fails closed to {"",""}.
board_ok = false
local df = M.device_info({})
assert(df.model == "", "F device_info model on failure: " .. tostring(df.model))
assert(df.cpu == "", "F device_info cpu on failure: " .. tostring(df.cpu))

-- Case E: the recorded install source drives the update URL (fork/branch installs).
writef(os.getenv("MUDIMODEM_VERSION_FILE"), '{"version":"2.0.0","base":"https://raw.githubusercontent.com/someone/MudiModem/feature-x"}')
writef(TMP .. "/remote.json", '{"version":"2.0.1"}')
local e = M.app_version({})
assert(e.source == "https://raw.githubusercontent.com/someone/MudiModem/feature-x", "E source: " .. tostring(e.source))
assert(fetched == "https://raw.githubusercontent.com/someone/MudiModem/feature-x/version.json",
       "E the daemon must fetch the recorded base: " .. tostring(fetched))
assert(e.update_available == true and e.latest == "2.0.1", "E update from the fork")
-- Case F: a malformed base falls back to upstream (never a shell-escape vector).
writef(os.getenv("MUDIMODEM_VERSION_FILE"), '{"version":"2.0.0","base":"https://x/y;rm -rf /"}')
local fcase = M.app_version({})
assert(fcase.source == "https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main", "F malformed base must fall back")

-- Case G: only a NEWER release is an update — a dev/fork install ahead of main
-- is not offered a downgrade, and numbers compare as numbers (2.0.10 > 2.0.9).
writef(os.getenv("MUDIMODEM_VERSION_FILE"), '{"version":"2.0.1"}')
writef(TMP .. "/remote.json", '{"version":"2.0.0"}')
assert(M.app_version({}).update_available == false, "G an older remote is not an update")
writef(os.getenv("MUDIMODEM_VERSION_FILE"), '{"version":"2.0.9"}')
writef(TMP .. "/remote.json", '{"version":"2.0.10"}')
assert(M.app_version({}).update_available == true, "G 2.0.10 is newer than 2.0.9")
writef(os.getenv("MUDIMODEM_VERSION_FILE"), '{"version":"2.0"}')
writef(TMP .. "/remote.json", '{"version":"2.0.0"}')
assert(M.app_version({}).update_available == false, "G 2.0 == 2.0.0")

-- Case H: the daemon down -> fail-silent, still naming the installed version.
daemon_up = false
local hcase = M.app_version({})
assert(hcase.installed == "2.0" and hcase.checked == false and hcase.error:find("not running", 1, true),
       "H daemon down: " .. tostring(hcase.error))
daemon_up = true

os.execute("rm -rf " .. TMP)
print("backend-version OK")


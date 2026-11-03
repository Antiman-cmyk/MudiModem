-- MudiModem RPC backend: Config tab: version + self-update, device info, battery charge limit, history on flash.
-- Part of the nginx plugin (src/rpc/mudimodem loads it): adds its methods to M; C = core.lua.
return function(M, C)
local cjson, spawn_detached, ucall, job = C.cjson, C.spawn_detached, C.ucall, C.job

-- ======================= Phase 5: MudiModem version check ====================
-- app_version reads the installed version from a local file and the latest from
-- version.json at the recorded install source, fetched by a mudimodemd job (no RPC arg
-- reaches it: the URL comes from that file, charset-checked here and again in the daemon).
-- pcall(cjson.decode, ...) on the file is safe (knowledge.md §7: pcall is only unsafe around a
-- ubus cosocket call). Fail-silent: any network/parse failure sets error + checked=false.
local VERSION_FILE = os.getenv("MUDIMODEM_VERSION_FILE") or "/etc/mudimodem/version.json"
local DEFAULT_BASE = "https://raw.githubusercontent.com/Antiman-cmyk/MudiModem/main"

-- { version, base } from the file install.sh wrote. `base` is the raw-URL root
-- the install came from (fork/branch aware); the update check follows it so a
-- fork install is never offered upstream's version as an "update".
local function read_version_file()
  local f = io.open(VERSION_FILE, "r")
  if not f then return "unknown", DEFAULT_BASE end
  local s = f:read("*a") or ""
  f:close()
  local ok, obj = pcall(cjson.decode, s)   -- cjson.decode can't yield; pcall safe (knowledge.md §7)
  if ok and type(obj) == "table" then
    -- Same allowlist mudimodem-selfupdate applies (keep the two in sync): a
    -- plain URL charset incl. ':' for a port — a dev box serving its own tree
    -- over http://host:8000 is a legitimate base both readers must agree on.
    local base = (type(obj.base) == "string" and obj.base:match("^https?://[%w%.%-_:/]+$")) and obj.base or DEFAULT_BASE
    return (obj.version and tostring(obj.version)) or "unknown", base
  end
  return "unknown", DEFAULT_BASE
end

-- Is `a` a newer release than `b`? Dotted numbers compare numerically
-- ("2.0.10" > "2.0.9"); anything else (e.g. "unknown") falls back to "they
-- differ", so a box that can't name its version is still offered one. A plain
-- inequality offered a dev/fork install that is AHEAD of main a "downgrade" as
-- an update.
local function version_newer(a, b)
  local function parts(v)
    v = tostring(v or "")
    if not v:match("^v?%d+[%.%d]*$") then return nil end
    local t = {}
    for n in v:gmatch("%d+") do t[#t + 1] = tonumber(n) end
    return t
  end
  local pa, pb = parts(a), parts(b)
  if not pa or not pb then return a ~= b end
  for i = 1, math.max(#pa, #pb) do
    local x, y = pa[i] or 0, pb[i] or 0
    if x ~= y then return x > y end
  end
  return false
end

function M.app_version(args)
  local installed, base = read_version_file()
  local out = { installed = installed, latest = nil, source = base,
                update_available = false, checked = false }
  local url = os.getenv("MUDIMODEM_VERSION_URL") or (base .. "/version.json")
  -- The fetch (curl, up to 8 s) runs in mudimodemd; it re-checks the URL charset.
  local r = job("version_fetch", { url = url })
  if r.pending then out.error = "the version check is taking too long"; return out end
  if type(r.version) ~= "string" then
    out.error = r.error or "remote version.json unreachable or malformed"
    return out
  end
  out.latest = r.version
  out.checked = true
  out.update_available = version_newer(out.latest, out.installed)
  return out
end

-- device_info: model + CPU for the Config tab. The browser-facing `system` rpc
-- object has no `board` method, so we read it server-side via ubus (through
-- ucall — never pcall, per knowledge.md §7).
function M.device_info(args)
  local r = ucall("system", "board", {})
  if type(r) ~= "table" then return { model = "", cpu = "" } end
  return { model = r.model or "", cpu = r.system or "" }
end

-- self_update launches the detached self-update script and returns at once
-- (install.sh restarts nginx; running it in-handler would drop this connection).
-- update_status polls the lockdir + result file the script writes. No ubus here,
-- so no cosocket concern. The script path is a fixed constant.
local SELFUPDATE_BIN = os.getenv("MUDIMODEM_SELFUPDATE_BIN") or "/usr/sbin/mudimodem-selfupdate"
local UPDATE_LOCK    = os.getenv("MUDIMODEM_UPDATE_LOCK")   or "/etc/mudimodem/update.lock.d"
local UPDATE_RESULT  = os.getenv("MUDIMODEM_UPDATE_RESULT") or "/etc/mudimodem/update-result.json"

function M.self_update(args)
  os.execute("mkdir -p /etc/mudimodem 2>/dev/null")
  -- Fresh run: clear any stale result so update_status reflects THIS attempt.
  os.remove(UPDATE_RESULT)
  spawn_detached(SELFUPDATE_BIN)
  return { ok = true, started = true }
end

function M.update_status(args)
  -- lockdir present => an update is running.
  local lock = io.open(UPDATE_LOCK .. "/.", "r")
  local in_progress = false
  if lock then lock:close(); in_progress = true
  else
    -- io.open on a directory path is unreliable; probe with a shell test instead.
    in_progress = (os.execute("[ -d '" .. UPDATE_LOCK .. "' ]") == 0
                or os.execute("[ -d '" .. UPDATE_LOCK .. "' ]") == true)
  end
  local result = nil
  local f = io.open(UPDATE_RESULT, "r")
  if f then
    local s = f:read("*a") or ""; f:close()
    local ok, obj = pcall(cjson.decode, s)
    if ok and type(obj) == "table" then result = obj end
  end
  return { in_progress = in_progress, result = result }
end

-- ---- Battery charge limit (Config tab) ------------------------------------
-- Policy file + glbattlimit CLI. No ubus. Spec:
-- docs/design/2026-07-22-battery-charge-limit-design.md
-- Env (MUDIMODEM_BATTLIMIT_FILE / MUDIMODEM_BATTLIMIT_BIN) re-read each call
-- so isolation tests can override after dofile.

local function battlimit_file()
  return os.getenv("MUDIMODEM_BATTLIMIT_FILE") or "/etc/mudimodem/battlimit.json"
end
local function battlimit_bin()
  return os.getenv("MUDIMODEM_BATTLIMIT_BIN") or "/usr/bin/glbattlimit"
end

local function batt_defaults()
  return { enabled = false, limit_gui = 80 }
end

local function read_batt_policy()
  local p = batt_defaults()
  local f = io.open(battlimit_file(), "r")
  if not f then return p end
  local body = f:read("*a") or ""; f:close()
  local ok, obj = pcall(cjson.decode, body)
  if not ok or type(obj) ~= "table" then return p end
  if type(obj.enabled) == "boolean" then p.enabled = obj.enabled end
  local g = tonumber(obj.limit_gui)
  if g and g == math.floor(g) and g >= 20 and g <= 100 then p.limit_gui = g end
  return p
end

local function write_batt_policy(enabled, limit_gui)
  os.execute("mkdir -p /etc/mudimodem 2>/dev/null")
  local path = battlimit_file()
  local tmp = path .. ".tmp." .. tostring(os.time())
  local f, err = io.open(tmp, "w")
  if not f then return false, err or "open failed" end
  -- cjson encodes booleans correctly; keep pretty-min for ash sed extract.
  f:write(string.format('{"enabled":%s,"limit_gui":%d}\n',
    enabled and "true" or "false", limit_gui))
  f:close()
  local ok = os.rename(tmp, path)
  if not ok then os.remove(tmp); return false, "rename failed" end
  return true
end

local function run_glbattlimit(args)
  -- args is a shell-safe string already built from validated integers / fixed words.
  -- Returns: output_text, success (exit 0).
  local bin = battlimit_bin()
  local f = io.popen(bin .. " " .. args .. " 2>/dev/null")
  if not f then return nil, false end
  local out = f:read("*a") or ""
  -- Lua 5.1: close → true/nil; Lua 5.2+: true|"exit"|code or nil|"exit"|code
  local c1, c2, c3 = f:close()
  local success
  if c3 ~= nil then
    success = (c3 == 0)
  else
    success = (c1 == true) or (c1 == 0)
  end
  return out, success
end

local function bin_available()
  local bin = battlimit_bin()
  -- executable check (Lua 5.1 returns int exit status; 5.2+ returns true/nil)
  return (os.execute("[ -x '" .. bin:gsub("'", "'\\''") .. "' ]") == 0)
      or (os.execute("[ -x '" .. bin:gsub("'", "'\\''") .. "' ]") == true)
end

-- Parse `glbattlimit status` human text. Tolerant of small format drift.
local function parse_status(text)
  local s = {
    active = false, active_gauge = nil,
    capacity_gauge = nil, capacity_gui = nil,
    charger_online = false,
  }
  if not text or text == "" then return s end
  if text:find("Limit%s*:%s*active", 1) then
    s.active = true
    local ag = text:match("active %((%d+)%s*%%%s*gauge")
    if ag then s.active_gauge = tonumber(ag) end
  end
  local cg, cgui = text:match("Capacity%s*:%s*(%d+)%s*%%%s*gauge%s*/%s*~(%d+)%s*%%%s*GUI")
  if cg then s.capacity_gauge = tonumber(cg) end
  if cgui then s.capacity_gui = tonumber(cgui) end
  local on = text:match("Charger%s*:%s*online=(%d)")
  if on == "1" then s.charger_online = true end
  return s
end

-- GUI→gauge using the same integer formula as the tool (gui2gauge).
local function gui_to_gauge(gui)
  local GUI_M, GUI_B = 13867, 189300
  return math.floor((gui * 10000 + GUI_B + GUI_M / 2) / GUI_M)
end

local function snapshot_battlimit()
  local pol = read_batt_policy()
  local out = {
    enabled = pol.enabled,
    limit_gui = pol.limit_gui,
    limit_gauge = gui_to_gauge(pol.limit_gui),
    gui_m = 13867,          -- the chunk converts gauge -> GUI for display; serving
    gui_b = 189300,         -- the constants here keeps that formula in ONE place
    active = false,
    active_gauge = nil,
    capacity_gauge = nil,
    capacity_gui = nil,
    charger_online = false,
    available = false,
    error = nil,
  }
  if not bin_available() then
    out.error = "glbattlimit not installed"
    return out
  end
  out.available = true
  local text = run_glbattlimit("status")
  if not text or text == "" or text:find("ERROR:", 1, true) then
    out.available = false
    out.error = "glbattlimit status failed"
    return out
  end
  local st = parse_status(text)
  out.active = st.active
  out.active_gauge = st.active_gauge
  out.capacity_gauge = st.capacity_gauge
  out.capacity_gui = st.capacity_gui
  out.charger_online = st.charger_online
  return out
end

function M.get_battlimit(args)
  return snapshot_battlimit()
end

function M.set_battlimit(args)
  args = args or {}
  local enabled = args.enabled
  local limit_gui = tonumber(args.limit_gui)
  if type(enabled) ~= "boolean"
     or not limit_gui or limit_gui ~= math.floor(limit_gui)
     or limit_gui < 20 or limit_gui > 100 then
    local out = snapshot_battlimit()
    out.error = "invalid params"
    return out
  end
  -- glbattlimit enforces gauge 50–100 after gui2gauge; reject before write.
  local gauge = gui_to_gauge(limit_gui)
  if gauge < 50 or gauge > 100 then
    local out = snapshot_battlimit()
    out.error = "limit too low (min ~50% gauge / use higher GUI %)"
    return out
  end
  local ok, err = write_batt_policy(enabled, limit_gui)
  if not ok then
    local out = snapshot_battlimit()
    out.error = err or "write failed"
    return out
  end
  if not bin_available() then
    local out = snapshot_battlimit()
    out.error = "glbattlimit not installed"
    return out
  end
  if not enabled then
    run_glbattlimit("off")
    local out = snapshot_battlimit()
    if out.active then
      out.error = "could not deactivate limit"
    end
    return out
  end
  -- Only apply live when charger is online; otherwise policy is armed for hotplug.
  local st = parse_status((run_glbattlimit("status")))
  if st.charger_online then
    run_glbattlimit("on " .. tostring(limit_gui) .. " gui")
    local out = snapshot_battlimit()
    -- enabled + plugged but watcher not running → tool rejected or failed silently
    if out.enabled and out.charger_online and not out.active then
      out.error = "could not activate limit"
    end
    return out
  end
  return snapshot_battlimit()
end

-- ---- History eMMC backup (Config tab) ------------------------------------
-- Live history stays on tmpfs. When enabled, mudimodem-collectd periodically
-- appends new samples to /etc/mudimodem/history/ (approach #2). Off by default.
-- Spec session 2026-07-29. Collectd re-reads the policy file each flush — no
-- SIGHUP / restart needed when the checkbox flips.

local function history_cfg_file()
  return os.getenv("MUDIMODEM_HISTORY_CFG") or "/etc/mudimodem/history.json"
end
local function history_persist_dir()
  return os.getenv("MUDIMODEM_HISTORY_PERSIST") or "/etc/mudimodem/history"
end

local function read_history_policy()
  local p = { enabled = false }
  local f = io.open(history_cfg_file(), "r")
  if not f then return p end
  local body = f:read("*a") or ""; f:close()
  local ok, obj = pcall(cjson.decode, body)
  if ok and type(obj) == "table" and obj.enabled == true then
    p.enabled = true
  end
  return p
end

local function write_history_policy(enabled)
  os.execute("mkdir -p /etc/mudimodem 2>/dev/null")
  local path = history_cfg_file()
  local tmp = path .. ".tmp." .. tostring(os.time())
  local f, err = io.open(tmp, "w")
  if not f then return false, err or "open failed" end
  f:write(string.format('{"enabled":%s}\n', enabled and "true" or "false"))
  f:close()
  local ok = os.rename(tmp, path)
  if not ok then os.remove(tmp); return false, "rename failed" end
  return true
end

local function history_dir_bytes(dir)
  -- BusyBox du often lacks -b; sum known files with wc -c instead. Each stream
  -- is two segments (collectd rotates current -> .prev once a day, so the
  -- flash backup is append-only between rotations).
  local total = 0
  for _, name in ipairs({ "samples.jsonl", "samples.prev.jsonl", "battery.jsonl", "battery.prev.jsonl" }) do
    local f = io.open(dir .. "/" .. name, "r")
    if f then
      local sz = f:seek("end")
      f:close()
      if type(sz) == "number" then total = total + sz end
    end
  end
  return total
end

local function snapshot_history_persist()
  local pol = read_history_policy()
  local dir = history_persist_dir()
  local out = {
    enabled = pol.enabled,
    path = dir,
    size_bytes = 0,
    flush_interval_s = 600,
  }
  -- Size of the on-disk backup only (what reboot survives), not the live tmpfs.
  local st = io.open(dir, "r")
  if st then
    st:close()
    out.size_bytes = history_dir_bytes(dir)
  end
  return out
end

function M.get_history_persist(args)
  return snapshot_history_persist()
end

function M.set_history_persist(args)
  args = args or {}
  if type(args.enabled) ~= "boolean" then
    local out = snapshot_history_persist()
    out.error = "enabled must be a boolean"
    return out
  end
  local ok, err = write_history_policy(args.enabled)
  if not ok then
    local out = snapshot_history_persist()
    out.error = err or "could not write policy"
    return out
  end
  if args.enabled then
    os.execute("mkdir -p '" .. history_persist_dir():gsub("'", "'\\''") .. "' 2>/dev/null")
  end
  return snapshot_history_persist()
end

end

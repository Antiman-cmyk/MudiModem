-- MudiModem RPC backend, shared helpers: ubus / mudimodemd / glc calls, the pending change, the active SIM -> sub_id, AT parsers.
-- Part of the nginx plugin (src/rpc/mudimodem loads it); returns its locals for the other parts.
-- Nothing slow at load: this runs in GL's one nginx worker.
local ubus  = require "oui.ubus"
local cjson = require "cjson"


-- Paths (overridable via env for the isolation tests).
local PENDING    = os.getenv("MUDIMODEM_PENDING") or "/etc/mudimodem/pending"
local ARMED      = os.getenv("MUDIMODEM_ARMED")   or "/etc/mudimodem/armed"
local REVERT_BIN = os.getenv("MUDIMODEM_BIN")     or "/usr/sbin/mudimodem-revert"
-- Detached children (watchdog, speed test, self-update) go through this
-- wrapper so they never inherit nginx's listening sockets (see the script).
local DETACH     = os.getenv("MUDIMODEM_DETACH")  or "/usr/lib/mudimodem/mudimodem-detach"
local LATEST     = os.getenv("MUDIMODEM_LATEST")  or "/tmp/mudimodem/latest.json"
local BUS        = "cpu"                      -- the built-in modem's bus
-- History telemetry lives in tmpfs (volatile), separate from the durable /etc
-- pending state. samples.jsonl is written by mudimodem-collectd; events.jsonl by
-- us (user events) + the watchdog (dog events). get_history serves both.
local HIST_DIR   = os.getenv("MUDIMODEM_HIST") or "/tmp/mudimodem"
local LAST_SCAN  = os.getenv("MUDIMODEM_LAST_SCAN") or (HIST_DIR .. "/last-scan.json")   -- mudimodemd tasks.keep_scan
local SAMPLES    = HIST_DIR .. "/samples.jsonl"
local EVENTS     = HIST_DIR .. "/events.jsonl"
local BATTERY    = HIST_DIR .. "/battery.jsonl"

-- An empty Lua table encodes as {} (object); GL's set_band_config wants []
-- for empty band lists. cjson.empty_array is the sentinel that encodes as [].
-- (Older lua-cjson builds lack the sentinel — the dev box's, not the router's —
-- so fall back to a plain table there rather than emitting a nil field.)
local EMPTY_ARRAY = cjson.empty_array or {}
local function arr(t)
  if type(t) == "table" and #t > 0 then return t end
  return EMPTY_ARRAY
end

-- JSON null decodes to cjson.null, a lightuserdata that is TRUTHY in Lua — a
-- bare `if obj.pci then` passes on "pci": null. Launder every decoded field
-- that gates a decision through nn() first.
local function nullish(v) return v == nil or v == cjson.null end
local function nn(v) if nullish(v) then return nil end return v end

-- Editable RATs: our key <-> the AT param <-> GL's band_list key.
local RATS = {
  { key = "sa",  param = "nr5g_band",     gl = "NR-SA" },
  { key = "nsa", param = "nsa_nr5g_band", gl = "NR-NSA" },
  { key = "lte", param = "lte_band",      gl = "LTE" },
}
-- Network mode: GL's network_mode value (== the modem's mode_pref). Only these
-- three are exposed (GL's own choices). NSA needs an LTE anchor, so it is
-- usable only under AUTO; SA under AUTO/NR5G; LTE under AUTO/LTE.
local MODES = { AUTO = true, NR5G = true, LTE = true }

-- Launch a command detached from this nginx worker (fds closed, own session).
local function spawn_detached(cmd)
  os.execute(DETACH .. " " .. cmd .. " >/dev/null 2>&1 &")
end

-- Call a dotted ubus object, returning (table|nil, err).
--
-- ⚠️ MUST NOT be wrapped in pcall: oui.ubus.call uses an nginx cosocket, which
-- YIELDS while waiting on I/O. This box's Lua cannot yield across a C-call
-- boundary (pcall), so a pcall wrapper makes every call throw
-- "attempt to yield across metamethod/C-call boundary". GL's own plugins call
-- ubus.call bare for exactly this reason. ubus.call already returns (nil, err)
-- on ubus-level failure without throwing, so no pcall is needed.
local function ucall(object, method, args)
  return ubus.call(object, method, args or {})
end

-- ---- mudimodemd: work too slow for this worker -----------------------------------------------
-- GL 4.10 runs ONE nginx worker, so anything slow here stalls the whole admin. The AT console
-- and the slow jobs (version fetch, AT-library check/refresh, cell scan) run in mudimodemd
-- instead; we reach it over oui.ubus — a cosocket through gl-session's ubus proxy, so nginx
-- keeps serving while we wait. One call through that proxy must answer within 30 s (eco's
-- default call timeout), so we wait in slices: a job still running after one slice comes back
-- as {pending, id} and the page continues with job_result / at_result.
local AT_WAIT_S = 20          -- per slice, for AT sequences and jobs alike

local function daemon_error(err)
  if err == "not found" then
    return "the MudiModem daemon is not running (/etc/init.d/mudimodem-collectd restart)"
  end
  return "the MudiModem daemon did not answer (" .. tostring(err) .. ")"
end

-- Over ubus an empty list arrives as {}: the page must still get a JSON array.
local LIST_FIELDS = { "steps", "towers" }
local function job_lists(r)
  for _, k in ipairs(LIST_FIELDS) do
    if type(r[k]) == "table" then r[k] = arr(r[k]) end
  end
end

local function job_wait(id)
  local r, err = ucall("mudimodem", "job_wait", { id = id, wait = AT_WAIT_S })
  if type(r) ~= "table" then return { error = daemon_error(err) } end
  job_lists(r)
  return r
end

-- Start a daemon job and wait one slice for it: the result (done = true) or {pending, id}.
-- The second value is true when mudimodemd is not registered at all (callers with an
-- in-process fallback use it); any other failure is an answer of its own.
local function job(kind, args)
  local r, err = ucall("mudimodem", "job_start", { kind = kind, args = args or {} })
  if type(r) ~= "table" then return { error = daemon_error(err) }, err == "not found" end
  if r.error then return { error = r.error } end
  return job_wait(r.id)
end

-- Run a raw AT command at a given sub_id, return the payload string (or nil).
local function at(cmd, sub_id)
  local res = ucall("modem.CPU.AT", "get_result_AT",
                    { cmd = cmd, timeout = 8, sub_id = sub_id })
  if not res or not res.data then return nil end
  return res.data
end

-- Parse a colon list "2:5:71" -> { 2, 5, 71 } (numbers, order preserved).
-- Band 0 does not exist in any RAT; the modem uses a lone "0" to mean EMPTY
-- (e.g. nsa_nr5g_band,0 when SA-only). So drop zeros -> {} means "none".
local function parse_list(s)
  local out = {}
  if not s then return out end
  for n in s:gmatch("(%d+)") do
    local v = tonumber(n)
    if v and v > 0 then out[#out + 1] = v end
  end
  return out
end

-- From a QNWPREFCFG multi-line blob, pull one key's list:
--   +QNWPREFCFG: "nr5g_band",25:41:48:66:71:77
local function pref_line(blob, key)
  if not blob then return nil end
  -- match  "<key>",<digits-with-colons>   (value may be empty)
  local val = blob:match('"' .. key .. '",([%d:]*)')
  return parse_list(val)
end

-- Same, but the raw value string, verbatim (for writing back on revert). "" if absent.
local function pref_raw(blob, key)
  if not blob then return "" end
  return blob:match('"' .. key .. '",([%d:]*)') or ""
end

local function file_exists(p)
  local f = io.open(p, "r")
  if f then f:close(); return true end
  return false
end

-- Read one key=value out of the pending file.
local function pending_get(key)
  if not file_exists(PENDING) then return nil end
  for line in io.lines(PENDING) do
    local k, v = line:match("^([%w_]+)=(.*)$")
    if k == key then
      local q = v:match("^'(.*)'$")           -- JSON values are single-quoted for sh
      return q or v
    end
  end
  return nil
end

-- Arm the revert watchdog and CONFIRM it is live before any write: no net, no write (both write
-- paths call this after writing PENDING). mudimodemd spawns it and waits for its marker without
-- holding this worker (change.lua). Only when the daemon gives no verdict at all (not running,
-- not answering) does the spawn run from here, holding the worker ~1 s as before; a watchdog the
-- daemon may still have started meanwhile is harmless — the newest one owns the marker, an
-- older one stands down (its nonce no longer matches).
local function arm_watchdog()
  os.remove(ARMED)
  local r = ucall("mudimodem", "change_arm", {})
  if type(r) == "table" and type(r.armed) == "boolean" then
    return r.armed and file_exists(ARMED)
  end
  spawn_detached(REVERT_BIN .. " watch")
  os.execute("sleep 1")
  return file_exists(ARMED)
end

-- The confirm-or-revert window. The watchdog reads the same variable (default 60 s); it arms
-- right after the pending file is written, so DEADLINE (written with the file) is at most ~1 s
-- earlier than the moment it actually reverts — never later.
local WINDOW = tonumber(os.getenv("MUDIMODEM_WINDOW") or "") or 60

-- Lines that let a page restore its countdown after a reload / on another tab: when the
-- watchdog fires (box clock), what the page showed as applied, and the radio picture just
-- before the change (the banner compares it with the live one). The pending file is sourced
-- by sh, so each JSON is single-quoted and must not contain a single quote itself.
local function pending_meta(applied, before)
  local lines = { "DEADLINE=" .. tostring(os.time() + WINDOW),
                  "APPLIED='" .. cjson.encode(applied or {}):gsub("'", "") .. "'" }
  if type(before) == "table" then lines[#lines + 1] = "BEFORE='" .. cjson.encode(before):gsub("'", "") .. "'" end
  return lines
end

-- The pending change as the page needs it, or nil. Shared by change_status, confirm and the
-- write paths' answers.
local function pending_info()
  if not file_exists(PENDING) then return nil end
  local function decoded(key)
    local raw = pending_get(key)
    if not raw then return nil end
    local ok, v = pcall(cjson.decode, raw)      -- pure C decode; cannot yield
    return (ok and type(v) == "table") and v or nil
  end
  return { kind = pending_get("KIND") or "bands", slot = tonumber(pending_get("SLOT") or ""),
           deadline = tonumber(pending_get("DEADLINE") or ""), applied = decoded("APPLIED"),
           before = decoded("BEFORE"), window = WINDOW }
end

-- The collector's newest sample (cellular_compat schema) when it is fresh,
-- else nil. Lets get_lock skip its own QENG read: the collector already paid
-- for that AT round-trip within the last few seconds.
local function read_latest(max_age_s)
  local f = io.open(LATEST, "r")
  if not f then return nil end
  local body = f:read("*a") or ""
  f:close()
  local ok, obj = pcall(cjson.decode, body)          -- pure C decode; cannot yield
  if not ok or type(obj) ~= "table" or type(obj.t) ~= "number" then return nil end
  if os.time() - obj.t / 1000 > (max_age_s or 30) then return nil end
  return obj
end

-- The radio picture just before a change, for the confirm banner's "before -> now": the
-- collector's sample of THIS slot if it is under a minute old, else nil (the page then shows
-- the live picture alone). Numbers and the RAT only; nil fields are left out.
local function before_snapshot(slot)
  local s = read_latest(60)
  if not s or tonumber(nn(s.slot)) ~= slot then return nil end
  return { t = nn(s.t), registered = nn(s.rsrp) ~= nil, rat = nn(s.pcc_rat) or nn(s.mode), mode = nn(s.mode),
           band = tonumber(nn(s.band)), pci = tonumber(nn(s.pci)), rsrp = tonumber(nn(s.rsrp)),
           sinr = tonumber(nn(s.sinr)), rsrq = tonumber(nn(s.rsrq)) }
end

-- The built-in modem's object out of `cellular.modem status/info` called WITHOUT
-- arguments — GL's canonical form, which its own consumers parse as modems[]
-- (lib/functions/modem.sh get_current_sim_slot, websocket/cellular.lua,
-- internet.js). No other shape is accepted.
local function pick_modem(payload)
  local mods = type(payload) == "table" and payload.modems or nil
  if type(mods) ~= "table" then return nil end
  for _, m in ipairs(mods) do
    if type(m) == "table" and (m.bus == BUS or m.type == 0) then return m end
  end
  return mods[1]
end

-- sub_id resolution costs 1-3 QSPN round-trips; the slot<->sub_id mapping is
-- stable while the active SIM stays the same, so remember it per worker
-- (keyed by slot + home PLMN) for a while.
local SUBID_TTL = 300
local subid_cache = { key = nil, sub_id = nil, plmn = nil, at = 0 }

-- Append one user/watchdog event to the shared telemetry log (spec §4.1). Net
-- (handover/failover) events are NOT written here — the page derives those from
-- the sample stream. A single O_APPEND JSON line < PIPE_BUF is atomic, so the
-- multiple appenders (us + the watchdog) don't corrupt each other.
local function append_event(kind, label, detail)
  os.execute("mkdir -p " .. HIST_DIR .. " 2>/dev/null")
  local ev = { t = os.time() * 1000, kind = kind, label = label, detail = detail or "" }
  local f = io.open(EVENTS, "a")
  if f then f:write(cjson.encode(ev) .. "\n"); f:close() end
  -- Same push bus the collector uses: the Tracking timeline gets the event now
  -- instead of at its next history fetch. Bare ucall — never pcall a cosocket.
  ucall("gl-session", "notify", { name = "mudimodem.event", data = ev })
end

-- Extract the RPLMN (last quoted field) from a QSPN response:
--   +QSPN: "T-Mobile","T-Mobile","",0,"310260"
local function qspn_plmn(blob)
  if not blob then return nil end
  local last
  for q in blob:gmatch('"([^"]*)"') do last = q end   -- last quoted token
  return last                                          -- "310260" or nil
end

-- The IMSI (14-15 digits) out of an AT+CIMI reply ("\r\n310260123456789\r\n\r\nOK").
local function cimi_imsi(blob)
  if not blob then return nil end
  for d in blob:gmatch("%d+") do
    if #d >= 14 and #d <= 15 then return d end
  end
  return nil
end

-- A SIM field as a plain digit string (GL sends strings; a JSON number is
-- formatted without an exponent so a 15-digit IMSI survives), nil otherwise.
local function digits(v)
  v = nn(v)
  if type(v) == "number" then v = string.format("%.0f", v) end
  if type(v) ~= "string" then return nil end
  return v:match("^%s*(%d+)%s*$")
end

-- sub_ids to try for a slot, in order. On this box sub_id 1 answers for slot 1
-- and sub_id 2 for slot 2, while sub_id 0 floats between subscriptions
-- (reference §1) — so the slot's own number leads, the other explicit sub_id
-- follows, and 0 is never sent (docs/knowledge.md §4.3). Leading with 1 for every slot
-- was the SIM1/SIM2 mix-up: with two SIMs of the same carrier sub_id 1 PLMN-
-- matched for slot 2 too, and every AT read/write then hit SIM1.
local function subid_candidates(slot)
  local out, seen = {}, {}
  for _, sid in ipairs({ slot or 1, 1, 2 }) do
    if sid > 0 and not seen[sid] then seen[sid] = true; out[#out + 1] = sid end
  end
  return out
end

-- Resolve the sub_id that actually talks to the active SIM.
-- 1. IMSI (AT+CIMI) when GL reports the slot's IMSI: unique per SIM, so it
--    separates two SIMs of the same carrier and is unaffected by roaming. If
--    CIMI answers but no candidate carries this IMSI, the answer is "not
--    confirmed" — a PLMN match then could only pick the wrong SIM.
-- 2. Otherwise PLMN: QSPN's registered PLMN against the SIM's home mcc+mnc
--    (cannot separate same-carrier SIMs — the candidate order covers that —
--    and misses while roaming).
-- Unconfirmed => the slot's own sub_id, flagged. Returns (sub_id, plmn, matched).
local function resolve_sub_id(slot, want_imsi, want_plmn)
  local cands = subid_candidates(slot)
  if want_imsi then
    local cimi_works = false
    for _, sid in ipairs(cands) do
      local imsi = cimi_imsi(at("AT+CIMI", sid))
      if imsi == want_imsi then return sid, want_plmn, true end
      if imsi then cimi_works = true end
    end
    if cimi_works then return cands[1], nil, false end
  end
  if want_plmn then
    for _, sid in ipairs(cands) do
      local plmn = qspn_plmn(at("AT+QSPN", sid))
      if plmn == want_plmn then return sid, plmn, true end
    end
  end
  return cands[1], nil, false
end

-- GL's active slot (current_sim_slot of the built-in modem), nil when none.
-- One ubus read, no AT — enough for every slot-addressed GL call.
local function active_slot()
  local st = pick_modem(ucall("cellular.modem", "status", {}))
  local slot = st and tonumber(nn(st.current_sim_slot)) or nil
  return (slot and slot >= 1) and slot or nil       -- 0 is a truthy number in Lua, not a slot
end

-- Resolve the active subscription end-to-end: the active slot's SIM identity
-- from ubus, then the sub_id that answers for it. Returns (sub_id, plmn,
-- matched, slot).
-- ⚠️ `slot` is nil when GL has no active slot (no SIM, modem resetting): every
-- caller must REFUSE to write in that case — never fall back to slot 1, which
-- would mis-target SIM2/eSIM.
local function resolve_slot(slot)
  if not slot then return nil, nil, false, nil end
  local want_imsi, want_plmn, iccid
  local sims = ucall("cellular.sim", "info", {})
  for _, s in ipairs((sims and sims.sims) or {}) do
    if type(s) == "table" and tonumber(nn(s.slot)) == slot and (nn(s.bus) == nil or s.bus == BUS) then
      local imsi = digits(s.imsi)
      if imsi and #imsi >= 14 and #imsi <= 15 then want_imsi = imsi end
      local mcc, mnc = digits(s.mcc), digits(s.mnc)
      if mcc and mnc then want_plmn = mcc .. mnc end
      iccid = nn(s.iccid)
    end
  end
  -- Keyed on the SIM itself (iccid/IMSI), so a different SIM in the same slot
  -- — even one of the same carrier — never reuses another SIM's answer.
  local key = tostring(slot) .. ":" .. tostring(iccid or want_imsi or want_plmn)
  if subid_cache.key == key and os.time() - subid_cache.at < SUBID_TTL then
    return subid_cache.sub_id, subid_cache.plmn, true, slot
  end
  local sub_id, plmn, matched = resolve_sub_id(slot, want_imsi, want_plmn)
  if matched then
    subid_cache = { key = key, sub_id = sub_id, plmn = plmn, at = os.time() }
  end
  return sub_id, plmn, matched, slot
end
local function resolve_active() return resolve_slot(active_slot()) end

-- A SIM is present in `slot` (cellular.sim info lists it with an ICCID or IMSI).
local function sim_present(slot)
  local sims = ucall("cellular.sim", "info", {})
  for _, s in ipairs((sims and sims.sims) or {}) do
    if type(s) == "table" and tonumber(nn(s.slot)) == slot and (nn(s.bus) == nil or s.bus == BUS)
       and (digits(s.iccid) or digits(s.imsi)) then return true end
  end
  return false
end

-- The page sends the slot its band/lock picture was read for. When the active
-- SIM has changed since (a switch in GL's Internet page, slot failover), a
-- write would apply SIM1's picture to SIM2 — refuse instead and say so; the
-- page refetches. Absent (ssh / older page) => no check.
local function slot_changed(args, slot)
  local want = tonumber(args and nn(args.slot))
  if want and want ~= slot then
    return { error = "the active SIM changed (this page was showing SIM " .. want ..
                     ", SIM " .. tostring(slot) .. " is active now) - refresh and try again",
             slot_changed = true, slot = slot }
  end
  return nil
end

-- Call one of GL's C rpc plugins (modem.so) exactly as oui.rpc's glc_call does
-- (mudi-emu reference/e5800-4.10.0/oui-lib-rpc.lua `glc_call`): nginx-internal POST to /cgi-bin/glc, response
-- body is "<code> <json>". Returns (table|nil, err). NOT pcall-wrapped: capture
-- is a cosocket-style nginx API and must be allowed to yield.
local function glc(object, method, args)
  local res = ngx.location.capture("/cgi-bin/glc", {
    method = ngx.HTTP_POST,
    body = cjson.encode({ object = object, method = method, args = args or {} }),
  })
  if not res or res.status ~= 200 then
    return nil, "glc http " .. tostring(res and res.status)
  end
  local code = tonumber(res.body:match("(-?%d+)"))
  if code ~= 0 then return nil, code end                 -- GL error code (e.g. 20002044)
  local msg = res.body:match("%d+ (.*)") or ""
  local ok, obj = pcall(cjson.decode, msg)               -- decode can't yield; pcall fine
  if not ok or type(obj) ~= "table" then return nil, "glc bad json" end
  return obj
end

-- GL 4.10's per-slot band config (modem.get_band_config {bus,slot}):
--   { band_enable, network_mode: "AUTO"|"NR5G"|"LTE", band_list?: {LTE,NR-SA,NR-NSA} }
-- Normalized to { enable, mode, mode_raw, LTE, nsa, sa } (band_list only present
-- when filtering is enabled; absent => every supported band). band_enable is a
-- JSON boolean in GL's own C code (libcm_modem.so get_band_config emits
-- json_true/json_false), so the strict test is right.
--
-- `mode` is the tri-state the page edits; `mode_raw` is GL's stored string
-- verbatim. They differ only if GL ever stores something outside the enum —
-- a colon combo such as the mode_pref=LTE:NR5G GL's own 4G tower lock leaves
-- behind (reference/quectel-at-reference.md §6a). A band-only apply and the
-- revert snapshot pass mode_raw through untouched, so an unrecognised mode
-- is never silently rewritten to AUTO; get_bands flags it (meta.mode_known).
local function band_cfg_get(slot)
  local raw, err = glc("modem", "get_band_config", { bus = BUS, slot = slot })
  if not raw then return nil, err end
  local bl = raw.band_list or {}
  local mode_raw = raw.network_mode
  if type(mode_raw) ~= "string" or mode_raw == "" then mode_raw = nil end
  local cfg = {
    enable   = raw.band_enable == true,
    mode     = MODES[mode_raw] and mode_raw or "AUTO",
    mode_raw = mode_raw,
    LTE = bl.LTE or {}, nsa = bl["NR-NSA"] or {}, sa = bl["NR-SA"] or {},
  }
  -- The 5G method GL's lists encode (docs/knowledge.md §4.2, measured by running GL): an empty
  -- NR-SA list with NR-NSA bands = SA off (nr5g_disable_mode 1), the reverse = NSA off (mode 2).
  -- Filtering off or LTE mode = both (GL empties both lists under LTE itself).
  cfg.nr5g = "both"
  if cfg.enable and cfg.mode ~= "LTE" then
    if #cfg.sa == 0 and #cfg.nsa > 0 then cfg.nr5g = "nsa"
    elseif #cfg.nsa == 0 and #cfg.sa > 0 then cfg.nr5g = "sa" end
  end
  return cfg
end

-- The exact payload GL's own UI sends to modem.set_band_config: nothing more
-- (no band_filter_mode), lists as JSON arrays, NR lists emptied under LTE
-- mode (GL's rule). `lists` is { LTE=, nsa=, sa= }; nil lists => filtering off.
local function band_cfg_payload(slot, mode, lists)
  local out = { bus = BUS, slot = slot, band_enable = lists ~= nil, network_mode = mode }
  if lists then
    local nr_ok = (mode ~= "LTE")
    out.band_list = {
      LTE = arr(lists.LTE),
      ["NR-NSA"] = nr_ok and arr(lists.nsa) or EMPTY_ARRAY,
      ["NR-SA"]  = nr_ok and arr(lists.sa)  or EMPTY_ARRAY,
    }
  end
  return out
end

local function band_cfg_set(payload)
  return glc("modem", "set_band_config", payload)
end

-- Clear GL's stored cell lock for one slot (slot-addressed, no sub_id). Read
-- in the 4.10 image (libcm_network.so set_cell_tower @0x11e18 ->
-- libcm_modem.so quectel_set_tower @0x2adbc): with lock=false GL needs only
-- `bus`, deletes the slot's stored `tower` record, and clears exactly ONE
-- family in the modem — `network_type == "NR5G"` -> AT+QNWLOCK="common/5g",0,
-- anything else -> "common/4g",0 (skipped when that family reads unlocked),
-- then save_ctrl 0,0 + QEFSSYNC, then `cellular.cm cm_start_dial` (a redial).
-- So the caller names the family; the stored tower fields ride along. The ONE
-- GL-side unlock, used by clear_cell_lock and revert_now alike. Returns
-- (result|nil, err).
local function gl_unlock(slot, family)
  local gl = glc("modem", "get_cell_tower", { bus = BUS })
  local tower = (gl and gl["slot" .. tostring(slot)]) or {}
  local payload = { bus = BUS, slot = slot, lock = false }
  for k, v in pairs(tower) do if payload[k] == nil then payload[k] = v end end
  if family then payload.network_type = (family == "5g" or family == "NR5G") and "NR5G" or "LTE" end
  return glc("modem", "set_cell_tower", payload)
end

-- Run the watchdog's own restore synchronously (src/sbin/mudimodem-revert
-- restore-now): the ONE implementation of "undo what PENDING describes" on the
-- modem side, shared with the window-end revert so the two can never drift.
-- Returns the JSON object it prints, or nil when it gave no answer.
local function restore_now()
  local f = io.popen(REVERT_BIN .. " restore-now 2>/dev/null")
  if not f then return nil end
  local out = f:read("*a") or ""
  f:close()
  local line = out:match("(%b{})")
  if not line then return nil end
  local ok, obj = pcall(cjson.decode, line)       -- pure C decode; cannot yield
  return (ok and type(obj) == "table") and obj or nil
end

-- AT read with the crossed-reply guard (reference §10): the shared channel can
-- answer with a DIFFERENT command's payload. Retry until the reply carries the
-- expected marker; nil after 3 tries (callers treat nil as "unknown").
local function at_expect(cmd, expect, sub_id)
  for _ = 1, 3 do
    local blob = at(cmd, sub_id)
    if blob and blob:find(expect, 1, true) then return blob end
  end
  return nil
end

-- Numbers after a QNWLOCK tag:  '+QNWLOCK: "common/5g",516,127490,15,71'
local function qnwlock_nums(blob, tag)
  if not blob then return nil end
  local tail = blob:match('%+QNWLOCK: "' .. tag .. '",([%d,%s]*)')
  if not tail then return nil end
  local out = {}
  for n in tail:gmatch("(%d+)") do out[#out + 1] = tonumber(n) end
  return out
end

-- "common/4g": ,0 = unlocked; locked reply is ,<mode>,<freq>,<pci>
-- (field order per GL's own parser in /lib/functions/modem.sh:940-942).
local function parse_qnwlock4(blob)
  local n = qnwlock_nums(blob, "common/4g")
  if not n then return nil end
  if #n <= 1 then return { locked = (n[1] or 0) ~= 0 } end
  return { locked = true, mode = n[1], freq = n[2], pci = n[3] }
end

-- "common/5g": ,0 = unlocked; locked reply is ,<pci>,<freq>,<scs>,<band>
-- (PCI FIRST — reference §6a; parser order per modem.sh:926-929).
local function parse_qnwlock5(blob)
  local n = qnwlock_nums(blob, "common/5g")
  if not n then return nil end
  if #n <= 1 then return { locked = (n[1] or 0) ~= 0 } end
  return { locked = true, pci = n[1], freq = n[2], scs = n[3], band = n[4] }
end

local function parse_savectrl(blob)
  local n = qnwlock_nums(blob, "save_ctrl")
  if not n or #n < 2 then return nil end
  return { raw = n[1] .. "," .. n[2], s4g = n[1], s5g = n[2] }
end

-- Serving cell from QENG.
-- SA (single line, verified on-box — reference §4.1 / §8):
--   +QENG: "servingcell",<state>,"NR5G-SA",<duplex>,<mcc>,<mnc>,<cell_id>,<pci>,
--          <tac>,<arfcn>,<band>,…
-- NSA multi-line (ChiliApple #2 / RG650V-EU EN-DC) — the header carries NO cell
-- fields; LTE and NR ride on their own lines:
--   +QENG: "servingcell",<state>
--   +QENG: "LTE",<is_tdd>,<mcc>,<mnc>,<cell_id>,<pci>,<earfcn>,<band>,…
--   +QENG: "NR5G-NSA",<mcc>,<mnc>,<pci>,<rsrp>,<sinr>,<rsrq>,<arfcn>,<band>,…
-- Prefer SA, then NR5G-NSA, then LTE. Never return the header-only line.
local function qeng_csv(line)
  local f = {}
  for tok in line:gmatch('[^,]+') do
    f[#f + 1] = (tok:gsub('^%s*"?', ''):gsub('"?%s*$', ''))
  end
  return f
end

local function parse_serving(blob)
  if not blob then return nil end
  local sa, nsa, lte
  for line in blob:gmatch('[^\r\n]+') do
    if line:find('%+QENG: "servingcell"') then
      local f = qeng_csv(line)
      -- f[1]='+QENG: servingcell', f[2]=state, f[3]=rat (absent on NSA header)
      local rat = f[3]
      if rat == "NR5G-SA" then
        sa = { rat = rat, cell_id = f[7], pci = tonumber(f[8]),
               arfcn = tonumber(f[10]), band = tonumber(f[11]) }
      elseif rat == "LTE" then
        -- Single-line LTE form (state + rat still on the servingcell line)
        lte = lte or { rat = rat, cell_id = f[7], pci = tonumber(f[8]),
                       arfcn = tonumber(f[9]), band = tonumber(f[10]) }
      end
    elseif line:find('%+QENG: "NR5G%-NSA"') then
      local f = qeng_csv(line)
      -- f[1]=+QENG: NR5G-NSA, f[2]=mcc, f[3]=mnc, f[4]=pci, f[5]=rsrp,
      -- f[6]=sinr, f[7]=rsrq, f[8]=arfcn, f[9]=band
      nsa = { rat = "NR5G-NSA", pci = tonumber(f[4]),
              arfcn = tonumber(f[8]), band = tonumber(f[9]) }
    elseif line:find('%+QENG: "LTE"') then
      local f = qeng_csv(line)
      -- f[1]=+QENG: LTE, f[2]=duplex, f[3]=mcc, f[4]=mnc, f[5]=cell_id,
      -- f[6]=pci, f[7]=earfcn, f[8]=band
      lte = lte or { rat = "LTE", cell_id = f[5], pci = tonumber(f[6]),
                     arfcn = tonumber(f[7]), band = tonumber(f[8]) }
    end
  end
  return sa or nsa or lte
end

return {
  ubus = ubus,
  cjson = cjson,
  PENDING = PENDING,
  ARMED = ARMED,
  REVERT_BIN = REVERT_BIN,
  DETACH = DETACH,
  LATEST = LATEST,
  BUS = BUS,
  HIST_DIR = HIST_DIR,
  LAST_SCAN = LAST_SCAN,
  SAMPLES = SAMPLES,
  EVENTS = EVENTS,
  BATTERY = BATTERY,
  EMPTY_ARRAY = EMPTY_ARRAY,
  arr = arr,
  nullish = nullish,
  nn = nn,
  RATS = RATS,
  MODES = MODES,
  spawn_detached = spawn_detached,
  ucall = ucall,
  AT_WAIT_S = AT_WAIT_S,
  daemon_error = daemon_error,
  LIST_FIELDS = LIST_FIELDS,
  job_lists = job_lists,
  job_wait = job_wait,
  job = job,
  at = at,
  parse_list = parse_list,
  pref_line = pref_line,
  pref_raw = pref_raw,
  file_exists = file_exists,
  pending_get = pending_get,
  arm_watchdog = arm_watchdog,
  WINDOW = WINDOW,
  pending_meta = pending_meta,
  pending_info = pending_info,
  read_latest = read_latest,
  before_snapshot = before_snapshot,
  pick_modem = pick_modem,
  SUBID_TTL = SUBID_TTL,
  subid_cache = subid_cache,
  append_event = append_event,
  qspn_plmn = qspn_plmn,
  cimi_imsi = cimi_imsi,
  digits = digits,
  subid_candidates = subid_candidates,
  resolve_sub_id = resolve_sub_id,
  active_slot = active_slot,
  resolve_slot = resolve_slot,
  resolve_active = resolve_active,
  sim_present = sim_present,
  slot_changed = slot_changed,
  glc = glc,
  band_cfg_get = band_cfg_get,
  band_cfg_payload = band_cfg_payload,
  band_cfg_set = band_cfg_set,
  gl_unlock = gl_unlock,
  restore_now = restore_now,
  at_expect = at_expect,
  qnwlock_nums = qnwlock_nums,
  parse_qnwlock4 = parse_qnwlock4,
  parse_qnwlock5 = parse_qnwlock5,
  parse_savectrl = parse_savectrl,
  qeng_csv = qeng_csv,
  parse_serving = parse_serving,
}

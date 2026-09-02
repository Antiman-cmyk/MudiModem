-- Isolation test for set_cell_lock / clear_cell_lock / confirm / revert_now
-- (cell kind). Shims oui.ubus, ngx (glc), os.execute (watchdog arm). No box.
local PENDING = assert(os.getenv("MUDIMODEM_PENDING"))
local ARMED   = assert(os.getenv("MUDIMODEM_ARMED"))

local at_log = {}
local no_slot = false
local no_plmn = false      -- cellular.sim info carries no mcc/mnc (SIM searching / status-0 wedge)
local lock5_reply = '\r\n+QNWLOCK: "common/5g",0\r\n\r\nOK\r\n'
local lock4_reply = '\r\n+QNWLOCK: "common/4g",0\r\n\r\nOK\r\n'
local setfeat_calls = {}
package.loaded["oui.ubus"] = {
  call = function(object, method, params)
    if object == "modem.CPU.AT" and method == "get_result_AT" then
      local cmd = params.cmd
      at_log[#at_log + 1] = cmd .. " @" .. tostring(params.sub_id)
      if cmd == "AT+QSPN" then
        return { data = '\r\n+QSPN: "T-Mobile","T-Mobile","",0,"310260"\r\n\r\nOK\r\n' }
      elseif cmd == 'AT+QNWLOCK="common/4g"' then
        return { data = lock4_reply }
      elseif cmd == 'AT+QNWLOCK="common/5g"' then
        return { data = lock5_reply }
      elseif cmd == 'AT+QNWLOCK="save_ctrl"' then
        return { data = '\r\n+QNWLOCK: "save_ctrl",0,0\r\n\r\nOK\r\n' }
      elseif cmd == 'AT+QNWPREFCFG="mode_pref"' then
        return { data = '\r\n+QNWPREFCFG: "mode_pref",NR5G\r\n\r\nOK\r\n' }
      elseif cmd == 'AT+QNWPREFCFG="nr5g_disable_mode"' then
        return { data = '\r\n+QNWPREFCFG: "nr5g_disable_mode",0\r\n\r\nOK\r\n' }
      end
      return { data = "\r\nOK\r\n" }
    elseif object == "cellular.modem" and method == "status" then
      if no_slot then return { modems = { { bus = "cpu" } } } end
      return { modems = { { bus = "cpu", current_sim_slot = 1 } } }   -- GL's no-arg modems[] form
    elseif object == "cellular.sim" and method == "info" then
      if no_plmn then return { sims = { { slot = 1, mcc = "", mnc = "" } } } end
      return { sims = { { slot = 1, mcc = "310", mnc = "260" } } }
    end
    return {}
  end
}

local glc_calls, glc_fail = {}, false
ngx = {
  HTTP_POST = "POST",
  location = { capture = function(uri, opts)
    local body = opts and opts.body or ""
    glc_calls[#glc_calls + 1] = body
    if glc_fail and body:find("set_cell_tower") then
      return { status = 200, body = "20002044 lock failed" }
    end
    if body:find("get_cell_tower") then
      return { status = 200, body = '0 {"slot1":{},"slot2":{}}' }
    end
    if body:find("get_band_config") then
      return { status = 200, body = '0 {"band_enable":false,"network_mode":"AUTO","supports_band":true}' }
    end
    return { status = 200, body = "0 {}" }
  end },
}

local exec_cmds = {}
os.execute = function(cmd)
  exec_cmds[#exec_cmds + 1] = cmd
  if cmd:find("watch") then local f = io.open(ARMED, "w"); if f then f:close() end end
  return true
end
-- revert_now (cell) runs the watchdog's `restore-now` through io.popen and
-- reads its JSON line. Shim it: record the command and mimic the shell's
-- side effects (pending + armed removed on success, kept on failure).
local popen_cmds, restore_ok = {}, true
local real_popen = io.popen
io.popen = function(cmd)
  popen_cmds[#popen_cmds + 1] = cmd
  if not cmd:find("restore%-now") then return real_popen(cmd) end
  local out
  if restore_ok then
    os.remove(PENDING); os.remove(ARMED)
    out = '{"ok":true,"kind":"cell"}\n'
  else
    out = '{"ok":false,"kind":"cell","error":"nothing could be written back; pending kept, watchdog still armed"}\n'
  end
  return { read = function() return out end, close = function() return true end }
end

local M = dofile(assert(os.getenv("MM_PLUGIN")))
assert(type(M.set_cell_lock) == "function", "set_cell_lock missing")
assert(type(M.clear_cell_lock) == "function", "clear_cell_lock missing")
assert(type(M.scan_cells) == "function", "scan_cells missing")

local function reset()
  at_log = {}; glc_calls = {}; exec_cmds = {}; popen_cmds = {}; restore_ok = true
  os.remove(PENDING); os.remove(ARMED)
  glc_fail = false; no_slot = false; no_plmn = false
  lock5_reply = '\r\n+QNWLOCK: "common/5g",0\r\n\r\nOK\r\n'
  lock4_reply = '\r\n+QNWLOCK: "common/4g",0\r\n\r\nOK\r\n'
end
local function pget(key)
  for line in io.lines(PENDING) do
    local k, v = line:match("^([%w_]+)=(.*)$"); if k == key then return v end
  end
end

-- 1. Happy path: snapshot -> arm -> GL write; pending has the cell layout.
reset()
local r = M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 })
assert(r.ok == true, "should succeed; got " .. tostring(r.error))
assert(r.window == 60 and r.sub_id == 1, "window/sub_id wrong")
assert(pget("KIND") == "cell" and pget("RAT") == "5g", "pending KIND/RAT wrong")
assert(pget("PREV_SAVE_CTRL") == "0,0", "PREV_SAVE_CTRL wrong")
assert(pget("PREV_mode_pref") == "NR5G", "PREV_mode_pref wrong")
local armed_at, wrote_at
for i, c in ipairs(exec_cmds) do if c:find("watch") then armed_at = i end end
for i, c in ipairs(glc_calls) do if c:find("set_cell_tower") then wrote_at = i end end
assert(armed_at and wrote_at, "must arm watchdog and call set_cell_tower")
local set_body = glc_calls[wrote_at]
assert(set_body:find('"lock":true') and set_body:find('"pci":516') and
       set_body:find('"freq":127490') and set_body:find('"scs":15') and
       set_body:find('"band":71') and set_body:find('"network_type":"NR5G"'),
       "set_cell_tower payload wrong: " .. set_body)

-- 2. Refuse while a lock already exists.
reset()
lock5_reply = '\r\n+QNWLOCK: "common/5g",516,127490,15,71\r\n\r\nOK\r\n'
r = M.set_cell_lock({ rat = "5g", pci = 9, freq = 1, scs = 15, band = 71 })
assert(r.error and r.error:find("unlock first"), "must refuse over an existing lock")

-- 3. Refuse while another change is pending.
reset()
local f = io.open(PENDING, "w"); f:write("SUB_ID=1\n"); f:close()
r = M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 })
assert(r.error and r.error:find("pending"), "must refuse while pending exists")

-- 4. Validation: bad rat, missing pci, missing scs on 5g.
reset()
assert(M.set_cell_lock({ rat = "6g", pci = 1, freq = 1 }).error, "bad rat accepted")
assert(M.set_cell_lock({ rat = "5g", freq = 1, scs = 15, band = 71 }).error, "missing pci accepted")
assert(M.set_cell_lock({ rat = "5g", pci = 1, freq = 1 }).error, "5g without scs/band accepted")

-- 5. GL write failure -> pending cleaned up, error surfaced with the code.
reset()
glc_fail = true
r = M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 })
assert(r.error and tostring(r.error):find("20002044"), "GL error code not surfaced")
assert(not io.open(PENDING, "r"), "pending must be removed on GL failure")

-- 6. confirm on a cell pending: clears it and writes NOTHING (GL's store was
--    written when the lock was applied).
reset()
assert(M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 }).ok)
glc_calls = {}
r = M.confirm({})
assert(r.ok and r.confirmed and r.durable == true, "confirm failed")
assert(not io.open(PENDING, "r"), "pending must be gone after confirm")
assert(#glc_calls == 0, "cell confirm must not write anything")

-- 7. revert_now on a cell pending: the modem-side undo is the watchdog's own
--    `restore-now` (ONE implementation — raw-AT unlock + pref restores live in
--    test/revert.test.sh), run FIRST; THEN GL's store is reconciled here.
reset()
assert(M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 }).ok)
at_log = {}; glc_calls = {}; popen_cmds = {}
r = M.revert_now({})
assert(r.ok and r.reverted, "revert_now failed: " .. tostring(r.error))
assert(#popen_cmds == 1 and popen_cmds[1]:find("mudimodem%-revert restore%-now"), "revert_now must run the watchdog's restore-now: " .. tostring(popen_cmds[1]))
for _, c in ipairs(at_log) do assert(not c:find("QNWLOCK") and not c:find("QNWPREFCFG"), "no second AT restore implementation in Lua: " .. c) end
local unlocked
for _, c in ipairs(glc_calls) do if c:find('"lock":false') then unlocked = true end end
assert(unlocked, "revert_now must GL-unlock to reconcile the store (after the modem-side undo)")
assert(r.gl_reconciled == true, "GL reconcile reported")
assert(not io.open(PENDING, "r"), "pending must be gone after revert")

-- 7b. When GL's unlock FAILS, the link is already free (restore-now ran) and
--     the store is reported as not reconciled (get_lock's derived `stale` —
--     GL locked + modem unlocked — then offers "Clear it"; no marker file).
reset()
assert(M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 }).ok)
at_log = {}; glc_calls = {}; popen_cmds = {}
glc_fail = true                       -- set_cell_tower(lock:false) now returns an error code
r = M.revert_now({})
assert(r.ok and r.reverted, "revert_now must still report reverted on GL failure")
assert(#popen_cmds == 1, "restore-now must run regardless of GL")
assert(r.gl_reconciled == false and r.gl_error, "revert_now must report the failed GL reconcile")
assert(not io.open(PENDING, "r"), "pending must be gone after revert even on GL failure")

-- 7c. restore-now itself fails (nothing could be written): pending + watchdog
--     stay, GL is NOT touched (the modem is still locked), error surfaced.
reset()
assert(M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 }).ok)
at_log = {}; glc_calls = {}; popen_cmds = {}
restore_ok = false
r = M.revert_now({})
assert(r.error and r.error:find("pending kept"), "failed restore must say the pending is kept; got " .. tostring(r.error))
for _, c in ipairs(glc_calls) do assert(not c:find("set_cell_tower"), "GL must not be told 'unlocked' while the modem is still locked") end
assert(io.open(PENDING, "r"), "pending must remain for the watchdog")
assert(io.open(ARMED, "r"), "watchdog must stay armed")

-- 8. clear_cell_lock: GL unlock (slot-addressed) + mode restored to AUTO at the
--    CONFIRMED sub_id.
reset()
r = M.clear_cell_lock({})
assert(r.ok and r.mode == "AUTO", "clear_cell_lock failed")
local gl_unlocked, mode_auto
for _, c in ipairs(glc_calls) do if c:find('"lock":false') and c:find('"slot":1') then gl_unlocked = true end end
for _, c in ipairs(at_log) do if c:find('mode_pref",AUTO @1', 1, true) then mode_auto = true end end
assert(gl_unlocked, "clear_cell_lock must GL-unlock slot 1")
assert(mode_auto, "clear_cell_lock must reset mode_pref to AUTO at the matched sub_id")

-- 8b. sub_id UNCONFIRMED (SIM has no PLMN yet): set_cell_lock refuses outright —
--     its PREV snapshot and the watchdog's revert would address a guessed
--     subscription; clear_cell_lock still GL-unlocks the slot (needs no sub_id)
--     but withholds the AT mode writes and says so.
reset()
no_plmn = true
r = M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 })
assert(r.error and r.error:find("sub_id"), "set_cell_lock must refuse on an unconfirmed sub_id; got " .. tostring(r.error))
for _, c in ipairs(glc_calls) do assert(not c:find("set_cell_tower"), "no GL write on an unconfirmed sub_id") end
assert(not io.open(PENDING, "r"), "no pending on refusal")
at_log = {}; glc_calls = {}
r = M.clear_cell_lock({})
assert(r.ok and r.warning and r.warning:find("not reset"), "clear_cell_lock must unlock but warn; got " .. tostring(r.warning))
local gl_unlocked2
for _, c in ipairs(glc_calls) do if c:find('"lock":false') then gl_unlocked2 = true end end
assert(gl_unlocked2, "clear_cell_lock must still GL-unlock the slot")
for _, c in ipairs(at_log) do assert(not c:find("QNWPREFCFG") and not c:find("save_ctrl"), "no AT mode writes at a guessed sub_id: " .. c) end

-- 9. set_bands now ALSO refuses while a pending exists (shared interlock:
-- a band apply must not clobber a cell pending, or vice versa).
reset()
local f9 = io.open(PENDING, "w"); f9:write("KIND=cell\nSUB_ID=1\n"); f9:close()
r = M.set_bands({ sa = { 71 } })
assert(r.error and r.error:find("pending"), "set_bands must refuse while a pending exists")

-- 10. Fail CLOSED when the lock-state read can't be verified: at_expect
-- exhausts its 3 retries on a crossed/non-matching reply, parse_qnwlock5
-- degrades to nil, and set_cell_lock must refuse rather than treat "unknown"
-- the same as "unlocked" (Finding 1). No GL write, no pending file left.
reset()
lock5_reply = '\r\n+QNWPREFCFG: "nr5g_band",71\r\n\r\nOK\r\n'   -- matches no QNWLOCK marker -> crossed
r = M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 })
assert(r.error and r.error:find("could not read"), "must refuse when lock state can't be read; got " .. tostring(r.error))
for _, c in ipairs(glc_calls) do assert(not c:find("set_cell_tower"), "must not call set_cell_tower when lock state is unknown") end
assert(not io.open(PENDING, "r"), "no pending file must remain after a failed-read refusal")

-- 11. No active slot (modem resetting / no SIM): every write REFUSES rather
--     than falling back to slot 1 (which would mis-target SIM2/eSIM).
reset()
no_slot = true
assert(M.set_cell_lock({ rat = "5g", pci = 516, freq = 127490, scs = 15, band = 71 }).error:find("no active SIM"), "set_cell_lock must refuse without a slot")
assert(M.clear_cell_lock({}).error:find("no active SIM"), "clear_cell_lock must refuse without a slot")
assert(M.scan_cells({}).error:find("no active SIM"), "scan_cells must refuse without a slot")
assert(M.set_bands({ sa = { 71 } }).error:find("no active SIM"), "set_bands must refuse without a slot")
for _, c in ipairs(glc_calls) do assert(not c:find("set_cell_tower") and not c:find("scan_cell_tower") and not c:find("set_band_config"), "nothing may be written without a slot") end
assert(not io.open(PENDING, "r"), "no pending may remain")

print("backend-lock-write.test.lua: all ok")

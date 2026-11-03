-- Isolation test for get_lock. Shims oui.ubus (canned AT replies incl. a
-- crossed-reply round) and ngx.location.capture (canned glc bodies). No box.
-- Env (set by runner): MM_PLUGIN, MUDIMODEM_PENDING, MUDIMODEM_ARMED, MUDIMODEM_STALE,
-- MUDIMODEM_LATEST (point at a missing file so the QENG path is exercised; the
-- last scenario points it at a fresh collector sample instead).

local at_log, at_replies = {}, {}
package.loaded["oui.ubus"] = {
  call = function(object, method, params)
    if object == "modem.CPU.AT" and method == "get_result_AT" then
      at_log[#at_log + 1] = params.cmd
      local q = table.remove(at_replies, 1)
      if q ~= nil then return { data = q } end            -- scripted (crossed) reply
      local cmd = params.cmd
      if cmd == "AT+QSPN" then
        return { data = '\r\n+QSPN: "T-Mobile","T-Mobile","",0,"310260"\r\n\r\nOK\r\n' }
      elseif cmd == 'AT+QNWLOCK="common/4g"' then
        return { data = '\r\n+QNWLOCK: "common/4g",0\r\n\r\nOK\r\n' }
      elseif cmd == 'AT+QNWLOCK="common/5g"' then
        return { data = '\r\n+QNWLOCK: "common/5g",516,127490,15,71\r\n\r\nOK\r\n' }
      elseif cmd == 'AT+QNWLOCK="save_ctrl"' then
        return { data = '\r\n+QNWLOCK: "save_ctrl",0,0\r\n\r\nOK\r\n' }
      elseif cmd == 'AT+QENG="servingcell"' then
        return { data = '\r\n+QENG: "servingcell","NOCONN","NR5G-SA","FDD",310,260,18B1AE035,516,870100,127490,71,2,-98,-12,13,0,-\r\n\r\nOK\r\n' }
      end
      return { data = "\r\nOK\r\n" }
    elseif object == "cellular.modem" and method == "status" then
      return { modems = { { bus = "cpu", current_sim_slot = 1 } } }   -- GL's no-arg modems[] form
    elseif object == "cellular.sim" and method == "info" then
      return { sims = { { slot = 1, mcc = "310", mnc = "260" } } }
    end
    return {}
  end
}

local base_ubus_call = package.loaded["oui.ubus"].call

-- glc stub: nginx subrequest to GL's C plugins. Body format: "<code> <json>".
local glc_calls = {}
local glc_body = '0 {"slot1":{"cellid":"18B1AE035","network_type":"NR5G","pci":516,"freq":127490,"scs":15,"band":71},"slot2":{}}'
ngx = {
  HTTP_POST = "POST",
  location = { capture = function(uri, opts)
    glc_calls[#glc_calls + 1] = { uri = uri, body = opts and opts.body }
    return { status = 200, body = glc_body }
  end },
}

local M = dofile(assert(os.getenv("MM_PLUGIN"), "set MM_PLUGIN"))
assert(type(M.get_lock) == "function", "get_lock missing")

-- 1. Locked-5g picture: modem truth + GL store + serving cell all parsed.
local r = M.get_lock({})
assert(r.lock.l4g.locked == false, "4g should be unlocked")
assert(r.lock.l5g.locked == true, "5g should be locked")
assert(r.lock.l5g.pci == 516 and r.lock.l5g.freq == 127490, "5g pci/freq wrong")
assert(r.lock.l5g.scs == 15 and r.lock.l5g.band == 71, "5g scs/band wrong")
assert(r.lock.save_ctrl.raw == "0,0", "save_ctrl raw wrong")
assert(r.gl.locked == true, "GL store should show locked")
assert(r.gl.tower.pci == 516, "GL tower passthrough wrong")
assert(r.serving.rat == "NR5G-SA", "serving rat wrong")
assert(r.serving.pci == 516 and r.serving.arfcn == 127490 and r.serving.band == 71,
       "serving pci/arfcn/band wrong")
assert(r.stale == false, "agreeing stores must not be stale")
assert(r.meta.sub_id == 1, "sub_id must be PLMN-matched")
-- glc was called with the right object/method
assert(glc_calls[1].body:find('"get_cell_tower"'), "must call modem.get_cell_tower")

-- 2. Crossed-reply guard: first reply is the WRONG payload; must retry.
at_replies = { '\r\n+QNWPREFCFG: "nr5g_band",71\r\n\r\nOK\r\n' }   -- crossed junk
r = M.get_lock({})
assert(r.lock.l4g and r.lock.l4g.locked == false, "guard must retry past crossed reply")

-- 3. Stale detection: GL locked, modem unlocked -> stale=true.
glc_body = '0 {"slot1":{"cellid":"X","network_type":"NR5G","pci":9,"freq":1,"scs":15,"band":71},"slot2":{}}'
package.loaded["oui.ubus"].call = (function(orig)
  return function(o, m, p)
    if o == "modem.CPU.AT" and p and p.cmd == 'AT+QNWLOCK="common/5g"' then
      return { data = '\r\n+QNWLOCK: "common/5g",0\r\n\r\nOK\r\n' }
    end
    return orig(o, m, p)
  end
end)(package.loaded["oui.ubus"].call)
r = M.get_lock({})
assert(r.lock.l5g.locked == false and r.gl.locked == true, "setup wrong")
assert(r.stale == true, "GL-locked + modem-unlocked must be stale")

-- 4. 4G-locked parse branch: field order must be mode,freq,pci (modem.sh:940-942).
package.loaded["oui.ubus"].call = (function(orig)
  return function(o, m, p)
    if o == "modem.CPU.AT" and p and p.cmd == 'AT+QNWLOCK="common/4g"' then
      return { data = '\r\n+QNWLOCK: "common/4g",1,900,42\r\n\r\nOK\r\n' }
    end
    return orig(o, m, p)
  end
end)(base_ubus_call)
glc_body = '0 {"slot1":{"cellid":"18B1AE035","network_type":"NR5G","pci":516,"freq":127490,"scs":15,"band":71},"slot2":{}}'
at_replies = {}
r = M.get_lock({})
assert(r.lock.l4g.locked == true, "4g should be locked")
assert(r.lock.l4g.mode == 1, "4g mode wrong")
assert(r.lock.l4g.freq == 900, "4g freq wrong")
assert(r.lock.l4g.pci == 42, "4g pci wrong")

-- 4b. ChiliApple #2: NSA multi-line QENG — header has no cell fields; real data
--     is on the LTE / NR5G-NSA lines. Prefer NR5G-NSA for the serving summary.
package.loaded["oui.ubus"].call = (function(orig)
  return function(o, m, p)
    if o == "modem.CPU.AT" and p and p.cmd == 'AT+QENG="servingcell"' then
      return { data = '\r\n+QENG: "servingcell","NOCONN"\r\n'
        .. '+QENG: "LTE","FDD",232,01,DF30C,61,1700,3,5,5,41,-97,-7,-69,18,12,150,-\r\n'
        .. '+QENG: "NR5G-NSA",232,01,61,-96,24,-10,425090,1,4,0\r\n\r\nOK\r\n' }
    end
    return orig(o, m, p)
  end
end)(base_ubus_call)
glc_body = '0 {"slot1":{},"slot2":{}}'
at_replies = {}
r = M.get_lock({})
assert(r.serving and r.serving.rat == "NR5G-NSA",
       "NSA multi-line must pick NR5G-NSA, got " .. tostring(r.serving and r.serving.rat))
assert(r.serving.pci == 61 and r.serving.arfcn == 425090 and r.serving.band == 1,
       "NSA pci/arfcn/band wrong")
-- the LTE line is the NR leg's anchor, and the cell ID is its (the NR line has none)
assert(r.serving.anchor and r.serving.anchor.rat == "LTE" and r.serving.anchor.cell_id == "DF30C"
       and r.serving.anchor.band == 3 and r.serving.anchor.pci == 61 and r.serving.anchor.arfcn == 1700,
       "NSA QENG: the LTE line must ride along as the anchor")
assert(r.serving.cell_id == nil, "NSA QENG: no cell ID on the NR leg")

-- 4c. Multi-line LTE-only (no NR line) falls back to the LTE row.
package.loaded["oui.ubus"].call = (function(orig)
  return function(o, m, p)
    if o == "modem.CPU.AT" and p and p.cmd == 'AT+QENG="servingcell"' then
      return { data = '\r\n+QENG: "servingcell","NOCONN"\r\n'
        .. '+QENG: "LTE","FDD",232,01,DF30C,61,1700,3,5,5,41,-97,-7,-69,18,12,150,-\r\n'
        .. '\r\nOK\r\n' }
    end
    return orig(o, m, p)
  end
end)(base_ubus_call)
at_replies = {}
r = M.get_lock({})
assert(r.serving and r.serving.rat == "LTE",
       "LTE multi-line fallback wrong: " .. tostring(r.serving and r.serving.rat))
assert(r.serving.pci == 61 and r.serving.arfcn == 1700 and r.serving.band == 3,
       "LTE multi-line pci/arfcn/band wrong")

-- 5. at_expect retry exhaustion: three consecutive crossed replies for one
--    query must degrade that field to nil, not throw. Note: get_lock also
--    resolves the active sub_id via QSPN before the QNWLOCK reads, so a
--    shared at_replies queue would get eaten by that unrelated call first —
--    target the "common/4g" cmd specifically instead, leaving QSPN/others on
--    their normal defaults.
local junk = '\r\n+QNWPREFCFG: "nr5g_band",71\r\n\r\nOK\r\n'   -- matches no QNWLOCK/QENG marker
package.loaded["oui.ubus"].call = (function(orig)
  return function(o, m, p)
    if o == "modem.CPU.AT" and p and p.cmd == 'AT+QNWLOCK="common/4g"' then
      return { data = junk }   -- always wrong; exhausts all 3 at_expect retries
    end
    return orig(o, m, p)
  end
end)(base_ubus_call)
glc_body = '0 {"slot1":{"cellid":"18B1AE035","network_type":"NR5G","pci":516,"freq":127490,"scs":15,"band":71},"slot2":{}}'
at_replies = {}
r = M.get_lock({})
assert(type(r) == "table", "get_lock must not throw on exhausted retries")
assert(r.lock.l4g == nil, "4g must degrade to nil after 3 crossed replies")
assert(r.lock.l5g and r.lock.l5g.locked == true, "later fields must still parse normally")

-- 6. stale formula's gl_locked conjunct: GL unlocked + modem unlocked must NOT
--    be stale. Isolates gl_locked from a regression that simplifies stale to
--    just `not modem_locked` (which would wrongly report true here).
package.loaded["oui.ubus"].call = (function(orig)
  return function(o, m, p)
    if o == "modem.CPU.AT" and p and p.cmd == 'AT+QNWLOCK="common/5g"' then
      return { data = '\r\n+QNWLOCK: "common/5g",0\r\n\r\nOK\r\n' }
    end
    return orig(o, m, p)
  end
end)(base_ubus_call)
glc_body = '0 {"slot1":{},"slot2":{}}'   -- no cellid -> gl_locked=false
at_replies = {}
r = M.get_lock({})
assert(r.lock.l4g.locked == false and r.lock.l5g.locked == false, "modem must be unlocked")
assert(r.gl.locked == false, "GL store must show unlocked")
assert(r.stale == false, "gl_locked=false + modem unlocked must not be stale")

-- 7. A FRESH collector sample (latest.json < 30 s) replaces the QENG read:
--    the serving cell comes from it and no AT+QENG is spent.
local latest = os.getenv("MUDIMODEM_LATEST")
if latest then
  local lf = io.open(latest, "w")
  lf:write(string.format('{"t":%.0f,"slot":1,"rat":"NR5G-SA","mode":"NR5G-SA","cell_id":"DE017C015","id":"DE017C015","pci":142,"tx_channel":627264,"band":78,"rsrp":-94}', os.time() * 1000))
  lf:close()
  package.loaded["oui.ubus"].call = base_ubus_call
  at_log = {}; at_replies = {}
  r = M.get_lock({})
  assert(r.serving and r.serving.source == "collector", "fresh latest.json must feed the serving cell")
  assert(r.serving.pci == 142 and r.serving.arfcn == 627264 and r.serving.band == 78 and r.serving.rat == "NR5G-SA")
  for _, c in ipairs(at_log) do assert(not c:find("QENG"), "must not spend a QENG read when the collector is fresh") end
  os.remove(latest)

  -- 7b. A fresh NO-SERVICE sample is written with "pci": null / "tx_channel":
  --     null. cjson.null is a truthy userdata: the shortcut must NOT take it
  --     as a PCI — it falls back to the QENG read and never returns nulls.
  lf = io.open(latest, "w")
  lf:write(string.format('{"t":%.0f,"slot":1,"rat":null,"mode":null,"cell_id":null,"id":null,"pci":null,"tx_channel":null,"band":null,"rsrp":null,"signals":[]}', os.time() * 1000))
  lf:close()
  at_log = {}; at_replies = {}
  r = M.get_lock({})
  assert(r.serving and r.serving.source ~= "collector", "a null-valued sample must not be presented as the serving cell")
  assert(r.serving.pci == 516 and r.serving.rat == "NR5G-SA", "must fall back to the QENG serving cell")
  local spent_qeng = false
  for _, c in ipairs(at_log) do if c:find("QENG") then spent_qeng = true end end
  assert(spent_qeng, "the QENG fallback must run when the collector sample is null")

  -- 7c. NSA: the flattened aliases are the LTE ANCHOR (B3 / 1700) while rat is
  --     NR5G-NSA. The lock target must be the NR leg, taken from signals[].
  lf = io.open(latest, "w")
  lf:write(string.format('{"t":%.0f,"slot":1,"rat":"NR5G-NSA","mode":"NR5G-NSA","pcc_rat":"LTE","cell_id":"DF30C","id":"DF30C","pci":61,"tx_channel":1700,"band":3,"rsrp":-97,'
    .. '"signals":[{"role":"PCC","rat":"LTE","network_type":4,"band":3,"earfcn":1700,"pci":61},{"role":"SCC1","rat":"NR5G-NSA","network_type":51,"band":78,"earfcn":627264,"pci":142}]}', os.time() * 1000))
  lf:close()
  at_log = {}; at_replies = {}
  r = M.get_lock({})
  assert(r.serving.source == "collector" and r.serving.rat == "NR5G-NSA", "NSA sample with an NR row must feed the serving cell")
  assert(r.serving.pci == 142 and r.serving.arfcn == 627264 and r.serving.band == 78,
         "NSA lock target must be the NR leg, not the LTE anchor (got pci " .. tostring(r.serving.pci) .. ")")

  -- 7d. NSA sample with ONLY the anchor row (the issue-#5 shape): decline the
  --     shortcut and let QENG answer (its parser prefers the NR5G-NSA line).
  lf = io.open(latest, "w")
  lf:write(string.format('{"t":%.0f,"slot":1,"rat":"NR5G-NSA","mode":"NR5G-NSA","pcc_rat":"LTE","cell_id":"DF30C","id":"DF30C","pci":61,"tx_channel":1700,"band":3,'
    .. '"signals":[{"role":"PCC","rat":"LTE","network_type":4,"band":3,"earfcn":1700,"pci":61}]}', os.time() * 1000))
  lf:close()
  at_log = {}; at_replies = {}
  r = M.get_lock({})
  assert(r.serving.source ~= "collector", "an anchor-only NSA sample must not become a 5G lock target")
  spent_qeng = false
  for _, c in ipairs(at_log) do if c:find("QENG") then spent_qeng = true end end
  assert(spent_qeng, "QENG must answer for an anchor-only NSA sample")
  os.remove(latest)
end

-- 7e. The router keeps the last scan: get_lock returns it for the SAME slot only.
do
  local hist = assert(os.getenv("MUDIMODEM_HIST"), "runner sets MUDIMODEM_HIST")
  local sp = hist .. "/last-scan.json"
  local sf = assert(io.open(sp, "w"))
  sf:write('{"towers":[{"pci":101,"freq":627264,"network_type":"5G SA","band":78,"scs":30}],"ts":1700000000000,"slot":1}')
  sf:close()
  r = M.get_lock({})
  assert(r.last_scan and r.last_scan.slot == 1 and #r.last_scan.towers == 1 and r.last_scan.towers[1].pci == 101,
         "get_lock must hand back this SIM's last scan")
  sf = assert(io.open(sp, "w")); sf:write('{"towers":[],"ts":1700000000000,"slot":2}'); sf:close()
  assert(M.get_lock({}).last_scan == nil, "another SIM's scan is not this SIM's")
  sf = assert(io.open(sp, "w")); sf:write('not json'); sf:close()
  assert(M.get_lock({}).last_scan == nil, "a broken file is no scan")
  os.remove(sp)
  assert(M.get_lock({}).last_scan == nil, "no file, no scan")
end

-- 7f. test/fixtures/carriers.json — the one table the page (test/carriers.test.js) reads too: for
--     every case, cellular_compat turns GL's cell_info into the fixture's sample, and get_lock
--     names the fixture's lock target (+ the NSA anchor, which owns the cell ID). A case whose
--     sample cannot name the target (lock = null) falls back to QENG. The hourly summary line
--     (mudimodemd/summary.lua) keeps every carrier's rat + band, PCC first, for the long-term table.
if latest then
  local cjson = require "cjson"
  local here = (arg and arg[0] and arg[0]:match("^(.*)/[^/]*$")) or "test"
  local ff = assert(io.open(here .. "/fixtures/carriers.json"))
  local fix = cjson.decode(ff:read("*a")); ff:close()
  local compat = dofile(here .. "/../src/lib/cellular_compat.lua")
  local summary = dofile(here .. "/../src/lib/mudimodemd/summary.lua")
  compat.init(cjson.null)
  local function same(a, b, path)
    if type(a) ~= type(b) then error(path .. ": " .. tostring(a) .. " vs " .. tostring(b), 2) end
    if type(a) ~= "table" then
      if a ~= b then error(path .. ": " .. tostring(a) .. " vs " .. tostring(b), 2) end
      return
    end
    for k, v in pairs(a) do same(v, b[k], path .. "." .. tostring(k)) end
    for k in pairs(b) do if a[k] == nil then error(path .. "." .. tostring(k) .. " missing", 2) end end
  end
  local nn = function(v) if v == cjson.null then return nil end return v end
  local ms = { modems = { { bus = "cpu", current_sim_slot = 1, status = 0 } } }
  package.loaded["oui.ubus"].call = base_ubus_call
  for _, c in ipairs(fix.cases) do
    local nets = { networks = { { bus = "cpu", slot = 1, carrier = c.carrier } } }
    local built = compat.build_sample(ms, c.cell_info, nets, c.sample.t, "cpu", nil, cjson.empty_array)
    same(cjson.decode(cjson.encode(built)), c.sample, c.name .. ": build_sample")

    local acc = summary.new(3600, 10)
    acc.add(c.sample); acc.add(c.sample)
    local line = acc.drain()[1]
    local want_sigs, seen = {}, {}
    for _, g in ipairs(c.sample.signals) do
      local k = tostring(g.rat) .. "|" .. tostring(g.band)
      if not seen[k] then seen[k] = true; want_sigs[#want_sigs + 1] = { rat = g.rat, band = g.band } end
    end
    same(line.signals, want_sigs, c.name .. ": summary signals")

    local s = cjson.decode(cjson.encode(c.sample)); s.t = os.time() * 1000
    local lf = io.open(latest, "w"); lf:write(cjson.encode(s)); lf:close()
    at_log = {}; at_replies = {}
    r = M.get_lock({})
    local want = nn(c.expect.lock)
    if want then
      assert(r.serving.source == "collector", c.name .. ": the sample names the target")
      for _, k in ipairs({ "rat", "pci", "arfcn", "band" }) do
        assert(r.serving[k] == want[k], c.name .. ": serving." .. k .. " = " .. tostring(r.serving[k]) .. ", want " .. tostring(want[k]))
      end
      local an = nn(c.expect.anchor)
      if an then
        same(r.serving.anchor, an, c.name .. ": anchor")
        assert(r.serving.cell_id == nil, c.name .. ": the cell ID is the anchor's, not the NR leg's")
      else
        assert(r.serving.anchor == nil, c.name .. ": no anchor outside NSA")
        assert(r.serving.cell_id == c.sample.cell_id, c.name .. ": cell ID")
      end
    else
      assert(r.serving == nil or r.serving.source ~= "collector", c.name .. ": no target in the sample -> QENG")
    end
    os.remove(latest)
  end
end

-- 8. No active slot (modem resetting / no SIM): get_lock refuses like every
--    other resolve_active() caller instead of reading the fallback sub_id.
package.loaded["oui.ubus"].call = (function(orig)
  return function(o, m, p)
    if o == "cellular.modem" and m == "status" then return { modems = { { bus = "cpu" } } } end
    return orig(o, m, p)
  end
end)(base_ubus_call)
at_log = {}; at_replies = {}
r = M.get_lock({})
assert(r.error and r.error:find("no active SIM"), "get_lock must refuse without a slot; got " .. tostring(r.error))
for _, c in ipairs(at_log) do assert(not c:find("QNWLOCK") and not c:find("QENG"), "no lock/serving AT reads without a slot: " .. c) end
package.loaded["oui.ubus"].call = base_ubus_call

print("backend-lock.test.lua: all ok")

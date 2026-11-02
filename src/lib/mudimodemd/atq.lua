-- mudimodemd/atq.lua — the daemon's AT queue (eco). One sequence on the channel at a time, FIFO;
-- each request is a job the page waits on in slices (a call through GL's ubus proxy must answer
-- within 30 s, a sequence can take 8 x 65 s). The engine is mudimodemd/at.lua.
--
--   start(cmd, timeout)  -> { id } | { error }        validate + queue; returns at once
--   wait(id, wait_s)     -> result (done = true) | { done = false, pending = true, id, state,
--                           steps so far }            waits up to wait_s for the job to finish
local time = require "eco.time"
local sync = require "eco.sync"
local cc = require "cellular_compat"
local at = require "mudimodemd.at"
local atport = require "mudimodemd.atport"

local M = {}

function M.new(conn, atconn, opts)
  opts = opts or {}
  local bus = opts.bus or "cpu"
  local keep_s = opts.keep_s or 300                  -- a finished job's result stays this long
  local max_queue = opts.max_queue or 4
  local log = opts.log or function() end

  local self = { stats = { at_jobs = 0, at_queue = 0, at_running = false } }
  local jobs, queue = {}, {}
  -- ids survive nothing, so start somewhere a restarted daemon will not reuse; < 2^31 because
  -- the plugin's Lua 5.1 integers are 32-bit
  local next_id = (os.time() % 1000000) * 100 + 1
  local wake = sync.cond()

  local function now_ms() return math.floor(time.now() * 1000) end

  -- GL's AT service on the dedicated connection: the runner is the only user, so setting the
  -- per-step timeout (the AT timeout + 5 s, as the plugin's `ubus -t`) cannot race anything.
  local function gl(cmd, timeout, sub_id)
    local req = { cmd = cmd, timeout = timeout, source_flag = 1 }
    if sub_id then req.sub_id = sub_id end
    atconn:settimeout(timeout + 5)
    local r, err = atconn:call("modem.CPU.AT", "get_result_AT", req)
    if r == nil then
      if err == "not found" then return nil, "not_found" end
      if err == "timeout" then return nil, "timeout" end
      return nil, tostring(err)
    end
    if type(r.data) ~= "string" then return nil, "reply without data" end
    return r.data
  end

  -- The direct port (/dev/at_mdm0), only when GL's AT service is not registered (atport.lua).
  local port = atport.new({ port = opts.port, state = opts.state })
  local function direct(steps, timeout) return port.run(steps, timeout) end

  -- The active slot, or nil. 0 is not a slot (no SIM / modem resetting): it must never become
  -- sub_id=0 (CLAUDE.md invariant) — no slot means no sub_id, as the plugin always did.
  local function active_slot()
    local s = cc.active_slot(conn:call("cellular.modem", "status", {}), bus)
    if s and s >= 1 then return s end
    return nil
  end

  local function expire()
    local now = time.now()
    for id, j in pairs(jobs) do
      if j.done_at and now - j.done_at > keep_s then jobs[id] = nil end
    end
  end

  local function run_job(j)
    j.state = "running"; self.stats.at_running = true
    local slot = active_slot()
    j.partial = { ok = true, requested = #j.steps, ran = 0, aborted = false, steps = {},
                  transport = "gl", slot = slot, sub_id = slot }
    local ok, res = pcall(at.run, j.steps, j.timeout, slot, {
      gl = gl, direct = direct, now_ms = now_ms,
      on_step = function(_, _, r) j.partial = r; j.changed:broadcast() end,
    })
    if not ok then log("at: " .. tostring(res)); res = { error = "AT run failed: " .. tostring(res) } end
    j.result, j.state, j.done_at = res, "done", time.now()
    self.stats.at_running = false
    j.changed:broadcast()
  end

  eco.run(function()
    while true do
      local j = table.remove(queue, 1)
      self.stats.at_queue = #queue
      if j then run_job(j) else wake:wait(60); expire() end
    end
  end)

  function self.start(cmd, timeout)
    local steps, t = at.parse(cmd, timeout)
    if not steps then return { error = t } end
    local pending = #queue + (self.stats.at_running and 1 or 0)
    if pending >= max_queue then return { error = "AT queue full (" .. pending .. " waiting); try again shortly" } end
    local id = next_id; next_id = next_id + 1
    jobs[id] = { id = id, steps = steps, timeout = t, state = "queued", changed = sync.cond() }
    queue[#queue + 1] = jobs[id]
    self.stats.at_jobs = self.stats.at_jobs + 1
    self.stats.at_queue = #queue
    wake:broadcast()
    return { id = id, queued = pending }
  end

  function self.wait(id, wait_s)
    id = tonumber(id)
    local j = id and jobs[math.floor(id)]
    if not j then return { error = "unknown AT job (finished long ago, or the daemon restarted)" } end
    wait_s = tonumber(wait_s) or 20
    if wait_s > 25 then wait_s = 25 end
    if wait_s < 0 then wait_s = 0 end
    local deadline = time.now() + wait_s
    while j.state ~= "done" do
      local left = deadline - time.now()
      if left <= 0 then break end
      j.changed:wait(left)
    end
    if j.state == "done" then
      local r = {}
      for k, v in pairs(j.result) do r[k] = v end
      r.done, r.id = true, j.id
      return r
    end
    local p = j.partial or { steps = {}, requested = #j.steps, ran = 0 }
    return { done = false, pending = true, id = j.id, state = j.state, requested = p.requested,
             ran = p.ran, steps = p.steps, transport = p.transport, slot = p.slot, sub_id = p.sub_id }
  end

  return self
end

return M

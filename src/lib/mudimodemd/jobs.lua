-- mudimodemd/jobs.lua — background jobs for work too slow for one RPC (eco). A job starts at
-- once; the caller waits on it in slices (`wait`), because one call through GL's ubus proxy must
-- answer within 30 s. Kinds run concurrently; a kind registered `single` never runs twice at
-- once — a second start joins the running job (two cell scans would be two AT+QSCANs).
--
--   start(kind, args) -> { id, joined? } | { error }
--   wait(id, wait_s)  -> the job's result + done = true | { done = false, pending = true, id,
--                        kind, state, started }      waits up to wait_s (<= 25) for it to finish
local time = require "eco.time"
local sync = require "eco.sync"

local M = {}

function M.new(opts)
  opts = opts or {}
  local keep_s = opts.keep_s or 300               -- a finished job's result stays this long
  local log = opts.log or function() end
  local self = { stats = { jobs = 0, jobs_running = 0 } }
  local kinds, jobs = {}, {}
  local next_id = (os.time() % 1000000) * 100 + 51  -- < 2^31: the plugin's Lua 5.1 ints are 32-bit

  -- run(args, job) -> result table (yields freely); `single`: one at a time per kind
  function self.register(kind, run, o)
    kinds[kind] = { run = run, single = o and o.single }
  end

  local function expire()
    local now = time.now()
    for id, j in pairs(jobs) do
      if j.done_at and now - j.done_at > keep_s then jobs[id] = nil end
    end
  end

  function self.start(kind, args)
    local k = type(kind) == "string" and kinds[kind]
    if not k then return { error = "unknown job kind: " .. tostring(kind) } end
    expire()
    if k.single then
      for _, j in pairs(jobs) do
        if j.kind == kind and j.state ~= "done" then return { id = j.id, joined = true } end
      end
    end
    local id = next_id; next_id = next_id + 1
    local j = { id = id, kind = kind, state = "running", started = os.time(), changed = sync.cond() }
    jobs[id] = j
    self.stats.jobs = self.stats.jobs + 1
    self.stats.jobs_running = self.stats.jobs_running + 1
    eco.run(function()
      local ok, res = pcall(k.run, type(args) == "table" and args or {}, j)
      if not ok then
        log("job " .. kind .. ": " .. tostring(res))
        res = { error = kind .. " failed: " .. tostring(res) }
      elseif type(res) ~= "table" then
        res = { error = kind .. " returned nothing" }
      end
      j.result, j.state, j.done_at = res, "done", time.now()
      self.stats.jobs_running = self.stats.jobs_running - 1
      j.changed:broadcast()
    end)
    return { id = id }
  end

  function self.wait(id, wait_s)
    id = tonumber(id)
    local j = id and jobs[math.floor(id)]
    if not j then return { error = "unknown job (finished long ago, or the daemon restarted)" } end
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
    return { done = false, pending = true, id = j.id, kind = j.kind, state = j.state, started = j.started }
  end

  return self
end

return M

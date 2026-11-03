-- mudimodemd/change.lua — the parts of a confirm-or-revert change that used to hold GL's ONE
-- nginx worker (eco). Deliberately NOT the safety net itself: the window timer, the restore,
-- boot-check and `panic` stay in src/sbin/mudimodem-revert, which needs nothing else running
-- (docs/architecture.md D2). This only does the waiting:
--
--   arm()      spawn the watchdog exactly as the plugin did (mudimodem-detach … watch &) and
--              wait for its arm marker — the plugin then writes, or refuses: no net, no write.
--              The plugin used to `sleep 1` in the worker for this.
--   restore()  the page's "Revert now" for a cell lock: the watchdog's own `restore-now`
--              (one implementation of the modem-side undo), plus --reconcile — GL's stored
--              lock cleared through gl-session -> nginx /rpc, which an nginx worker could
--              not do itself without deadlocking on the single worker.
-- procd stops us with kill(pid) only (never the group: 🟢 /sbin/procd), so a watchdog we
-- spawned outlives a daemon restart, as one spawned by nginx outlives an nginx restart.
local time = require "eco.time"
local sys = require "eco.sys"
local cjson = require "cjson"

local M = {}

local function shq(s) return "'" .. tostring(s):gsub("'", "'\\''") .. "'" end

local function exists(p)
  local f = io.open(p, "r")
  if f then f:close(); return true end
  return false
end

function M.config()
  return {
    bin = os.getenv("MUDIMODEM_BIN") or "/usr/sbin/mudimodem-revert",
    detach = os.getenv("MUDIMODEM_DETACH") or "/usr/lib/mudimodem/mudimodem-detach",
    armed = os.getenv("MUDIMODEM_ARMED") or "/etc/mudimodem/armed",
    arm_wait_s = tonumber(os.getenv("MUDIMODEM_ARM_WAIT") or "") or 5,
  }
end

function M.new(cfg, log)
  cfg = cfg or M.config()
  log = log or function() end
  local self = { stats = { arms = 0, arm_failures = 0 } }

  -- { armed = true } once the watchdog's marker is there, { armed = false, error } after
  -- arm_wait_s without it. The plugin removed the old marker (a newer change supersedes a
  -- still-sleeping older watchdog: its nonce no longer matches); removing it again is harmless.
  function self.arm()
    os.remove(cfg.armed)
    -- the plugin's own spawn_detached command, byte for byte: the watchdog is a grandchild
    -- (the shell exits at once), with nginx's — here our — descriptors closed by the helper
    local p, err = sys.exec("/bin/sh", "-c", shq(cfg.detach) .. " " .. shq(cfg.bin) .. " watch >/dev/null 2>&1 &")
    if not p then
      self.stats.arm_failures = self.stats.arm_failures + 1
      return { armed = false, error = "cannot start the revert watchdog: " .. tostring(err) }
    end
    p:read_stdout("*a", 5)
    p:close()
    local deadline = time.now() + cfg.arm_wait_s
    while not exists(cfg.armed) do
      if time.now() >= deadline then
        self.stats.arm_failures = self.stats.arm_failures + 1
        log("change: the revert watchdog did not arm within " .. cfg.arm_wait_s .. " s")
        return { armed = false, error = "revert watchdog failed to arm" }
      end
      time.sleep(0.05)
    end
    self.stats.arms = self.stats.arms + 1
    return { armed = true }
  end

  -- The page-facing answer of revert_now for a cell lock (a job: AT steps can take long).
  function self.restore()
    local p, err = sys.exec(cfg.bin, "restore-now", "--reconcile")
    if not p then return { error = "restore failed: cannot start the watchdog: " .. tostring(err) } end
    local out = p:read_stdout("*a", 150)
    if out == nil then
      sys.kill(p:pid(), sys.SIGKILL)
      p:close()
      return { error = "restore failed: restore-now did not finish (pending kept, watchdog still armed)" }
    end
    p:close()
    local line = out:match("(%b{})")
    local ok, r = pcall(cjson.decode, line or "")
    if not ok or type(r) ~= "table" then
      return { error = "restore failed: restore-now gave no answer (pending kept, watchdog still armed)" }
    end
    if r.ok ~= true then
      return { error = "restore failed: " .. tostring(r.error or "nothing could be written back")
                       .. " (pending kept, watchdog still armed)" }
    end
    if r.nothing_pending then return { ok = true, note = "nothing pending" } end
    local rec = r.gl_reconciled == true
    return { ok = true, reverted = true, gl_reconciled = rec,
             gl_error = (not rec) and "GL's stored lock could not be cleared (see /var/log/mudimodem-revert.log)" or nil }
  end

  return self
end

return M

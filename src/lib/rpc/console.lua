-- MudiModem RPC backend: the AT console and the AT library (both mudimodemd jobs).
-- Part of the nginx plugin (src/rpc/mudimodem loads it): adds its methods to M; C = core.lua.
return function(M, C)
local ucall, AT_WAIT_S, daemon_error, job_lists, job = C.ucall, C.AT_WAIT_S, C.daemon_error, C.job_lists, C.job

-- ============================ Phase 3: AT console ============================
-- The console's AT runs in mudimodemd (src/lib/mudimodemd/at.lua + atq.lua): GL's own AT
-- service first — `modem.CPU.AT get_result_AT {cmd, timeout, source_flag:1, sub_id = the active
-- slot}`, the call GL's web console makes (modem_AT queues every caller on one IO thread,
-- drains stale bytes, selects the subscription with AT+QUIMSUB; docs/cellular-api-4.10.md §5) —
-- and the direct-port tool only when that service is not registered.
--
-- This used to run here, and every step held GL's ONE nginx worker (io.popen) for up to
-- timeout + 5 s: the whole admin froze while the console waited. Now it is forwarded (see
-- "mudimodemd" at the top): at_console queues the sequence and waits one slice; a sequence can
-- take 8 x 65 s, so a {pending, id} reply continues with at_result.
local function at_wait(id)
  local r, err = ucall("mudimodem", "at_wait", { id = id, wait = AT_WAIT_S })
  if type(r) ~= "table" then return { error = daemon_error(err) } end
  job_lists(r)          -- a sequence that has not finished its first step: steps {} -> []
  return r
end

-- args = { cmd = "AT+X\nAT+Y" (one step per line, max 8 x 256 chars), timeout = s per step }
function M.at_console(args)
  local cmd = args and args.cmd
  if type(cmd) ~= "string" then return { error = "cmd required" } end
  local r, err = ucall("mudimodem", "at_start", { cmd = cmd, timeout = tonumber(args.timeout) or 8 })
  if type(r) ~= "table" then return { error = daemon_error(err) } end
  if r.error then return { error = r.error } end
  return at_wait(r.id)
end

-- args = { id } from a {pending} reply: the same reply shape, waiting up to AT_WAIT_S again.
function M.at_result(args)
  local id = tonumber(args and args.id)
  if not id then return { error = "id required" } end
  return at_wait(math.floor(id))
end

-- ======================= Phase: AT library sync (check/refresh) ==============
-- The library check/refresh (a GitHub fetch) runs as a mudimodemd job (tasks.lua); its answer comes back
-- verbatim: check -> {local_revision, remote_revision, update_available, checked, error?},
-- refresh -> {ok, revision, count, error?}. Either may come back {pending, id} (job_result).
function M.library_status(args)
  return job("lib_check")
end

function M.refresh_library(args)
  return job("lib_refresh")
end

end

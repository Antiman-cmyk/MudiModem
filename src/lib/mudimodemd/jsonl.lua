-- mudimodemd/jsonl.lua — the history files: append-ordered JSON lines, each with an epoch-ms `t`.
--
-- A port of the python collector's file helpers (trim, the two-segment eMMC backup, boot restore;
-- retired in R3 ⑤): test/jsonl-golden.test.py holds it to their answers and the bytes they left
-- on disk (test/golden/jsonl.json). Lua 5.1/5.4 common subset, plain io/os only, so host Lua, the router's Lua and eco
-- can all run it. Two hooks the daemon fills in (defaults work without them):
--   M.sleep(s)    yields during a shared trim's grace window (eco.time.sleep); nil = no grace wait
--   M.mkdir(p)    one directory level (eco.file.mkdir); nil = `mkdir -p` via os.execute
local cjson = require "cjson"

local M = {}

M.TRIM_GRACE_S = 0.2       -- shared trim: how long the OLD inode is watched after the rename
M.GRACE_STEP_S = 0.05

-- The numeric `t` of one line, or nil (malformed, or no usable t).
local function line_t(raw)
  if type(raw) ~= "string" then return nil end
  local ok, obj = pcall(cjson.decode, raw)            -- pure C decode: never yields
  if not ok or type(obj) ~= "table" then return nil end
  local t = rawget(obj, "t")
  if type(t) ~= "number" or t ~= t then return nil end
  return t
end
M.line_t = line_t

local function strip(s) return (s:gsub("^%s+", ""):gsub("%s+$", "")) end
M.strip = strip

-- Lines of a byte string, each WITH its "\n" (the last one may lack it).
local function split_keep(data)
  local out, pos = {}, 1
  while pos <= #data do
    local nl = data:find("\n", pos, true)
    if not nl then out[#out + 1] = data:sub(pos); break end
    out[#out + 1] = data:sub(pos, nl); pos = nl + 1
  end
  return out
end

local function dirname(p) return p:match("^(.*)/[^/]*$") or "." end

function M.mkdir_p(dir)
  if dir == "" or dir == "." then return true end
  if M.mkdir then
    local path = dir:sub(1, 1) == "/" and "" or "."
    for part in dir:gmatch("[^/]+") do
      path = path .. "/" .. part
      M.mkdir(path)                                    -- EEXIST is fine; a real failure shows at open
    end
    return true
  end
  return os.execute("mkdir -p '" .. dir:gsub("'", "'\\''") .. "'")
end

local function size_of(path)
  local f = io.open(path, "rb")
  if not f then return nil end
  local n = f:seek("end"); f:close()
  return n
end

local function now_ms() return math.floor(os.time() * 1000) end
M.now_ms = now_ms                                       -- the daemon replaces it (sub-second clock)

-- Copy every WHOLE line appended to `src` after byte `pos` into `dst`; returns the new position.
-- Loops until the size stops moving; a trailing fragment (an append in flight) waits.
local function carry(src, dst, pos)
  while true do
    local size = src:seek("end")
    if size <= pos then return pos end
    src:seek("set", pos)
    local chunk = src:read(size - pos) or ""
    local cut = 0
    local i = chunk:find("\n[^\n]*$")
    if i then cut = i end
    if cut == 0 then return pos end
    dst:write(chunk:sub(1, cut)); dst:flush()
    pos = pos + cut
  end
end

-- Drop lines older than max_age_ms and cap the count, atomically; no rewrite when nothing goes.
-- Only the head is parsed (the file is append-ordered by t); a torn tail line is scrubbed.
-- shared=true is for events.jsonl, which OTHER processes append to while we trim: the plugin's
-- io.open(.., "a") and the watchdog's `echo >>`, one whole line per O_APPEND write, with no lock
-- we could take. A plain read -> rewrite -> rename would lose every line appended between the
-- read and the rename, so: bytes after the last newline are an append still in flight (never
-- scrubbed as torn, never kept from the first read); whatever is appended while the kept lines
-- are written is copied into the new file before the rename (carry, until the size is stable);
-- and a writer that opened the OLD inode just before the rename gets its line carried over for
-- TRIM_GRACE_S after it (appended O_APPEND, so after anything newer already in the new file).
-- test/collectd-emu.test.py races a real writer against this under eco.
function M.trim(path, max_age_ms, max_lines, ref_ms, shared)
  local src = io.open(path, "rb")
  if not src then return end
  local data = src:read("*a") or ""
  if shared then
    local last = data:find("\n[^\n]*$")
    data = last and data:sub(1, last) or ""
  end
  local pos = #data
  local lines = split_keep(data)
  if #lines == 0 then src:close(); return end
  local cutoff = (ref_ms or M.now_ms()) - max_age_ms
  local drop = 0
  for _, ln in ipairs(lines) do
    local t = ln:find("%S") and line_t(ln) or nil
    if t ~= nil and t >= cutoff then break end
    drop = drop + 1
  end
  local kept = {}
  for i = drop + 1, #lines do kept[#kept + 1] = lines[i] end
  if #kept > 0 and line_t(kept[#kept]) == nil then kept[#kept] = nil end   -- torn tail line
  if #kept > max_lines then
    local k2 = {}
    for i = #kept - max_lines + 1, #kept do k2[#k2 + 1] = kept[i] end
    kept = k2
  end
  if #kept == #lines then src:close(); return end         -- nothing to drop: leave the file alone
  local tmp = path .. ".tmp"
  local dst = assert(io.open(tmp, "wb"))
  for i, l in ipairs(kept) do kept[i] = l:sub(-1) == "\n" and l or (l .. "\n") end
  dst:write(table.concat(kept))
  if shared then dst:flush(); pos = carry(src, dst, pos) end
  dst:close()
  assert(os.rename(tmp, path))
  if shared then
    local out = io.open(path, "ab")
    if out then
      out:setvbuf("no")                                   -- one O_APPEND write per carry
      local steps = M.sleep and math.floor(M.TRIM_GRACE_S / M.GRACE_STEP_S + 0.5) or 0
      pos = carry(src, out, pos)
      for _ = 1, steps do
        M.sleep(M.GRACE_STEP_S)
        pos = carry(src, out, pos)
      end
      out:close()
    end
  end
  src:close()
end

-- ---- eMMC history backup (two rotating segments per stream) ---------------------------------

function M.read_history_config(path)
  local f = io.open(path, "r")
  if not f then return { enabled = false } end
  local body = f:read("*a") or ""; f:close()
  if body == "" then body = "{}" end
  local ok, obj = pcall(cjson.decode, body)
  return { enabled = ok and type(obj) == "table" and obj.enabled == true }
end

-- [previous, current] segments of one stream ("samples" / "battery"), oldest first.
function M.persist_segments(dir, stream)
  return { dir .. "/" .. stream .. ".prev.jsonl", dir .. "/" .. stream .. ".jsonl" }
end

-- Largest t (floored) in a jsonl file, 0 if absent / empty.
function M.max_t_in_file(path)
  local f = io.open(path, "r")
  if not f then return 0 end
  local max_t = 0
  for ln in f:lines() do
    local s = strip(ln)
    if s ~= "" then
      local t = line_t(s)
      if t ~= nil and t > max_t then max_t = math.floor(t) end
    end
  end
  f:close()
  return max_t
end

-- t of the oldest parseable line among the first max_lines, or nil.
function M.first_t_in_file(path, max_lines)
  max_lines = max_lines or 50
  local f = io.open(path, "r")
  if not f then return nil end
  local n = 0
  for ln in f:lines() do
    if n >= max_lines then break end
    n = n + 1
    local s = strip(ln)
    local t = s ~= "" and line_t(s) or nil
    if t ~= nil then f:close(); return t end
  end
  f:close()
  return nil
end

-- t of the newest parseable line, read from the tail only.
function M.last_t_in_file(path, tail_bytes)
  tail_bytes = tail_bytes or 16384
  local f = io.open(path, "rb")
  if not f then return nil end
  local size = f:seek("end")
  f:seek("set", math.max(0, size - tail_bytes))
  local chunk = f:read("*a") or ""; f:close()
  local lines = {}
  for ln in chunk:gmatch("[^\r\n]+") do lines[#lines + 1] = ln end
  for i = #lines, 1, -1 do
    local t = lines[i]:find("%S") and line_t(lines[i]) or nil
    if t ~= nil then return t end
  end
  return nil
end

-- Once the current segment's OLDEST line is span_ms old, rename it over the previous one (a
-- metadata operation); when even its NEWEST line is outside the window, delete both.
-- Returns "rotated", "expired" or nil.
function M.rotate_segment(prev, cur, span_ms, ref_ms)
  local head = M.first_t_in_file(cur)
  local cutoff = (ref_ms or M.now_ms()) - span_ms
  if head == nil or head > cutoff then return nil end
  local last = M.last_t_in_file(cur)
  if last == nil or last > cutoff then
    os.rename(cur, prev)
    return "rotated"
  end
  os.remove(prev); os.remove(cur)
  return "expired"
end

-- Boot restore: rebuild an EMPTY tmpfs file from the backup segments (oldest first), keeping
-- only lines inside max_age_ms (nil = everything). Never overwrites a non-empty file.
function M.seed_tmp_from_persist(tmp_path, segments, max_age_ms, ref_ms)
  if type(segments) == "string" then segments = { segments } end
  local sz = size_of(tmp_path)
  if sz and sz > 0 then return false end
  local cutoff = max_age_ms and ((ref_ms or M.now_ms()) - max_age_ms) or nil
  local tmp = tmp_path .. ".seed"
  M.mkdir_p(dirname(tmp_path))
  local dst = io.open(tmp, "w")
  if not dst then return false end
  local wrote = false
  for _, seg in ipairs(segments) do
    local src = io.open(seg, "r")
    if src then
      local young = cutoff == nil
      for ln in src:lines() do
        local raw = strip(ln)
        if raw ~= "" then
          local keep = young
          if not young then
            local t = line_t(raw)
            if t ~= nil and t >= cutoff then young = true; keep = true end
          end
          if keep then dst:write(raw, "\n"); wrote = true end
        end
      end
      src:close()
    end
  end
  dst:close()
  if not wrote then os.remove(tmp); return false end
  if not os.rename(tmp, tmp_path) then os.remove(tmp); return false end
  return true
end

-- Append the lines of tmp_path with t > since_t onto persist_path (append-only); returns the new
-- since_t. A torn last line in the backup gets a newline first so it cannot swallow ours.
function M.flush_new_lines(tmp_path, persist_path, since_t)
  local f = io.open(tmp_path, "r")
  if not f then return since_t end
  local out, new_since = {}, since_t
  for ln in f:lines() do
    local raw = strip(ln)
    if raw ~= "" then
      local t = line_t(raw)
      if t ~= nil then
        t = math.floor(t)
        if t > since_t then
          out[#out + 1] = raw
          if t > new_since then new_since = t end
        end
      end
    end
  end
  f:close()
  if #out == 0 then return since_t end
  M.mkdir_p(dirname(persist_path))
  local p = io.open(persist_path, "a+b")
  if not p then return since_t end
  local size = p:seek("end")
  local lead = ""
  if size > 0 then
    p:seek("set", size - 1)
    if p:read(1) ~= "\n" then lead = "\n" end
    p:seek("end")
  end
  p:write(lead, table.concat(out, "\n"), "\n")
  p:close()
  return new_since
end

-- streams: { {name, window_ms, tmp_path}, ... }
function M.maybe_flush_persist(streams, persist_dir, cursors, cfg_path, ref_ms)
  if not M.read_history_config(cfg_path).enabled then return false end
  M.mkdir_p(persist_dir)
  for _, s in ipairs(streams) do
    local seg = M.persist_segments(persist_dir, s[1])
    M.rotate_segment(seg[1], seg[2], s[2], ref_ms)
    cursors[s[1]] = M.flush_new_lines(s[3], seg[2], cursors[s[1]] or 0)
  end
  return true
end

-- Boot path: seed each empty tmpfs stream from its segments; returns the flush cursors (the
-- newest t already on disk, so the first flush appends only what is new).
function M.restore_from_persist(streams, persist_dir, ref_ms)
  local cursors = {}
  for _, s in ipairs(streams) do
    local seg = M.persist_segments(persist_dir, s[1])
    M.seed_tmp_from_persist(s[3], seg, s[2], ref_ms)
    local c = M.max_t_in_file(seg[2])
    if c == 0 then c = M.max_t_in_file(seg[1]) end
    cursors[s[1]] = c
  end
  return cursors
end

-- Atomic small-file write (latest.json): a reader never sees a half-written file.
function M.write_atomic(path, body)
  local tmp = path .. ".tmp"
  local f = io.open(tmp, "w")
  if not f then return false end
  f:write(body); f:close()
  return os.rename(tmp, path) and true or false
end

function M.append_line(path, body)
  local f = io.open(path, "a")
  if not f then return false end
  f:write(body, "\n"); f:close()
  return true
end

return M

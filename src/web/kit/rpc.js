// The ONE place that talks to GL's /rpc. Two transports, by GL's own rules (docs/knowledge.md §2):
//
//   rpc(method, params, opts)        user-initiated one-shots: window.$rpcRequest, which raises
//                                    GL's global error banner on failure and resolves to `result`.
//   rpcSilent(method, params, ms)    background / retrying calls: a direct $axios POST that never
//                                    shows a banner and resolves null on ANY failure.
//
// Both call our undotted "mudimodem" plugin. "sid" is a literal placeholder: $rpcRequest swaps in
// the Admin-Token cookie only when params[0] is truthy; rpcSilent reads the cookie itself.
export function hasRpc() {
  return typeof window !== "undefined" && !!window.$rpcRequest;
}

export function rpc(method, params, opts) {
  return window.$rpcRequest("call", ["sid", "mudimodem", method, params || {}], opts);
}

export function rpcSilent(method, params, timeoutMs) {
  if (typeof window === "undefined" || !window.$axios || !window.$axios.post) return Promise.resolve(null);
  var sid = (window.$getCookie && window.$getCookie("Admin-Token")) || "";
  return window.$axios.post("/rpc", {
    jsonrpc: "2.0", id: 1, method: "call",
    params: [sid, "mudimodem", method, params || {}]
  }, { timeout: timeoutMs || 15000 })
    .then(function (r) { return (r && r.data && r.data.result) || null; })
    .catch(function () { return null; });
}

// Methods backed by a mudimodemd job (scan_cells, library_status, refresh_library, app_version):
// the plugin waits ~20 s per reply (one call through GL's ubus proxy must answer within 30 s), so
// a job still running replies {pending, id} and continues with job_result. `sliceMs` bounds each
// call; MAX_SLICES bounds the whole wait (a scan is cut by GL at 300 s = 15 slices).
var MAX_SLICES = 40;
function follow(call, sliceMs, next) {
  var n = 0;
  var step = function (r) {
    if (r && r.pending && r.id != null) {
      if (++n > MAX_SLICES) return { error: "gave up waiting for the router" };
      return call(next || "job_result", { id: r.id }, sliceMs).then(step);
    }
    return r;
  };
  return step;
}

export function rpcJob(method, params, sliceMs) {
  sliceMs = sliceMs || 35000;
  var call = function (m, p, ms) { return rpc(m, p, { timeout: ms }); };
  return call(method, params, sliceMs).then(follow(call, sliceMs));
}

// One AT command through mudimodemd's AT queue (the console's transport): at_console, then
// at_result while it is queued or running. -> the final reply ({steps:[{cmd, status, response}]}
// | {error}). For fixed read-only commands the page itself issues (neighbour cells).
export function rpcAt(cmd, timeoutS) {
  var call = function (m, p, ms) { return rpc(m, p, { timeout: ms }); };
  return call("at_console", { cmd: cmd, timeout: timeoutS || 8 }, 35000).then(follow(call, 35000, "at_result"));
}

export function rpcSilentJob(method, params, sliceMs) {
  sliceMs = sliceMs || 35000;
  return rpcSilent(method, params, sliceMs).then(follow(rpcSilent, sliceMs));
}

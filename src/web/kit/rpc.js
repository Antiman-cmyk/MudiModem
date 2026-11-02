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

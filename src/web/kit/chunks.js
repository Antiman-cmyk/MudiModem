// Lazy page chunks — fetched and evaluated the way GL's SPA loads a view: the file is one
// statement, `module.exports = (function(){ ... })();`, run with a `module` object in scope.
// new Function (not direct eval) keeps the chunk out of the caller's scope and bundle.
export function loadChunk(name) {
  if (typeof window === "undefined" || !window.$axios) return Promise.reject(new Error("no transport"));
  return window.$axios.get("/views/gl-sdk4-ui-mudimodem-" + name + ".common.js?_t=" + Date.now())
    .then(function (res) {
      var mod = { exports: {} };
      new Function("module", res.data)(mod);   // eslint-disable-line no-new-func
      var comp = mod.exports;
      if (!comp || typeof comp.render !== "function") throw new Error("bad chunk");
      return comp;
    });
}

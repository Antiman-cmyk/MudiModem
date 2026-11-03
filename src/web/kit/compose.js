// Build ONE Vue options object out of a shell and concern modules (src/web/main/*.js).
//
// Not Vue mixins on purpose: the result is a plain component whose data / methods / computed /
// watch hold everything, so it behaves exactly like the single-file component it replaced
// (GL's SPA, our tests and the preview all see one object). Lifecycle hooks and render stay in
// the shell. Two modules defining the same key is a bug, so it throws at load time.
export function compose(shell, parts) {
  var out = Object.assign({}, shell);
  var datas = [shell].concat(parts).map(function (p) { return p.data; }).filter(Boolean);
  out.data = function () {
    var self = this, all = {};
    datas.forEach(function (d) {
      var o = d.call(self);
      Object.keys(o).forEach(function (k) {
        if (k in all) throw new Error("compose: data key '" + k + "' defined twice");
        all[k] = o[k];
      });
    });
    return all;
  };
  ["computed", "methods", "watch"].forEach(function (kind) {
    var merged = {};
    [shell].concat(parts).forEach(function (p) {
      Object.keys(p[kind] || {}).forEach(function (k) {
        if (k in merged) throw new Error("compose: " + kind + " '" + k + "' defined twice");
        merged[k] = p[kind][k];
      });
    });
    out[kind] = merged;
  });
  parts.forEach(function (p) {
    Object.keys(p).forEach(function (k) {
      if (["data", "computed", "methods", "watch"].indexOf(k) < 0)
        throw new Error("compose: modules may only carry data/computed/methods/watch (got '" + k + "')");
    });
  });
  return out;
}

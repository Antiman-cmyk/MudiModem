// Copy text, and say whether it worked. navigator.clipboard exists only on HTTPS, and the admin is
// usually plain http://192.168.8.1, so fall back to a hidden textarea + execCommand("copy").
// -> Promise<boolean>
export function copyText(txt) {
  var legacy = function () {
    if (typeof document === "undefined" || !document.body) return false;
    var ta = document.createElement("textarea");
    ta.value = String(txt); ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  };
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(String(txt)).then(function () { return true; }, function () { return legacy(); });
  }
  return Promise.resolve(legacy());
}

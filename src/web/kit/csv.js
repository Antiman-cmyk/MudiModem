// CSV export: rows -> text (RFC 4180 quoting), and a browser download of it.
//   csv(rows, [["header", function (row) { return value; }], ...]) -> "header,...\r\n..."
//   download("mudimodem-rf.csv", text) -> true when the browser was handed the file
// Times go out twice: UTC ISO for people, epoch ms for scripts.
function cell(v) {
  if (v === null || v === undefined) return "";
  var s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function csv(rows, cols) {
  var out = [cols.map(function (c) { return cell(c[0]); }).join(",")];
  (rows || []).forEach(function (r) {
    out.push(cols.map(function (c) { return cell(c[1](r)); }).join(","));
  });
  return out.join("\r\n") + "\r\n";
}
export function isoTime(ms) {
  var n = Number(ms);
  return n > 0 ? new Date(n).toISOString() : "";
}
export function download(name, text) {
  if (typeof document === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) return false;
  var url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));   // BOM: Excel reads UTF-8
  var a = document.createElement("a");
  a.href = url; a.download = name; a.style.display = "none";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  return true;
}

-- On-box: app_version against the real network (dofile of the installed plugin
-- with ubus stubbed — the method needs none). Prints the live shape.
package.loaded["oui.ubus"] = { call = function() end }
local M = dofile("/usr/lib/oui-httpd/rpc/mudimodem")
local r = M.app_version({})
assert(type(r) == "table" and r.installed ~= nil, "app_version shape")
print("app_version live shape OK: installed=" .. tostring(r.installed) .. " checked=" .. tostring(r.checked)
  .. " latest=" .. tostring(r.latest) .. " update_available=" .. tostring(r.update_available))

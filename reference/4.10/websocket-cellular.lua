local ubus = require 'oui.ubus'
local M = {}

-- 辅助函数：按 bus 和 slot 查找或创建 simcard 条目
local function find_or_create_simcard(simcard_array, bus, slot)
    for _, sim in ipairs(simcard_array) do
        if sim.bus == bus and sim.slot == slot then
            return sim
        end
    end
    local sim = { bus = bus, slot = slot }
    table.insert(simcard_array, sim)
    return sim
end

-- 模组状态：调用三个 ubus 接口，按 bus 相同将 SIM 和网络合并到 modems 中
function M.modems_status()
    local modems_status = ubus.call('cellular.modem', 'status') or { modems = {} }
    local sims_status = ubus.call('cellular.sim', 'status') or { sims = {} }
    local networks_status = ubus.call('cellular.network', 'status') or { networks = {} }

    -- 为每个 modem 预创建 simcard 数组
    for _, modem in ipairs(modems_status.modems or {}) do
        modem.simcard = {}
        modem.dial_enable = false
    end

    -- 建立 bus -> modem 的映射
    local modem_map = {}
    for _, modem in ipairs(modems_status.modems or {}) do
        if modem.bus then
            modem_map[modem.bus] = modem
        end
    end

    -- 将 SIM 状态合并到对应 modem 的 simcard 中
    for _, sim in ipairs(sims_status.sims or {}) do
        local modem = modem_map[sim.bus]
        if modem then
            local simcard = find_or_create_simcard(modem.simcard, sim.bus, tonumber(sim.slot) or sim.slot)
            -- 合并 SIM 字段
            simcard.iccid = sim.iccid
            simcard.name = sim.name
            simcard.status = sim.status
            simcard.strength = sim.strength
            simcard.type = sim.type
            simcard.technology = sim.technology
            simcard.apn = sim.apn
            simcard.pin_counter = sim.pin_counter
        end
    end

    -- 将网络状态合并到对应 modem 的 simcard 中
    for _, net in ipairs(networks_status.networks or {}) do
        local modem = modem_map[net.bus]
        if modem then
            -- dial_status 和 dial_enable 放到 modem 外层
            modem.dial_enable = modem.dial_enable or ((net.dial_status or 0) == 0)

            local simcard = find_or_create_simcard(modem.simcard, net.bus, tonumber(net.slot) or net.slot)
            -- 合并网络字段
            simcard.traffic_total = net.traffic_total
            simcard.traffic_threshold = net.traffic_threshold
            simcard.unit = net.unit
            simcard.dial_status = net.status
            -- 如果 SIM 没有 iccid，用网络的 iccid 补充
            if (not simcard.iccid or simcard.iccid == '') and net.iccid then
                simcard.iccid = net.iccid
            end
        end
    end

    return modems_status
end

function M.modems_info()
    return ubus.call('cellular.modem', 'info') or { modems_info = {} }
end

-- SIM 和网络状态已合并到 modems_status，以下 status 接口保留兼容但返回空
--function M.sims_status()
--    return ubus.call('cellular.sim', 'status') or { sims_status = {} }
--end

-- function M.sims_info()
--     return ubus.call('cellular.sim', 'info') or { sims_info = {} }
-- end

--function M.networks_status()
--    return ubus.call('cellular.network', 'status') or { networks_status = {} }
--end

function M.networks_info()
    local networks_info = ubus.call('cellular.network', 'info') or { networks = {} }
    local sims_info = ubus.call('cellular.sim', 'info') or { sims = {} }

    -- 建立 bus+slot -> sim 的映射
    local sim_map = {}
    for _, sim in ipairs(sims_info.sims or {}) do
        if sim.bus and sim.slot then
            sim_map[sim.bus .. '_' .. tostring(sim.slot)] = sim
        end
    end

    -- 将 SIM 信息合并到对应 network 中
    for _, net in ipairs(networks_info.networks or {}) do
        if net.bus and net.slot then
            local sim = sim_map[net.bus .. '_' .. tostring(net.slot)]
            if sim then
                net.phone_number = sim.phone_number
                net.apn_list = sim.apn_list
                net.iccid = sim.iccid
                net.imsi = sim.imsi
                net.mcc = sim.mcc
                net.mnc = sim.mnc
            end
        end
    end

    return networks_info
end

return M

"""GL 4.10 cellular ubus payloads, as captured / read in the image (docs/cellular-api-4.10.md §2-3):
the fixtures the daemon's tests share (test/collectd-emu.test.py, test/compat-golden.test.py, the
golden generator). Data only."""

# ---- GL 4.10 captured shapes -------------------------------------------------
# cellular.modem status (no args) — GL's canonical form: modems[] (what
# lib/functions/modem.sh, websocket/cellular.lua and internet.js all parse).
MODEM_STATUS_410 = {"modems": [{"bus": "cpu", "current_sim_slot": 1, "slot_switch_enable": True,
                                "status": 0}]}
# A second (USB) modem in the list must not be picked over the built-in one.
MODEM_STATUS_410_TWO = {"modems": [{"bus": "1-1.2", "type": 1, "current_sim_slot": 2},
                                   {"bus": "cpu", "type": 0, "current_sim_slot": 1}]}
# cellular.network cell_info {bus,slot} — NR-SA n78 (EU unit), single carrier.
CELL_INFO_410_SA = {
    "bus": "cpu", "slot": 1, "network_type": 5, "tac": "DE0000", "cell_id": "DE017C015",
    "signal": [{"band": 78, "earfcn": 627264, "pci": 142, "bandwidth": 100,
                "rsrp": -94, "rsrq": -10, "sinr": 12, "rssi": -32768,
                "rsrp_level": 4, "rsrq_level": 3, "sinr_level": 3}],
    "ret": 0, "resp": "Success",
}
# NSA: issue #5 capture (LTE anchor B3) — network_type 51.
CELL_INFO_410_NSA = {
    "bus": "cpu", "slot": 1, "network_type": 51, "tac": "41", "cell_id": "DF30C",
    "signal": [{"band": 3, "earfcn": 1700, "rsrp": -97, "rsrq": -9, "rssi": -67,
                "sinr": 17, "rsrp_level": 4, "strength": 4}],
    "ret": 0, "resp": "Success",
}
# EN-DC with a NR secondary carrier (contract-derived until a real trace lands).
CELL_INFO_410_NSA_CA = dict(CELL_INFO_410_NSA, signal=[
    dict(CELL_INFO_410_NSA["signal"][0], ca=0),
    {"ca": 1, "network_type": 5, "band": 78, "earfcn": 627264, "pci": 142,
     "bandwidth": 100, "rsrp": -99, "rsrq": -11, "sinr": 8},
])
# EN-DC as GL's 4.10 binary actually emits it (libcm_network.so cell_info
# handler @0x8284 + quectel_get_qcainfo_signal): EVERY row carries ca,
# network_type, pci and the full metric set; QCAINFO "PCC" = LTE anchor ->
# row network_type 4, "SCC" NR legs -> 51, cell -> 51.
CELL_INFO_410_NSA_FULL = {
    "bus": "cpu", "slot": 1, "network_type": 51, "tac": "41", "cell_id": "DF30C",
    "signal": [
        {"ca": 0, "network_type": 4, "band": 3, "earfcn": 1700, "pci": 61, "bandwidth": 20,
         "rsrp": -97, "rsrq": -9, "rssi": -67, "sinr": 17, "rscp": -32768, "ecio": -32768, "snr": -32768,
         "rsrp_level": 4, "rsrq_level": 4, "rssi_level": 4, "sinr_level": 4,
         "rscp_level": 0, "ecio_level": 0, "snr_level": 0, "strength": 4},
        {"ca": 1, "network_type": 51, "band": 78, "earfcn": 627264, "pci": 142, "bandwidth": 100,
         "rsrp": -99, "rsrq": -11, "rssi": -32768, "sinr": 8, "rscp": -32768, "ecio": -32768, "snr": -32768,
         "rsrp_level": 3, "rsrq_level": 3, "rssi_level": 0, "sinr_level": 3,
         "rscp_level": 0, "ecio_level": 0, "snr_level": 0, "strength": 3},
    ],
    "ret": 0, "resp": "Success",
}
# The binary's ca_num == 0 fallback: ONE row from the QENG servingcell struct
# (LTE-anchor band/pci/earfcn) stamped with the CELL's code — 51 under NSA.
CELL_INFO_410_NSA_FALLBACK_ROW = {
    "bus": "cpu", "slot": 1, "network_type": 51, "tac": "41", "cell_id": "DF30C",
    "signal": [{"ca": 0, "network_type": 51, "band": 3, "earfcn": 1700, "pci": 61, "bandwidth": 20,
                "rsrp": -97, "rsrq": -9, "rssi": -67, "sinr": 17, "rsrp_level": 4, "strength": 4}],
    "ret": 0, "resp": "Success",
}
# No service (slot 2, no SIM registered): the sentinel payload.
CELL_INFO_410_NO_SERVICE = {
    "bus": "cpu", "slot": 2, "network_type": 0, "tac": "", "cell_id": "",
    "signal": [{"band": 0, "earfcn": 0, "pci": 0, "bandwidth": 0,
                "rsrp": -32768, "rsrq": -32768, "rssi": -32768, "sinr": -32768}],
    "ret": 0, "resp": "Success",
}
# cellular.network info — carrier + identity per {bus,slot} (the ws merge source).
NETWORK_INFO_410 = {"networks": [
    {"bus": "cpu", "slot": 1, "carrier": "CHN-UNICOM", "iccid": "8986011", "imsi": "460011",
     "mcc": "460", "mnc": "01", "apn": "3gnet"},
    {"bus": "cpu", "slot": 2, "carrier": "", "iccid": ""},
]}

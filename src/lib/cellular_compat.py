"""cellular_compat — the ONE place MudiModem's Python knows GL 4.10's cellular
ubus shapes. Deployed to /usr/lib/mudimodem/cellular_compat.py; imported by
mudimodem-collectd and mudimodem-speedtest.py. Pure functions, stdlib only.

Contract (docs/cellular-api-4.10.md):
  cellular.modem status / info (NO args) -> {modems:[{bus, type, current_sim_slot,
                                       ...}]} — GL's canonical form; pick_modem
                                       selects the built-in one. No other shape.
  cellular.network cell_info {bus,slot} -> {network_type, tac, cell_id,
                                       signal:[{ca, band, earfcn, pci,
                                       bandwidth*, rsrp, rsrq, sinr, rssi,
                                       *_level}]}  (executes QENG/QCAINFO —
                                       rate-limited by the caller)
  cellular.network info             -> {networks:[{bus, slot, carrier, ...}]}

Normalized sample (what every consumer reads — tracking, speedtest, the strip,
the cell-lock tab): full `signals[]` (PCC first) PLUS the flattened primary
aliases (band/mode/id/tx_channel/dl_bandwidth/rsrp/rsrq/sinr/rssi/*_level) so
single-carrier consumers need no CA awareness. `mode`/`rat` is the CELL's RAT
(NR5G-NSA for EN-DC); `pcc_rat` is the primary carrier's own RAT (LTE for the
NSA anchor) — format band numbers and channels with `pcc_rat`, never `mode`.
"""

# GL's numeric network_type -> mode string. Settled from the 4.10 image + two
# live captures: GL's cellular-detail display map is {2:"2G",3:"3G",4:"4G",
# 41:"4G+",5:"5G SA",51:"5G NSA"} and hasRssi=[4,41,51] (RSSI exists for LTE
# and for NSA's LTE anchor, never for SA); issue #5's NSA capture was
# network_type 51 with an LTE B3 anchor (EARFCN 1700), the EU unit's SA n78
# capture was 5. (GL's other map, getNetworkType, has 5/51 swapped — a GL bug;
# the physics and the captures win.) 1=GSM / 6=EVDO from that same map.
NETWORK_TYPE = {
    0: None,           # no service
    1: "GSM",
    2: "2G",
    3: "3G",
    4: "LTE",
    41: "LTE+",        # LTE with CA ("4G+" in GL's UI)
    5: "NR5G-SA",
    51: "NR5G-NSA",
    6: "EVDO",
}

# Quectel/GL "no value" sentinels on the signal rows of a no-service cell.
SENTINEL_METRIC = -32768


def _num(v):
    """Coerce "-97" / -97 / 17.5 to a number; None for empty/junk/sentinel."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
    except (ValueError, TypeError):
        return None
    if f == SENTINEL_METRIC:
        return None
    return int(f) if f == int(f) else f


def normalize_metric(v):
    return _num(v)


def normalize_network_type(nt):
    """(network_type:int|None, mode:str|None). Unknown codes keep the number
    and a "type N" label rather than pretending to be a known RAT."""
    n = _num(nt)
    if n is None:
        return None, None
    n = int(n)
    if n in NETWORK_TYPE:
        return n, NETWORK_TYPE[n]
    return n, "type %d" % n


def is_nr(mode):
    return bool(mode) and "NR5G" in mode


def pick_modem(payload, bus="cpu"):
    """The built-in modem's object out of `cellular.modem status`/`info` called
    WITHOUT arguments — GL's canonical form, which every GL consumer parses as
    `modems[]` (lib/functions/modem.sh get_current_sim_slot, websocket/cellular.lua,
    internet.js). {} when absent. No other shape is accepted on purpose."""
    if not isinstance(payload, dict):
        return {}
    mods = payload.get("modems")
    if not isinstance(mods, list):
        return {}
    for m in mods:
        if isinstance(m, dict) and (m.get("bus") == bus or m.get("type") == 0):
            return m
    return mods[0] if mods and isinstance(mods[0], dict) else {}


def active_slot(modem_status, bus="cpu"):
    """Active slot as int, or None."""
    s = pick_modem(modem_status, bus).get("current_sim_slot")
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def _zero_none(v):
    n = _num(v)
    return None if (n is None or n == 0) else n


# E-UTRA ARFCN range (3GPP TS 36.101 §5.7.3): 0..65535. Every NR-ARFCN a real
# NR band uses is far above it (n71 ≈ 123400+, n41 ≈ 499200+, n78 ≈ 620000+;
# TS 38.104 §5.4.2.1), so the channel number alone tells LTE from NR.
EUTRA_ARFCN_MAX = 65535


def _row_network_type(row, cell_nt, index):
    """The RAT of ONE carrier row, read from the 4.10 image (libcm_network.so
    cell_info handler @0x8284, filler quectel_get_qcainfo_signal in
    libcm_modem.so @0x2710c; reference/4.10/re-notes.md):

    * Every row GL emits carries its own `network_type` (plus ca, band, pci,
      earfcn, bandwidth, rsrp/rsrq/sinr/rssi/rscp/ecio/snr, *_level, strength).
      Under EN-DC the QCAINFO "PCC" line is the LTE anchor -> row code 4, the
      "SCC" lines whose band token starts with 'N' are the NR legs -> 51, and
      the cell is 51. Plain LTE CA -> 41. So an explicit row value is normally
      authoritative.
    * ONE exception, also in the binary: when QCAINFO yielded no carriers
      (ca_num == 0) the handler emits a single fallback row built from the
      QENG servingcell struct — LTE-anchor band/pci/earfcn — but stamps it
      with the CELL's code (51 under NSA). An NR row can never sit on an
      E-UTRA channel (every NR-ARFCN in use is >= 123400; E-UTRA tops out at
      65535), so a row tagged NR whose channel is in the E-UTRA range is that
      fallback anchor: LTE.
    * A row with NO network_type (an abridged capture such as issue #5) falls
      back to the same rule: under an NSA cell, the anchor (index 0) or an
      E-UTRA-range channel is LTE, anything else is the NR leg; other cell
      types are inherited."""
    ch = _num(row.get("earfcn", row.get("tx_channel")))
    on_eutra = ch is not None and 0 <= ch <= EUTRA_ARFCN_MAX
    explicit = row.get("network_type")
    if explicit not in (None, ""):
        n = _num(explicit)
        if n is not None and int(n) in (5, 51) and on_eutra:
            return 4
        return explicit
    cn = _num(cell_nt)
    if cn is not None and int(cn) == 51:
        if index == 0 or on_eutra:
            return 4
    return cell_nt


def normalize_signal(row, network_type=None, index=0):
    """One component carrier. role PCC for the first row, SCCn after (GL keys
    the same off signal[i].ca; we honour ca when present)."""
    row = row if isinstance(row, dict) else {}
    ca = _num(row.get("ca"))
    ca = int(ca) if ca is not None else index
    nt, mode = normalize_network_type(_row_network_type(row, network_type, index))
    bw = _num(row.get("bandwidth_dl", row.get("bandwidth", row.get("dl_bandwidth"))))
    bw_ul = _num(row.get("bandwidth_ul"))
    return {
        "role": "PCC" if ca == 0 else "SCC%d" % ca,
        "ca": ca,
        "network_type": nt,
        "rat": mode,
        # band 0 is never valid (sentinel); PCI 0 (LTE 0-503 / NR 0-1007) and
        # EARFCN 0 (LTE B1, 2110.0 MHz) ARE — keep them.
        "band": _zero_none(row.get("band")),
        "earfcn": _num(row.get("earfcn", row.get("tx_channel"))),
        "pci": _num(row.get("pci")),
        "bandwidth_mhz": None if bw is None or bw == 0 else bw,
        "bandwidth_ul_mhz": None if bw_ul is None or bw_ul == 0 else bw_ul,
        "rsrp": _num(row.get("rsrp")),
        "rsrq": _num(row.get("rsrq")),
        "sinr": _num(row.get("sinr")),
        "rssi": _num(row.get("rssi")),
        "rsrp_level": _num(row.get("rsrp_level")),
        "rsrq_level": _num(row.get("rsrq_level")),
        "sinr_level": _num(row.get("sinr_level")),
    }


def normalize_cell_info(payload):
    """cellular.network cell_info -> {network_type, rat, cell_id, tac,
    signals[]}. A no-service payload (network_type 0, empty ids, sentinel
    metrics) normalizes to Nones + [] — never to "cell '' / band 0"."""
    p = payload if isinstance(payload, dict) else {}
    nt, mode = normalize_network_type(p.get("network_type"))
    cell_id = p.get("cell_id") or None
    tac = p.get("tac") or None
    sigs = []
    if nt is not None and nt != 0:
        for i, row in enumerate(p.get("signal") or []):
            s = normalize_signal(row, nt, i)
            # a sentinel row (band 0, every metric -32768) is not a carrier —
            # keyed on band + metrics only: pci/earfcn may legitimately be 0
            if any(s[k] is not None for k in ("band", "rsrp", "rsrq", "sinr")):
                sigs.append(s)
    if nt == 0:
        nt, mode, cell_id, tac = None, None, None, None
    return {"network_type": nt, "rat": mode, "cell_id": cell_id, "tac": tac,
            "signals": sigs}


def carrier_for_slot(networks_info, slot, bus="cpu"):
    """carrier name for {bus,slot} out of `cellular.network info` ("" if unknown)."""
    for n in (networks_info or {}).get("networks") or []:
        if not isinstance(n, dict):
            continue
        if str(n.get("slot")) == str(slot) and (n.get("bus") in (None, bus)):
            return n.get("carrier") or ""
    return ""


def build_sample(modem_status, cell_info, networks_info=None, t=None, bus="cpu",
                 carrier=None):
    """Assemble one normalized sample. None when the active slot is unknown
    (nothing to anchor on); a no-service active slot yields a sample with
    null metrics + signals:[] so the history shows an honest gap."""
    slot = active_slot(modem_status, bus)
    if slot is None:
        return None
    ci = normalize_cell_info(cell_info)
    pcc = ci["signals"][0] if ci["signals"] else {}
    if carrier is None:
        carrier = carrier_for_slot(networks_info, slot, bus)
    bw = pcc.get("bandwidth_mhz")
    return {
        "t": t,
        "slot": slot,
        "registered": ci["rat"] is not None,
        "carrier": carrier or "",
        "rat": ci["rat"],
        "network_type": ci["network_type"],
        "cell_id": ci["cell_id"],
        "tac": ci["tac"],
        "signals": ci["signals"],
        # ---- flattened PCC aliases (single-carrier consumers) ----
        "id": ci["cell_id"],
        "band": pcc.get("band"),
        "mode": ci["rat"],
        # the PRIMARY carrier's own RAT: LTE for an NSA anchor. Band numbers and
        # channels belong to this RAT, not to the cell's (mode).
        "pcc_rat": pcc.get("rat"),
        "pcc_network_type": pcc.get("network_type"),
        "pci": pcc.get("pci"),
        "tx_channel": pcc.get("earfcn"),
        "dl_bandwidth": None if bw is None else "%gMHz" % bw,
        "rsrp": pcc.get("rsrp"),
        "rsrq": pcc.get("rsrq"),
        "sinr": pcc.get("sinr"),
        "rssi": pcc.get("rssi"),
        "rsrp_level": pcc.get("rsrp_level"),
        "rsrq_level": pcc.get("rsrq_level"),
        "sinr_level": pcc.get("sinr_level"),
    }


# ---- RF metadata (3GPP) ------------------------------------------------------

def nr_arfcn_to_mhz(n):
    """NR-ARFCN -> MHz per 3GPP TS 38.104 §5.4.2.1 global frequency raster."""
    n = _num(n)
    if n is None or n <= 0:
        return None
    n = int(n)
    if n < 600000:
        return round(n * 0.005, 3)
    if n < 2016667:
        return round(3000 + (n - 600000) * 0.015, 3)
    return round(24250.08 + (n - 2016667) * 0.06, 3)


# LTE band -> (F_DL_low MHz, N_Offs-DL) per 3GPP TS 36.101 table 5.7.3-1.
LTE_EARFCN = {
    1: (2110, 0), 2: (1930, 600), 3: (1805, 1200), 4: (2110, 1950), 5: (869, 2400),
    7: (2620, 2750), 8: (925, 3450), 12: (729, 5010), 13: (746, 5180), 14: (758, 5280),
    17: (734, 5730), 18: (860, 5850), 19: (875, 6000), 20: (791, 6150), 25: (1930, 8040),
    26: (859, 8690), 28: (758, 9210), 29: (717, 9660), 30: (2350, 9770), 32: (1452, 9920),
    34: (2010, 36200), 38: (2570, 37750), 39: (1880, 38250), 40: (2300, 38650),
    41: (2496, 39650), 42: (3400, 41590), 43: (3600, 43590), 46: (5150, 46790),
    48: (3550, 55240), 66: (2110, 66436), 71: (617, 68586),
}


def lte_earfcn_to_mhz(band, earfcn):
    """LTE downlink EARFCN -> MHz (band-aware). None when the band is unknown —
    callers then show the raw EARFCN rather than a wrong frequency."""
    b, n = _num(band), _num(earfcn)
    if b is None or n is None:
        return None
    entry = LTE_EARFCN.get(int(b))
    if not entry:
        return None
    low, offs = entry
    return round(low + 0.1 * (int(n) - offs), 1)


def channel_mhz(rat, band, arfcn):
    """MHz for a carrier given its RAT label (from NETWORK_TYPE)."""
    if is_nr(rat):
        return nr_arfcn_to_mhz(arfcn)
    return lte_earfcn_to_mhz(band, arfcn)


def format_band(rat, band):
    """'n78' / 'B3' / '—'."""
    if band is None:
        return "—"
    return ("n" if is_nr(rat) else "B") + str(band)

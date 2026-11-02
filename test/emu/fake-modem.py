#!/usr/bin/env python3
"""A stand-in for the RG650V's AT port (/dev/smd9 on the E5800) behind a pty, so GL's OWN
cellular stack (cellular_manager -> modem_AT -> the port) runs unmodified under qemu.

    fake-modem.py <pty-link> <log.jsonl> [state.json]

Creates a pty, points <pty-link> (a symlink, e.g. <root>/dev/smd9) at its slave, answers AT
commands and appends every command it receives to <log.jsonl> as {"t", "cmd", "sub"}. Replies
are live captures from a T-Mobile RG650V-NA where we have them (reference/quectel-at-reference.md).
Stateful where it matters: AT+QUIMSUB selects the subscription later commands apply to, and
AT+QNWPREFCFG / AT+QNWLOCK writes are remembered per subscription so a later query reads them
back. state.json (re-read on every command) overrides replies: {"replies": {"<cmd>": "<lines>"}}.
"""
import json, os, re, select, sys, time, tty

LINK, LOG = sys.argv[1], sys.argv[2]
STATE = sys.argv[3] if len(sys.argv) > 3 else None

NR_BANDS = "2:5:7:12:13:14:25:26:29:30:38:41:48:66:70:71:77:78"
LTE_BANDS = "2:4:5:7:12:13:14:17:25:26:29:30:38:41:42:43:48:66:71"
sub = {"n": 1}
pref = {1: {"mode_pref": "AUTO", "nr5g_disable_mode": "0", "lte_band": LTE_BANDS, "nsa_nr5g_band": NR_BANDS,
            "nr5g_band": NR_BANDS, "roam_pref": "255"},
        2: {"mode_pref": "AUTO", "nr5g_disable_mode": "0", "lte_band": LTE_BANDS, "nsa_nr5g_band": NR_BANDS,
            "nr5g_band": NR_BANDS, "roam_pref": "255"}}
lock = {1: {"common/4g": "0", "common/5g": "0", "save_ctrl": "0,0"}, 2: {"common/4g": "0", "common/5g": "0", "save_ctrl": "0,0"}}
counters = {"tx": 1000000, "rx": 50000000}

SIM = {1: {"imsi": "310260000000001", "iccid": "8901260000000000001", "spn": '"T-Mobile","T-Mobile","",0,"310260"',
           "cops": '0,0,"T-Mobile",12',
           "qeng": '+QENG: "servingcell","NOCONN","NR5G-SA","FDD",310,260,187461035,721,870100,127490,71,2,-99,-13,4,0,-',
           "qcainfo": '+QCAINFO: "PCC",127490,2,"NR5G BAND 71",721,-99,-13,4'},
       2: {"imsi": "310410000000002", "iccid": "8901410000000000002", "spn": '"AT&T","AT&T","",0,"310410"',
           "cops": '0,0,"AT&T",7',
           "qeng": '+QENG: "servingcell","NOCONN","LTE","FDD",310,410,A1B2C03,136,67036,66,5,5,1D2E,-117,-15,-82,0,-',
           "qcainfo": '+QCAINFO: "PCC",67036,100,"LTE BAND 66",5,136,-117,-15,-82,0'}}


def overrides():
    if not STATE:
        return {}
    try:
        with open(STATE) as f:
            return json.load(f).get("replies", {})
    except (OSError, ValueError):
        return {}


def answer(cmd):
    """-> list of response lines (without the final OK) or None for ERROR."""
    ov = overrides()
    if cmd in ov:
        r = ov[cmd]
        return None if r is None else [x for x in r.split("\n") if x]
    s = SIM[sub["n"]]
    u = cmd.upper()
    m = re.match(r'AT\+QUIMSUB=(\d)', u)
    if m:
        sub["n"] = int(m.group(1)) if m.group(1) in "12" else 1
        return []
    if u == "AT+QUIMSUB?":
        return ["+QUIMSUB: %d" % sub["n"]]
    m = re.match(r'AT\+QNWPREFCFG="([a-z0-9_]+)"(?:,(.*))?$', cmd)
    if m:
        k, v = m.group(1), m.group(2)
        p = pref[sub["n"]]
        if v is None:
            return ['+QNWPREFCFG: "%s",%s' % (k, p.get(k, "0"))]
        p[k] = v
        return []
    m = re.match(r'AT\+QNWLOCK="([a-z0-9/_]+)"(?:,(.*))?$', cmd)
    if m:
        k, v = m.group(1), m.group(2)
        L = lock[sub["n"]]
        if v is None:
            return ['+QNWLOCK: "%s",%s' % (k, L.get(k, "0"))]
        L[k] = v
        return []
    if u == "AT+QGDCNT?":
        counters["tx"] += 12345; counters["rx"] += 543210
        return ["+QGDCNT: %d,%d" % (counters["tx"], counters["rx"])]
    if u == "AT+QGDNRCNT?":
        return ["+QGDNRCNT: %d,%d" % (counters["tx"] // 2, counters["rx"] // 2)]
    table = {
        "AT": [], "ATE0": [], "ATE1": [], "AT+CMEE=2": [], "AT+CMEE=1": [],
        "AT+CPIN?": ["+CPIN: READY"],
        "AT+QUIMSLOT?": ["+QUIMSLOT: 1"],
        "AT+CIMI": [s["imsi"]],
        "AT+QCCID": ["+QCCID: " + s["iccid"]], "AT+ICCID": ["+ICCID: " + s["iccid"]],
        "AT+GSN": ["860000000000001"], "AT+CGSN": ["860000000000001"],
        "AT+QGMR": ["RG650VNA01ACR02A04G8G"], "AT+CGMR": ["RG650VNA01ACR02A04G8G"],
        "AT+GMI": ["Quectel"], "AT+CGMI": ["Quectel"], "AT+GMM": ["RG650V-NA"], "AT+CGMM": ["RG650V-NA"],
        "ATI": ["Quectel", "RG650V-NA", "Revision: RG650VNA01ACR02A04G8G"],
        "AT+COPS?": ["+COPS: " + s["cops"]],
        "AT+QSPN": ["+QSPN: " + s["spn"]],
        "AT+CREG?": ["+CREG: 0,1"], "AT+CEREG?": ["+CEREG: 0,1"], "AT+C5GREG?": ["+C5GREG: 0,1"],
        "AT+CGREG?": ["+CGREG: 0,1"],
        "AT+CSQ": ["+CSQ: 16,99"],
        "AT+CFUN?": ["+CFUN: 1"],
        'AT+QENG="SERVINGCELL"': [s["qeng"]],
        'AT+QENG="NEIGHBOURCELL"': [],
        "AT+QCAINFO": [s["qcainfo"]],
        "AT+QCAINFO?": ["+QCAINFO: 1"],
        "AT+QCSQ": ['+QCSQ: "NR5G",-99,4,-13'],
        "AT+QNWINFO": ['+QNWINFO: "FDD NR5G","310260","NR5G BAND 71",127490'],
        "AT+CGPADDR": ['+CGPADDR: 1,"10.0.0.2"'],
        "AT+QSIMDET?": ["+QSIMDET: 1,0"], "AT+QSIMSTAT?": ["+QSIMSTAT: 0,1"],
        "AT+QPINC?": ['+QPINC: "SC",3,10'],
        "AT+CNUM": [],
    }
    if u in table:
        return table[u]
    if u.endswith("?") or u.endswith("=?"):
        return []                      # an unknown query: a bare OK, as many Quectel queries answer
    return []                          # an unknown set command: OK


def main():
    master, slave = os.openpty()
    tty.setraw(slave)
    name = os.ttyname(slave)
    try:
        os.unlink(LINK)
    except OSError:
        pass
    os.symlink(name, LINK)
    print(name, flush=True)
    buf = b""
    log = open(LOG, "a")
    while True:
        r, _, _ = select.select([master], [], [], 1.0)
        if not r:
            continue
        try:
            data = os.read(master, 4096)
        except OSError:
            time.sleep(0.05)
            continue
        buf += data
        while True:
            m = re.search(rb"[\r\n]", buf)
            if not m:
                break
            line, buf = buf[:m.start()].decode("latin-1").strip(), buf[m.end():]
            if not line:
                continue
            log.write(json.dumps({"t": time.time(), "cmd": line, "sub": sub["n"]}) + "\n"); log.flush()
            out = answer(line)
            if out is None:
                resp = "\r\nERROR\r\n"
            else:
                resp = "".join("\r\n%s\r\n" % x for x in out) + "\r\nOK\r\n"
            os.write(master, resp.encode())


if __name__ == "__main__":
    main()

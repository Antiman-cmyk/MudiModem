// The page's one stylesheet (GL theme variables only; test/theme-vars.test.js).
export default {
  data() {
    return {
      styleId: "mudimodem-css",
    };
  },
  methods: {
    injectStyle() {
      if (typeof document === "undefined") return;
      if (document.getElementById(this.styleId)) return;
      var css =
        '.mm{color:var(--text-regular);font-variant-numeric:tabular-nums}' +
        '.mm-strip{display:flex;align-items:stretch;background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);margin-bottom:11px;overflow:hidden}' +
        '.mm-trace{flex:1;min-width:0;padding:9px 0 6px 13px}' +
        '.mm-eyebrow{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}' +
        '.mm-plot{height:40px;margin-top:3px}.mm-plot svg{display:block;width:100%;height:100%;overflow:visible}' +
        '.mm-axis{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-hint);margin-top:2px}' +
        '.mm-read{flex:none;min-width:120px;padding:10px 14px 9px 15px;text-align:right;border-left:1px solid var(--divider);display:flex;flex-direction:column;justify-content:center}' +
        '.mm-rsrp{font-size:29px;font-weight:600;line-height:1;letter-spacing:-.025em}.mm-rsrp .u{font-size:11px;font-weight:500;color:var(--text-hint);margin-left:2px}' +
        '.mm-facts{display:flex;flex-wrap:wrap;gap:5px 13px;justify-content:flex-end;margin-top:7px}' +
        '.mm-facts .k{display:block;font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--text-badge)}.mm-facts b{font-size:12.5px;font-weight:600}' +
        // Control-state badges on the trace header: mode lock + tower lock. Muted
        // when idle (Auto / Unlocked), tinted when a restriction is in force.
        '.mm-lockbadges{display:flex;gap:6px;align-items:center}' +
        '.mm-lockbadge{background:var(--background-badge);border:1px solid transparent;border-radius:9px;padding:1px 8px;font:inherit;font-size:10px;font-weight:600;letter-spacing:.02em;color:var(--text-hint);cursor:pointer;white-space:nowrap}' +
        '.mm-lockbadge.mode{color:var(--warning);border-color:var(--warning-disabled,var(--warning));background:var(--warning-disabled,transparent)}' +
        '.mm-lockbadge.lock{color:var(--error);border-color:var(--error);background:transparent}' +
        // Seven tabs do not fit a phone: scroll the bar sideways instead of the whole page.
        '.mm-tabs{display:flex;gap:22px;border-bottom:1px solid var(--divider);margin-bottom:11px;padding:0 4px;overflow-x:auto;scrollbar-width:none}' +
        '.mm-tabs::-webkit-scrollbar{display:none}' +
        '.mm-tab{flex:none;white-space:nowrap;background:none;border:0;padding:9px 0 8px;font:inherit;font-size:13px;cursor:pointer;color:var(--text-weak);border-bottom:2px solid transparent;margin-bottom:-1px}' +
        '.mm-tab.on{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}' +
        '.mm-tab:disabled{color:var(--text-hint);cursor:default}' +
        '.mm-card{background:var(--background-card);border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.06);padding:13px 14px}' +
        '.mm-sect{font-size:13px;font-weight:600;color:var(--text-title)}.mm-hint{font-size:11.5px;color:var(--text-badge)}' +
        '.mm-dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px 16px;margin-top:11px}' +
        '.mm-dl .k{display:block;font-size:9px;letter-spacing:.05em;text-transform:uppercase;color:var(--text-badge)}.mm-dl b{font-size:13px;font-weight:600;color:var(--text-title)}' +
        '.mm-soon{padding:26px 14px;text-align:center;color:var(--text-hint);font-size:12px;line-height:1.6}' +
        '.mm-empty{padding:30px 14px;text-align:center;color:var(--text-hint);font-size:12.5px}' +
        // band grid
        '.mm-grp{margin-bottom:15px}.mm-grp:last-child{margin-bottom:2px}' +
        '.mm-grp-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}' +
        '.mm-grp-t{font-size:12px;font-weight:600;color:var(--text-title)}' +
        '.mm-acts{display:flex;gap:2px}' +
        '.mm-act{background:none;border:0;font:inherit;font-size:10.5px;cursor:pointer;color:var(--primary);padding:2px 6px;border-radius:3px}' +
        '.mm-act:hover{background:var(--primary-background)}' +
        '.mm-grp-off .mm-wrap{opacity:.5}' +
        '.mm-gate{font-size:10.5px;color:var(--warning-hover);background:var(--warning-background);border:1px solid var(--warning-disabled);border-radius:3px;padding:4px 8px;margin-bottom:6px}' +
        '.mm-seg{display:inline-flex;border:1px solid var(--border);border-radius:4px;overflow:hidden}' +
        '.mm-seg-b{font:inherit;font-size:12px;background:transparent;border:0;padding:5px 14px;cursor:pointer;color:var(--text-weak);border-right:1px solid var(--border)}' +
        '.mm-seg-b:last-child{border-right:0}' +
        '.mm-seg-b.on{background:var(--primary);color:#fff;font-weight:600}' +
        '.mm-seg-b:disabled{cursor:default;opacity:.6}' +
        '.mm-wrap{display:flex;gap:4px;flex-wrap:wrap}' +
        '.mm-band{position:relative;min-width:44px;padding:4px 6px 3px;text-align:center;border:1px solid var(--border);border-radius:4px;background:var(--background-card);transition:border-color .1s,background .1s}' +
        '.mm-band b{display:block;font-size:12px;font-weight:600;line-height:1.2}.mm-band s{display:block;font-size:9px;line-height:1.2;color:var(--text-hint);text-decoration:none}' +
        // read-only states
        '.mm-band.active{background:var(--success);border-color:var(--success)}.mm-band.active b{color:#fff}.mm-band.active s{color:rgba(255,255,255,.75)}' +
        '.mm-band.permitted{border-color:var(--primary)}.mm-band.permitted b{color:var(--primary)}' +
        // interactive states
        '.mm-band.sel{background:var(--success);border-color:var(--success)}.mm-band.sel b{color:#fff}.mm-band.sel s{color:rgba(255,255,255,.75)}' +
        '.mm-band.unsel b{color:var(--text-regular)}' +
        '.mm-band.blocked{opacity:.5}.mm-band.blocked b{color:var(--text-hint);text-decoration:line-through}' +
        '.mm-band.clickable{cursor:pointer}.mm-band.clickable:hover{border-color:var(--primary)}' +
        '.mm-band.serving{box-shadow:0 0 0 2px var(--success)}' +
        '.mm-band.serving::after{content:"";position:absolute;top:-3px;right:-3px;width:7px;height:7px;border-radius:50%;background:var(--success);border:1.5px solid var(--background-card)}' +
        '.mm-axis2{display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-hint);margin-top:6px}' +
        '.mm-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:var(--text-badge);margin-top:12px;padding-top:10px;border-top:1px solid var(--divider)}' +
        '.mm-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px}' +
        // apply + revert
        '.mm-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--divider);padding-top:11px;margin-top:11px}' +
        '.mm-btn{font:inherit;font-size:11.5px;font-weight:600;border-radius:3px;padding:6px 13px;cursor:pointer;border:1px solid transparent}' +
        '.mm-btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}' +
        '.mm-btn.primary:disabled{background:var(--primary-disabled);border-color:transparent;cursor:default}' +
        '.mm-btn.keep{background:var(--warning);color:#fff;border-color:var(--warning)}' +
        '.mm-btn.danger{background:transparent;color:var(--error);border-color:var(--error)}' +
        '.mm-revert{background:var(--warning-background);border:1px solid var(--warning);border-radius:3px;padding:9px 11px;margin:0 0 12px}' +
        '.mm-revert-row{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11.5px;color:var(--warning-hover)}' +
        '.mm-revert b{font-weight:600}.mm-cd{font-variant-numeric:tabular-nums}' +
        '.mm-bar{height:2px;background:var(--warning-disabled);border-radius:1px;margin-top:8px;overflow:hidden}.mm-bar i{display:block;height:100%;background:var(--warning);transition:width 1s linear}' +
        // nearby-cells scan card
        '.mm-help{margin-left:6px;width:15px;height:15px;line-height:13px;border-radius:50%;border:1px solid var(--border);background:transparent;color:var(--text-weak);font-size:10px;font-weight:700;cursor:pointer;padding:0;vertical-align:1px}' +
        '.mm-gloss{flex-basis:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:4px 16px;font-size:11.5px;color:var(--text-weak);border-top:1px solid var(--divider);padding-top:8px;margin-top:4px}' +
        '.mm-gloss b{color:var(--text-title)}' +
        '.mm-scan-row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:7px 4px;border-bottom:1px solid var(--divider);font-size:12px}' +
        '.mm-scan-row>span{min-width:0}.mm-scan-row>span:nth-child(2){flex:1}' +
        '.mm-scan-badge{flex:none;font-size:10px;padding:1px 6px;border:1px solid var(--border);border-radius:3px;color:var(--text-badge)}' +
        '@media(max-width:640px){.mm-strip{flex-direction:column}.mm-read{border-left:0;border-top:1px solid var(--divider);text-align:left;align-items:flex-start}.mm-facts{justify-content:flex-start}.mm-revert-row{flex-direction:column;align-items:flex-start}}' +
        // Config tab
        '.mm-card+.mm-card{margin-top:11px}' +
        '.mm-card-h{font-size:13px;font-weight:600;color:var(--text-title);margin-bottom:6px}' +
        '.mm-kv{display:flex;gap:12px;padding:4px 0;font-size:14px}' +
        '.mm-k{color:var(--text-hint);min-width:64px}' +
        '.mm-v{color:var(--text-title)}' +
        '.mm-link{color:var(--primary);cursor:pointer;text-decoration:underline}' +
        '.mm-warn{color:var(--warning)}' +
        '.mm-upd{color:var(--text-hint)}' +
        '.mm-note{margin-top:8px;color:var(--text-hint);font-size:13px}';
      var el = document.createElement("style");
      el.id = this.styleId; el.textContent = css;
      document.head.appendChild(el);
    },
  }
};

// Panel styles, embedded so they can be attached inside the panel's Shadow DOM.
globalThis.FormsPanelCSS = String.raw`
/* Cut off everything inherited from the host page (letter-spacing, fonts, colours...). */
#forms-helper-panel { all: initial; display: block; }
#forms-helper-panel {
  position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
  width: 320px; max-height: 65vh; overflow: auto; box-sizing: border-box;
  color: #202124; background: #fff; border: 1px solid #dadce0; border-radius: 10px;
  box-shadow: 0 4px 18px #0003; font: 13px/1.45 Arial, sans-serif;
}
#forms-helper-panel * { box-sizing: border-box; }
#forms-helper-panel header { display:flex; justify-content:space-between; align-items:center;
  padding:10px 12px; background:#f1f3f4; cursor:move; position:sticky; top:0; }
#forms-helper-panel button { cursor:pointer; border:1px solid #dadce0; background:#fff;
  border-radius:6px; padding:5px 9px; color:#202124; }
#forms-helper-panel #fh-content { padding:12px; }
#forms-helper-panel #fh-status { font-weight:600; margin-bottom:8px; }
#forms-helper-panel #fh-results { white-space:pre-wrap; overflow-wrap:anywhere; max-height:34vh;
  overflow:auto; font:12px/1.45 Arial,sans-serif; margin:10px 0; }
#forms-helper-panel #fh-risk { color:#8b0000; background:#fce8e6; border:1px solid #d93025;
  border-radius:6px; padding:8px; margin:8px 0; font-weight:700; }
#forms-helper-panel small { color:#5f6368; }
#forms-helper-panel.fh-minimized #fh-content { display:none; }#forms-helper-panel #fh-buttons { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0; }
#forms-helper-panel button.fh-primary { background:#1a73e8; border-color:#1a73e8; color:#fff; font-weight:600; }
#forms-helper-panel button:disabled { opacity:.5; cursor:default; }
#forms-helper-panel #fh-summary { color:#137333; font-weight:600; margin:4px 0; }
#forms-helper-panel .fh-h { font-weight:700; margin:10px 0 4px; color:#5f6368; text-transform:uppercase; font-size:11px; }
#forms-helper-panel .fh-row { display:flex; gap:8px; align-items:flex-start; padding:6px 0; border-bottom:1px solid #eee; }
#forms-helper-panel .fh-row input { margin-top:3px; }
#forms-helper-panel .fh-q { font-weight:600; overflow-wrap:anywhere; }
#forms-helper-panel .fh-a { color:#3c4043; overflow-wrap:anywhere; }
#forms-helper-panel .fh-manual .fh-a { color:#80868b; }
#forms-helper-panel .fh-rownote { font-size:12px; }
#forms-helper-panel .fh-ok { color:#137333; }
#forms-helper-panel .fh-skip { color:#80868b; }
#forms-helper-panel .fh-bad { color:#b3261e; }
#forms-helper-panel #fh-list { max-height:36vh; overflow:auto; margin-bottom:8px; }
#forms-helper-panel #fh-hint { color:#5f6368; font-size:12px; margin:4px 0; }
#forms-helper-panel #fh-summary.fh-err { color:#b3261e; }
#forms-helper-panel .fh-badge { display:inline-block; background:#e8f0fe; color:#1a56c4; border-radius:4px;
  padding:0 5px; margin-right:5px; font-size:11px; font-weight:700; }
#forms-helper-panel .fh-body { flex:1; min-width:0; }
#forms-helper-panel .fh-q { cursor:pointer; }
#forms-helper-panel textarea.fh-edit { width:100%; box-sizing:border-box; margin:4px 0; padding:6px; border:1px solid #dadce0;
  border-radius:6px; font:12px/1.4 system-ui,Arial,sans-serif; resize:vertical; }
#forms-helper-panel .fh-rewrite-row { display:flex; gap:6px; }
#forms-helper-panel input.fh-instr { flex:1; min-width:0; padding:4px 6px; border:1px solid #dadce0; border-radius:6px; font-size:12px; }
#forms-helper-panel #fh-list { max-height:48vh; }

`;

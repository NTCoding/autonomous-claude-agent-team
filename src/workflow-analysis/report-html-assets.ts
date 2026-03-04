export const REPORT_CSS = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; background: #f5f5f5; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
a { color: #3498db; text-decoration: none; }
a:hover { text-decoration: underline; }
code { background: #f0f0f0; padding: 1px 4px; border-radius: 2px; font-size: 12px; }
.header { background: white; border-bottom: 1px solid #ddd; padding: 10px 24px; flex-shrink: 0; }
.header-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font-size: 13px; line-height: 2; }
.header-row h1 { font-size: 15px; font-weight: 600; margin-right: 4px; }
.status { padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 500; }
.status-complete { background: #d4edda; color: #155724; }
.ml { font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.3px; margin-right: 2px; }
.sep { color: #ddd; margin: 0 2px; }
.tab-bar { background: white; border-bottom: 1px solid #ddd; padding: 0 24px; display: flex; gap: 0; flex-shrink: 0; }
.tab { padding: 10px 16px; font-size: 13px; font-weight: 500; color: #666; cursor: pointer; border-bottom: 2px solid transparent; user-select: none; }
.tab:hover { color: #333; }
.tab.active { color: #1a1a1a; border-bottom-color: #333; }
.tab .tc { font-size: 11px; background: #eee; padding: 1px 6px; border-radius: 8px; margin-left: 4px; }
.tab.active .tc { background: #333; color: white; }
.tab-content { flex: 1; overflow-y: auto; padding: 20px 24px; }
.tab-pane { display: none; }
.tab-pane.active { display: block; }
.slabel { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #999; margin-bottom: 8px; }
.metrics { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.metric { background: white; border: 1px solid #ddd; padding: 8px 12px; border-radius: 2px; flex: 1; min-width: 90px; }
.metric-val { font-size: 20px; font-weight: 600; }
.metric-label { font-size: 11px; color: #888; }
.metric.warn { border-color: #e67e22; }
.metric.warn .metric-val { color: #d35400; }
.metric-link { cursor: pointer; }
.metric-link:hover { background: #f8f8f8; border-color: #bbb; }
.timeline-bar { display: flex; height: 28px; border-radius: 3px; overflow: hidden; border: 1px solid #ddd; margin-bottom: 4px; }
.tl-seg { display: flex; align-items: center; justify-content: center; font-size: 10px; color: white; font-weight: 500; min-width: 2px; }
.tl-legend { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #666; }
.tl-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 3px; }
.tl-toggle { display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 11px; }
.tl-dur { font-family: monospace; color: #888; margin-left: 2px; }
.s-spawn { background: #9b59b6; } .s-plan { background: #95a5a6; } .s-respawn { background: #1abc9c; }
.s-dev { background: #3498db; } .s-review { background: #e67e22; } .s-commit { background: #2ecc71; }
.s-cr { background: #e91e63; } .s-pr { background: #f39c12; } .s-done { background: #27ae60; }
.iter { background: white; border: 1px solid #ddd; margin-bottom: 6px; border-radius: 2px; }
.iter.flagged { border-left: 3px solid #e67e22; }
.iter-head { padding: 8px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none; }
.iter-head:hover { background: #fafafa; }
.iter-title { font-size: 13px; font-weight: 500; }
.iter-badges { display: flex; gap: 8px; align-items: center; font-size: 12px; }
.badge { padding: 2px 8px; border-radius: 3px; font-size: 11px; }
.badge-ok { background: #d5f5e3; color: #1e8449; }
.badge-bad { background: #fde8e8; color: #c0392b; }
.iter-metrics { display: flex; gap: 16px; font-size: 12px; color: #666; padding: 4px 14px; }
.iter-metrics .warn { color: #d35400; font-weight: 500; }
.iter-body { display: none; padding: 0 14px 14px; border-top: 1px solid #eee; }
.iter-body.open { display: block; }
.ev { padding: 5px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
.ev-time { color: #aaa; font-size: 12px; font-family: monospace; min-width: 60px; }
.ev-badge { font-size: 10px; padding: 1px 5px; border-radius: 2px; color: white; white-space: nowrap; }
.ev-name { font-weight: 500; min-width: 140px; }
.ev-outcome { font-size: 11px; padding: 1px 6px; border-radius: 2px; font-weight: 500; }
.ev-outcome.denied { background: #fde8e8; color: #c0392b; }
.ev-outcome.rejected { background: #fde8e8; color: #c0392b; }
.ev-outcome.approved { background: #d5f5e3; color: #1e8449; }
.ev-fields { display: flex; flex-wrap: wrap; gap: 4px; }
.ev-f { font-size: 12px; color: #666; }
.ev-fk { color: #aaa; margin-right: 2px; }
.ev-fv { color: #333; }
.ev-content { font-size: 12px; color: #555; font-style: italic; flex-basis: 100%; padding-left: 68px; }
.log-explorer { display: grid; grid-template-columns: 200px 1fr; grid-template-rows: auto 1fr; background: white; border: 1px solid #ddd; border-radius: 2px; height: calc(100vh - 180px); }
.log-search { grid-column: 1 / -1; padding: 8px 12px; border-bottom: 1px solid #ddd; display: flex; gap: 8px; align-items: center; }
.log-search input { flex: 1; border: 1px solid #ddd; border-radius: 3px; padding: 6px 10px; font-size: 13px; font-family: monospace; }
.log-facets { border-right: 1px solid #eee; padding: 8px 0; overflow-y: auto; }
.facet-group { padding: 0 10px; margin-bottom: 10px; }
.facet-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; color: #999; margin-bottom: 3px; }
.facet-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; font-size: 12px; cursor: pointer; color: #444; }
.facet-item:hover { color: #000; }
.facet-item.active { color: #3498db; font-weight: 500; }
.facet-bar { flex: 1; height: 3px; background: #f0f0f0; border-radius: 2px; min-width: 20px; }
.facet-bar-fill { height: 100%; border-radius: 2px; background: #ddd; }
.facet-item.active .facet-bar-fill { background: #3498db; }
.facet-ct { font-size: 11px; color: #bbb; font-family: monospace; }
.log-entries { overflow-y: auto; padding: 0; }
.le { padding: 5px 10px; border-bottom: 1px solid #f5f5f5; font-size: 13px; display: flex; flex-wrap: wrap; gap: 3px 8px; align-items: baseline; cursor: pointer; }
.le.expanded { background: #f0f4ff; }
.le-detail { flex-basis: 100%; font-family: monospace; font-size: 12px; background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 3px; padding: 8px 10px; margin: 4px 0 2px; line-height: 1.6; white-space: pre-wrap; color: #333; }
.le:hover { background: #fafafa; }
.le.denied { background: #fef8f5; }
.le.journal { background: #f8f9ff; }
.le.hidden { display: none; }
.le-time { color: #aaa; font-size: 12px; font-family: monospace; min-width: 60px; }
.le-badge { font-size: 10px; padding: 1px 5px; border-radius: 2px; color: white; white-space: nowrap; }
.le-name { font-weight: 500; }
.le-outcome { font-size: 11px; padding: 1px 6px; border-radius: 2px; font-weight: 500; }
.le-outcome.denied { background: #fde8e8; color: #c0392b; }
.le-outcome.rejected { background: #fde8e8; color: #c0392b; }
.le-outcome.approved { background: #d5f5e3; color: #1e8449; }
.le-fields { display: flex; flex-wrap: wrap; gap: 3px 8px; }
.le-f { font-size: 12px; color: #666; }
.le-fk { color: #aaa; }
.le-fv { color: #333; }
.le-content { font-size: 12px; color: #555; font-style: italic; flex-basis: 100%; padding-left: 68px; }
.journal-entry { background: white; border: 1px solid #ddd; border-left: 3px solid #95a5a6; padding: 12px 16px; margin-bottom: 8px; border-radius: 2px; }
.journal-meta { display: flex; gap: 12px; font-size: 12px; color: #888; margin-bottom: 6px; }
.journal-agent { font-weight: 600; color: #555; }
.journal-text { font-size: 14px; color: #333; line-height: 1.6; }
.insight { background: white; border: 1px solid #ddd; border-left: 4px solid #ccc; margin-bottom: 6px; border-radius: 2px; }
.insight.warning { border-left-color: #e67e22; }
.insight.info { border-left-color: #3498db; }
.insight.success { border-left-color: #27ae60; }
.insight-head { padding: 8px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none; }
.insight-head:hover { background: #fafafa; }
.insight-title { font-size: 13px; font-weight: 600; }
.insight-arrow { color: #999; font-size: 12px; flex-shrink: 0; margin-left: 12px; }
.insight-body { display: none; padding: 0 14px 10px; border-top: 1px solid #f0f0f0; }
.insight-body.open { display: block; }
.insight-evidence { font-size: 13px; color: #555; margin: 8px 0; }
.insight-prompt { margin-top: 8px; background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 3px; padding: 8px 10px; font-size: 12px; font-family: monospace; color: #444; position: relative; white-space: pre-wrap; }
.suggestion { background: white; border: 1px solid #ddd; border-left: 4px solid #8e44ad; margin-bottom: 6px; border-radius: 2px; }
.suggestion-head { padding: 8px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none; }
.suggestion-head:hover { background: #fafafa; }
.suggestion-title { font-size: 13px; font-weight: 600; }
.suggestion-arrow { color: #999; font-size: 12px; flex-shrink: 0; margin-left: 12px; }
.suggestion-body { display: none; padding: 0 14px 10px; border-top: 1px solid #f0f0f0; }
.suggestion-body.open { display: block; }
.suggestion-rationale { font-size: 13px; color: #555; margin: 8px 0; }
.suggestion-change { margin: 8px 0; padding: 8px 10px; background: #f5f0fa; border: 1px solid #e0d5eb; border-radius: 3px; font-size: 13px; }
.suggestion-change strong { color: #6c3483; }
.suggestion-tradeoff { font-size: 12px; color: #888; margin: 6px 0; }
.prompts { background: white; border: 1px solid #ddd; padding: 14px; border-radius: 2px; }
.prompt-block { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
.prompt-block:last-child { border-bottom: none; }
.prompt-q { font-size: 13px; font-weight: 500; margin-bottom: 6px; }
.prompt-cmd { background: #f8f8f8; border: 1px solid #e0e0e0; border-radius: 3px; padding: 8px 10px; font-size: 12px; font-family: monospace; color: #444; position: relative; white-space: pre-wrap; }
.copy-btn { background: #f0f7ff; border: 1px solid #b8d4f0; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: 500; color: #2c6faa; position: absolute; top: 6px; right: 6px; }
.copy-btn:hover { background: #eee; }
`

export const REPORT_JS = `function switchTab(id) {
  document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.getElementById('tab-' + id).classList.add('active');
  var names = ['overview','iterations','log','journal','continue'];
  document.querySelectorAll('.tab')[names.indexOf(id)].classList.add('active');
}
function toggleBody(head) {
  var body = head.nextElementSibling;
  body.classList.toggle('open');
  head.querySelector('.insight-arrow').textContent = body.classList.contains('open') ? '▼' : '▶';
}
function toggleSuggestion(head) {
  var body = head.nextElementSibling;
  body.classList.toggle('open');
  head.querySelector('.suggestion-arrow').textContent = body.classList.contains('open') ? '▼' : '▶';
}
function copyCmd(btn) {
  var text = btn.parentElement.textContent.replace('Continue with Claude', '').trim();
  navigator.clipboard.writeText(text).then(function() {
    btn.textContent = 'Copied!';
    setTimeout(function() { btn.textContent = 'Continue with Claude'; }, 1200);
  });
}
function toggleIter(head) {
  var body = head.nextElementSibling;
  body.classList.toggle('open');
  head.querySelector('.arrow').textContent = body.classList.contains('open') ? '▼' : '▶';
}
var activeFacets = {};
function toggleFacet(el, dimension, value) {
  el.classList.toggle('active');
  if (!activeFacets[dimension]) activeFacets[dimension] = new Set();
  if (activeFacets[dimension].has(value)) {
    activeFacets[dimension].delete(value);
  } else {
    activeFacets[dimension].add(value);
  }
  if (activeFacets[dimension].size === 0) delete activeFacets[dimension];
  applyLogFilters();
}
function searchLog(query) {
  window._logSearch = query.toLowerCase();
  applyLogFilters();
}
function applyLogFilters() {
  var entries = document.querySelectorAll('#log-entries .le');
  var search = (window._logSearch || '').toLowerCase();
  var visible = 0;
  entries.forEach(function(le) {
    var show = true;
    for (var dim in activeFacets) {
      var attr = le.getAttribute('data-' + dim);
      if (!attr || !activeFacets[dim].has(attr)) { show = false; break; }
    }
    if (show && search) {
      show = le.textContent.toLowerCase().includes(search);
    }
    le.classList.toggle('hidden', !show);
    if (show) visible++;
  });
  document.getElementById('log-count').textContent = visible + ' events';
}
function toggleEvent(el) {
  var idx = parseInt(el.getAttribute('data-idx'), 10);
  var existing = el.querySelector('.le-detail');
  var prev = document.querySelector('.le.expanded');
  if (prev && prev !== el) {
    prev.classList.remove('expanded');
    var prevDetail = prev.querySelector('.le-detail');
    if (prevDetail) prev.removeChild(prevDetail);
  }
  if (existing) {
    el.classList.remove('expanded');
    el.removeChild(existing);
    return;
  }
  var evt = REPORT_DATA.annotatedEvents[idx].event;
  var lines = Object.keys(evt).map(function(k) { return k + ': ' + JSON.stringify(evt[k]); });
  var div = document.createElement('div');
  div.className = 'le-detail';
  div.textContent = lines.join('\\n');
  el.appendChild(div);
  el.classList.add('expanded');
}
function drillDown(dimension, value) {
  document.querySelectorAll('.facet-item.active').forEach(function(el) { el.classList.remove('active'); });
  activeFacets = {};
  activeFacets[dimension] = new Set([value]);
  document.querySelectorAll('.facet-item').forEach(function(el) {
    var onclick = el.getAttribute('onclick') || '';
    if (onclick.indexOf("'" + dimension + "'") !== -1 && onclick.indexOf("'" + value + "'") !== -1) {
      el.classList.add('active');
    }
  });
  window._logSearch = '';
  var searchInput = document.querySelector('.log-search input');
  if (searchInput) searchInput.value = '';
  switchTab('log');
  applyLogFilters();
}
function toggleTimelineState(css) {
  document.querySelectorAll('.tl-seg.' + css).forEach(function(s) {
    s.style.display = s.style.display === 'none' ? '' : 'none';
  });
}`

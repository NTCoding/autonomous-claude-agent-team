import type { SqliteEventStore } from '../workflow-event-store/sqlite-event-store.js'
import { buildSessionViewData, buildSessionListItem } from './session-view.js'

export function generateViewerHtml(store: SqliteEventStore): string {
  const sessionIds = store.listSessions()
  const sessions = sessionIds.map((id) => buildSessionListItem(id, store.readEvents(id)))
  const details = Object.fromEntries(
    sessionIds.map((id) => [id, buildSessionViewData(id, store.readEvents(id))])
  )
  return buildHtmlDocument(
    escapeForScript(JSON.stringify(sessions)),
    escapeForScript(JSON.stringify(details)),
  )
}

function escapeForScript(json: string): string {
  return json.replace(/<\//g, '<\\/')
}

function buildHtmlDocument(sessionsJson: string, detailsJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Workflow Viewer</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; font-size: 14px; background: #f5f5f5; color: #222; }
h1, h2, h3 { font-weight: 600; margin-bottom: 12px; }
h1 { font-size: 1.4rem; }
h2 { font-size: 1.2rem; }
h3 { font-size: 1rem; }
#app { max-width: 1100px; margin: 24px auto; padding: 0 16px; }
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
th { background: #f0f0f0; text-align: left; padding: 10px 12px; font-weight: 600; border-bottom: 1px solid #ddd; }
td { padding: 10px 12px; border-bottom: 1px solid #eee; }
tr:last-child td { border-bottom: none; }
tbody tr { cursor: pointer; transition: background 0.15s; }
tbody tr:hover { background: #f7f7ff; }
button { cursor: pointer; background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 6px 12px; font-size: 13px; }
button:hover { background: #f0f0f0; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; background: #e8e8e8; color: #555; }
.badge.active { background: #d4edda; color: #155724; }
.section { margin-top: 20px; }
.timeline { display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
.timeline-segment { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; overflow: hidden; min-width: 2px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.legend-item { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.legend-swatch { width: 12px; height: 12px; border-radius: 2px; }
.iteration { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px 16px; margin-bottom: 10px; }
.iteration-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.iteration-index { font-size: 12px; color: #888; }
.event-list { font-family: monospace; font-size: 12px; color: #444; list-style: none; }
.event-list li { padding: 2px 0; }
.event-time { color: #888; margin-right: 6px; }
#back-btn { margin-bottom: 16px; }
.meta { display: flex; gap: 20px; font-size: 13px; color: #555; margin-bottom: 16px; }
.meta span b { color: #222; }
.error { color: #c00; font-size: 13px; margin-top: 8px; }
#session-detail-view { display: none; }
</style>
</head>
<body>
<div id="app">
  <div id="session-list-view">
    <h1>Workflow Sessions</h1>
    <table id="sessions-table">
      <thead><tr><th>Session</th><th>Started</th><th>Duration</th><th>Iterations</th><th>State</th></tr></thead>
      <tbody id="sessions-body"></tbody>
    </table>
    <p id="sessions-error" class="error"></p>
  </div>
  <div id="session-detail-view">
    <button id="back-btn">&#8592; Back</button>
    <h2 id="session-title"></h2>
    <div class="meta" id="session-meta"></div>
    <div class="section"><h3>State Timeline</h3><div id="state-timeline"></div></div>
    <div class="section"><h3>Iterations</h3><div id="iteration-groups"></div></div>
    <div class="section"><h3>Recent Events</h3><ul id="recent-events" class="event-list"></ul></div>
    <p id="detail-error" class="error"></p>
  </div>
</div>
<script>
var SESSIONS=${sessionsJson};
var SESSION_DETAILS=${detailsJson};
var STATE_COLORS=['#4a90d9','#e07b39','#5ba55a','#9b6dc5','#d45f5f','#4aada5','#c8a028','#6b8e9f'];
var stateColorMap={};
var colorIdx=0;

function colorForState(s){
  if(!stateColorMap[s]){stateColorMap[s]=STATE_COLORS[colorIdx%STATE_COLORS.length];colorIdx++;}
  return stateColorMap[s];
}

function fmtDur(ms){
  if(ms<1000)return ms+'ms';
  if(ms<60000)return(ms/1000).toFixed(1)+'s';
  return Math.floor(ms/60000)+'m '+Math.floor((ms%60000)/1000)+'s';
}

function fmtDate(iso){return iso?new Date(iso).toLocaleString():'-';}

function showView(id){
  document.getElementById('session-list-view').style.display=id==='list'?'':'none';
  document.getElementById('session-detail-view').style.display=id==='detail'?'':'none';
}

function esc(str){
  var d=document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function loadSessionList(){
  var tbody=document.getElementById('sessions-body');
  tbody.innerHTML='';
  if(SESSIONS.length===0){
    tbody.innerHTML='<tr><td colspan="5" style="color:#888;text-align:center">No sessions found</td></tr>';
    return;
  }
  SESSIONS.forEach(function(s){
    var tr=document.createElement('tr');
    tr.innerHTML=
      '<td style="font-family:monospace;font-size:12px">'+esc(s.sessionId)+'</td>'+
      '<td>'+fmtDate(s.startedAt)+'</td>'+
      '<td>'+fmtDur(s.durationMs)+'</td>'+
      '<td>'+s.iterationCount+'</td>'+
      '<td><span class="badge'+(s.endedAt?'':' active')+'">'+esc(s.currentState)+'</span></td>';
    tr.addEventListener('click',function(){loadSessionDetail(s.sessionId);});
    tbody.appendChild(tr);
  });
}

function loadSessionDetail(sid){
  var data=SESSION_DETAILS[sid];
  if(!data){
    document.getElementById('detail-error').textContent='Session not found: '+sid;
    return;
  }
  document.getElementById('session-title').textContent=sid;
  document.getElementById('session-meta').innerHTML=
    '<span>Started: <b>'+fmtDate(data.startedAt)+'</b></span>'+
    '<span>Duration: <b>'+fmtDur(data.totalDurationMs)+'</b></span>'+
    '<span>State: <b>'+esc(data.currentState)+'</b></span>';
  renderTimeline(data.statePeriods);
  renderIterations(data.iterationGroups);
  renderRecentEvents(data.recentEvents);
  document.getElementById('detail-error').textContent='';
  showView('detail');
}

function renderTimeline(sp){
  var c=document.getElementById('state-timeline');
  c.innerHTML='';
  if(!sp||sp.length===0){c.textContent='No state data';return;}
  var tl=document.createElement('div');tl.className='timeline';
  var lg=document.createElement('div');lg.className='legend';
  var seen=new Set();
  sp.forEach(function(p){
    var pct=Math.max(p.proportionOfTotal*100,0.2);
    var col=colorForState(p.state);
    var seg=document.createElement('div');
    seg.className='timeline-segment';
    seg.style.width=pct+'%';
    seg.style.background=col;
    seg.title=p.state+' ('+fmtDur(p.durationMs)+')';
    tl.appendChild(seg);
    if(!seen.has(p.state)){
      seen.add(p.state);
      var it=document.createElement('div');it.className='legend-item';
      it.innerHTML='<div class="legend-swatch" style="background:'+col+'"></div><span>'+esc(p.state)+'</span>';
      lg.appendChild(it);
    }
  });
  c.appendChild(tl);c.appendChild(lg);
}

function renderIterations(ig){
  var c=document.getElementById('iteration-groups');
  c.innerHTML='';
  if(!ig||ig.length===0){c.textContent='No iterations';return;}
  ig.forEach(function(g){
    var d=document.createElement('div');d.className='iteration';
    var h=document.createElement('div');h.className='iteration-header';
    h.innerHTML='<span class="iteration-index">#'+g.iterationIndex+'</span>'+
      '<h3 style="margin:0">'+esc(g.task||'(no task)')+'</h3>'+
      '<span style="font-size:12px;color:#888">'+g.events.length+' events</span>';
    d.appendChild(h);
    var ul=document.createElement('ul');ul.className='event-list';
    g.events.slice(0,5).forEach(function(ev){
      var li=document.createElement('li');
      li.innerHTML='<span class="event-time">'+fmtDate(ev.at)+'</span>'+esc(ev.type);
      ul.appendChild(li);
    });
    if(g.events.length>5){
      var li=document.createElement('li');li.style.color='#888';
      li.textContent='... and '+(g.events.length-5)+' more';
      ul.appendChild(li);
    }
    d.appendChild(ul);c.appendChild(d);
  });
}

function renderRecentEvents(evts){
  var ul=document.getElementById('recent-events');
  ul.innerHTML='';
  if(!evts||evts.length===0){
    var li=document.createElement('li');li.textContent='No events';ul.appendChild(li);return;
  }
  evts.forEach(function(ev){
    var li=document.createElement('li');
    li.innerHTML='<span class="event-time">'+fmtDate(ev.at)+'</span>'+esc(ev.type);
    ul.appendChild(li);
  });
}

document.getElementById('back-btn').addEventListener('click',function(){showView('list');loadSessionList();});
loadSessionList();
</script>
</body>
</html>`
}

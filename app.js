(() => {
'use strict';
const $ = id => document.getElementById(id);
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch{ return false; } },
};
const pad = n => String(n).padStart(2,'0');
const fmt = s => { s = Math.max(0, Math.ceil(s - 1e-6)); return pad(Math.floor(s/60))+':'+pad(s%60); };

/* ---------- 모드 정의 ---------- */
const MODES = {
  amrap:{ name:'AMRAP', fields:['prep','work'], labels:{work:'총 시간'}, def:{prep:10,work:720,rest:0,rounds:1},
    presets:[5,10,12,15,20,30].map(m=>({label:m+'분', v:{work:m*60}})) },
  emom:{ name:'EMOM', fields:['prep','work','rounds'], labels:{work:'1회 시간', rounds:'라운드'}, def:{prep:10,work:60,rest:0,rounds:10},
    presets:[[10,60],[16,60],[20,60],[30,60],[10,120]].map(([r,w])=>({label:`${r}×${fmt(w)}`, v:{rounds:r,work:w}})) },
  tabata:{ name:'타바타', fields:['prep','work','rest','rounds'], labels:{}, def:{prep:10,work:20,rest:10,rounds:8},
    presets:[[20,10,8],[30,15,8],[40,20,6]].map(([w,r,n])=>({label:`${w}/${r} ×${n}`, v:{work:w,rest:r,rounds:n}})) },
  interval:{ name:'인터벌', fields:['prep','work','rest','rounds'], labels:{}, def:{prep:10,work:40,rest:20,rounds:6},
    presets:[[30,30,10],[40,20,6],[45,15,8],[60,30,5],[180,60,5]].map(([w,r,n])=>({label:`${fmt(w)}/${fmt(r)} ×${n}`, v:{work:w,rest:r,rounds:n}})) },
};
const FIELD = {
  prep:{label:'준비', time:true, step:5, min:0, max:600},
  work:{label:'운동', time:true, step:5, min:5, max:7200},
  rest:{label:'휴식', time:true, step:5, min:0, max:600},
  rounds:{label:'라운드', time:false, step:1, min:1, max:99},
};
const cfg = {};
for(const m in MODES) cfg[m] = {...MODES[m].def, ...store.get('cfg2_'+m,{})};
const opts = { prank:true, sound:true, voice:true, vibrate:true, ...store.get('opts',{}) };
const saveOpts = () => store.set('opts', opts);
const describe = (m,c) => m==='amrap' ? `AMRAP ${fmt(c.work)}`
  : m==='emom' ? `EMOM ${c.rounds}×${fmt(c.work)}`
  : `${MODES[m].name} ${c.work}/${c.rest}초 ×${c.rounds}`;

/* ---------- 소리 / 음성 / 진동 ---------- */
let actx;
function ctx(){ try{ actx = actx || new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume(); }catch{} return actx; }
function beep(freq=880, dur=.15, type='sine', vol=.3, when=0){
  if(!opts.sound) return; const a = ctx(); if(!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + when;
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t+dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur);
}
function boing(){
  if(!opts.sound) return; const a = ctx(); if(!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = 'sine'; o.frequency.setValueAtTime(150, t);
  for(let i=0;i<8;i++) o.frequency.linearRampToValueAtTime(i%2? 180: 520 - i*35, t + (i+1)*.07);
  o.frequency.exponentialRampToValueAtTime(90, t+.9);
  g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t+.9);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t+.9);
  [0,.15,.3,.45].forEach((d,i)=>beep(600+i*200,.18,'triangle',.25,.1+d));
}
function say(text){
  if(!opts.voice || !('speechSynthesis' in window)) return;
  try{ const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 1.1; speechSynthesis.cancel(); speechSynthesis.speak(u); }catch{}
}
const vibrate = p => { if(opts.vibrate && navigator.vibrate) try{ navigator.vibrate(p); }catch{} };
let toastT;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(()=>t.hidden=true, 1800); }

/* ---------- 화면 꺼짐 방지 ---------- */
let wl = null;
async function lockScreen(on){
  try{
    if(on && 'wakeLock' in navigator && !wl){ wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release',()=>wl=null); }
    else if(!on && wl){ await wl.release(); wl = null; }
  }catch{}
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState==='visible' && (engine.running || sw.running)) lockScreen(true); });

/* ---------- 운동 기록 ---------- */
const logs = store.get('logs', []);
const dateStr = ts => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function addLog(desc, result){ logs.unshift({ts:Date.now(), desc, result}); logs.length = Math.min(logs.length, 50); store.set('logs', logs); renderLogs(); }
function renderLogs(){
  const esc = s => String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  $('logs').innerHTML = logs.map(l=>`<li><div><div class="l-desc">${esc(l.desc)}</div><div class="l-date">${dateStr(l.ts)}</div></div><div class="l-res">${esc(l.result)}</div></li>`).join('');
}
$('logs-clear').onclick = () => { if(logs.length && confirm('운동 기록을 모두 삭제할까요?')){ logs.length = 0; store.set('logs', logs); renderLogs(); } };

/* ---------- 타이머 엔진 ---------- */
let mode = MODES[store.get('mode','amrap')] ? store.get('mode','amrap') : 'amrap';
const engine = { segs:[], idx:0, elapsed:0, last:0, running:false, started:false, done:false, timer:null, lastBeepSec:null, said:{}, amrap:0 };

function buildSegs(m, c){
  const s = [];
  if(c.prep>0) s.push({kind:'prep', len:c.prep, label:'준비'});
  for(let r=1;r<=c.rounds;r++){
    const label = m==='amrap' ? 'AMRAP' : m==='emom' ? `EMOM ${r}/${c.rounds}` : '운동';
    s.push({kind:'work', len:c.work, label, round:r});
    if(c.rest>0 && r<c.rounds) s.push({kind:'rest', len:c.rest, label:'휴식', round:r});
  }
  return s;
}
function resetEngine(){
  clearInterval(engine.timer); lockScreen(false);
  Object.assign(engine, {segs:buildSegs(mode,cfg[mode]), idx:0, elapsed:0, running:false, started:false, done:false, lastBeepSec:null, said:{}, amrap:0});
  render();
}
const remainingInSeg = () => engine.segs[engine.idx].len - engine.elapsed;
function totalLeft(){ let t = remainingInSeg(); for(let i=engine.idx+1;i<engine.segs.length;i++) t += engine.segs[i].len; return t; }
function workoutElapsed(){
  let t = 0;
  engine.segs.forEach((s,i)=>{ if(s.kind==='prep') return; if(engine.done || i<engine.idx) t += s.len; else if(i===engine.idx) t += engine.elapsed; });
  return t;
}
function enterSeg(){
  const seg = engine.segs[engine.idx], m = mode;
  engine.lastBeepSec = null; engine.said = {};
  beep(seg.kind==='work'?1320:660, .5, 'square', .25); vibrate(seg.kind==='work'?[200,80,200]:150);
  if(seg.kind==='work') say(m==='amrap' ? '시작' : m==='emom' ? `${seg.round}라운드` : '운동');
  else if(seg.kind==='rest') say('휴식');
}
function tick(){
  const now = performance.now();
  engine.elapsed += (now - engine.last)/1000; engine.last = now;
  while(!engine.done && engine.elapsed >= engine.segs[engine.idx].len){
    engine.elapsed -= engine.segs[engine.idx].len;
    engine.idx++;
    if(engine.idx >= engine.segs.length){ finish(); break; }
    enterSeg();
  }
  if(!engine.done){
    const seg = engine.segs[engine.idx], left = Math.ceil(remainingInSeg() - 1e-6), said = engine.said;
    if(left<=3 && left>=1 && engine.lastBeepSec!==left){ engine.lastBeepSec = left; beep(880,.12,'sine',.3); }
    if(seg.kind!=='prep'){
      if(mode==='amrap' && seg.len>=120 && left<=Math.round(seg.len/2) && !said.h){ said.h = 1; say('절반 남았습니다'); }
      if(mode==='amrap' && seg.len>=180 && left<=60 && !said.m){ said.m = 1; say('1분 남았습니다'); }
      if(seg.len>=30 && left<=10 && left>=9 && !said.t){ said.t = 1; say('10초'); }
    }
  }
  render();
}
function finish(){
  engine.done = true; engine.running = false; clearInterval(engine.timer); lockScreen(false);
  engine.idx = engine.segs.length-1; engine.elapsed = engine.segs[engine.idx].len;
  [0,.2,.4,.7].forEach((d,i)=>beep(784+i*130,.3,'triangle',.3,d)); vibrate([300,100,300,100,500]); say('종료');
  addLog(describe(mode, cfg[mode]), mode==='amrap' ? `${engine.amrap} 라운드` : '완료');
  toast('운동 기록을 저장했어요 💪');
}
function startRun(){
  ctx();
  const first = !engine.started;
  engine.running = true; engine.started = true; engine.last = performance.now();
  engine.timer = setInterval(tick, 100); lockScreen(true);
  if(first && engine.segs[0].kind!=='prep') enterSeg();
  render();
}
function pauseRun(){ tick(); engine.running = false; clearInterval(engine.timer); lockScreen(false); render(); }
function onPlay(){
  if(engine.done){ resetEngine(); return; }
  if(engine.running){ pauseRun(); return; }
  if(!engine.started && opts.prank){ showPrank(startRun); return; }
  startRun();
}
function skipSeg(){
  if(!engine.started || engine.done) return;
  if(engine.running) tick();
  engine.idx++; engine.elapsed = 0;
  if(engine.idx >= engine.segs.length) finish(); else { engine.last = performance.now(); enterSeg(); }
  render();
}
const inProgress = () => engine.started && !engine.done;
function confirmLose(msg){ return !inProgress() || confirm(msg); }

function chipsFor(){
  const c = cfg[mode], seg = engine.segs[engine.idx];
  let done = 0; engine.segs.forEach((s,i)=>{ if(s.kind==='work' && (i<engine.idx || engine.done)) done++; });
  const left = Math.max(0, c.rounds - done);
  if(mode==='amrap'){
    const we = workoutElapsed();
    return [['총 시간',fmt(c.work),''],['완료 라운드',engine.amrap,'hl'],['평균 페이스', engine.amrap>0 && we>0 ? fmt(we/engine.amrap) : '--:--','']];
  }
  if(mode==='emom'){
    const cur = engine.done ? c.rounds : seg.kind==='work' ? seg.round : done;
    return [['1회',fmt(c.work),''],['현재',`${cur}/${c.rounds}`,'hl'],['남은 라운드',left,'']];
  }
  return [['운동',fmt(c.work),'work'],['휴식',fmt(c.rest),'rest'],['남은 라운드',left,'hl']];
}
const CIRC = 2*Math.PI*132;
function render(){
  const c = cfg[mode], seg = engine.segs[engine.idx];
  document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  $('mode-title').textContent = describe(mode, c);
  $('total-left').textContent = engine.done ? '00:00' : fmt(totalLeft());
  const kind = engine.done ? 'done' : seg.kind;
  document.body.dataset.kind = kind; $('phase-box').dataset.kind = kind;
  $('phase-name').textContent = engine.done ? '완료!' : seg.label;
  $('phase-time').textContent = engine.done ? fmt(workoutElapsed()) : fmt(remainingInSeg());
  const frac = engine.done ? 1 : Math.min(1, engine.elapsed / seg.len);
  $('ring').style.strokeDasharray = CIRC; $('ring').style.strokeDashoffset = CIRC * (1 - frac);
  // 다음 안내
  let next;
  if(engine.done) next = mode==='amrap' ? `${engine.amrap} 라운드 완료 · 수고했어요 💪` : '수고했어요 💪';
  else if(engine.idx >= engine.segs.length-1) next = '마지막 구간 — 끝까지!';
  else { const n = engine.segs[engine.idx+1]; next = `다음 · ${n.label} ${fmt(n.len)}`; }
  $('next-line').textContent = next;
  // 칩
  chipsFor().forEach(([l,v,cls],i)=>{ $('c'+(i+1)+'l').textContent = l; $('c'+(i+1)+'v').textContent = v; $('chip'+(i+1)).className = 'chip '+cls; });
  // 라운드 점
  const dots = $('dots'), showDots = mode!=='amrap' && c.rounds>1 && c.rounds<=24;
  dots.style.display = showDots ? '' : 'none';
  if(showDots){
    let done = 0; engine.segs.forEach((s,i)=>{ if(s.kind==='work' && (i<engine.idx || engine.done)) done++; });
    const cur = !engine.done && seg.kind==='work' ? done : -1;
    if(dots.children.length !== c.rounds) dots.innerHTML = '<i></i>'.repeat(c.rounds);
    [...dots.children].forEach((d,i)=>{ d.className = i<done ? 'done' : i===cur ? 'cur' : ''; });
  }
  // 좌/우 버튼
  const L = $('slot-l'), R = $('slot-r');
  if(mode==='amrap'){
    L.hidden = false; L.textContent = '−1'; L.disabled = !(inProgress() && engine.amrap>0);
    R.hidden = false; R.textContent = '+1 라운드'; R.className = 'pill slot big'; R.disabled = !inProgress();
  } else {
    L.hidden = true; L.disabled = true;
    R.hidden = false; R.textContent = '건너뛰기 ⏭'; R.className = 'pill slot'; R.disabled = !inProgress();
  }
  $('play-icon').textContent = engine.done ? '↺' : engine.running ? '❚❚' : '▶';
  $('play-label').textContent = engine.done ? '다시' : engine.running ? '일시정지' : (engine.started ? '계속' : '시작');
  document.title = engine.running ? fmt(remainingInSeg()) : '타이머';
}
$('btn-play').onclick = onPlay;
$('phase-box').onclick = onPlay;
$('slot-r').onclick = () => {
  if(mode==='amrap'){ engine.amrap++; vibrate(40); beep(1000,.08,'triangle',.25); render(); }
  else skipSeg();
};
$('slot-l').onclick = () => { if(engine.amrap>0){ engine.amrap--; vibrate(20); render(); } };
$('btn-reset').onclick = () => { if(confirmLose('진행 중인 타이머를 초기화할까요?')) resetEngine(); };
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => {
  const m = b.dataset.mode; if(m===mode) return;
  if(!confirmLose('진행 중인 타이머가 초기화돼요. 모드를 바꿀까요?')) return;
  mode = m; store.set('mode', m); resetEngine();
});
document.addEventListener('keydown', e => {
  if(e.code==='Space' && !e.target.closest('input,button') && $('view-timer').classList.contains('active')){ e.preventDefault(); onPlay(); }
});

/* ---------- 설정 시트 (스테퍼 + 프리셋) ---------- */
let draft = null;
const fieldLabel = f => MODES[mode].labels[f] || FIELD[f].label;
const fieldStep = f => (mode==='amrap' && f==='work') ? 30 : FIELD[f].step;
function fieldMin(f){ return (mode==='emom' && f==='work') ? 10 : FIELD[f].min; }
function renderSheetVals(){
  MODES[mode].fields.forEach(f => { $('v-'+f).textContent = FIELD[f].time ? fmt(draft[f]) : draft[f]; });
  document.querySelectorAll('#sheet-presets button').forEach((b,i)=>{
    const v = MODES[mode].presets[i].v; b.classList.toggle('on', Object.keys(v).every(k=>draft[k]===v[k]));
  });
}
function openSheet(){
  if(!confirmLose('설정을 바꾸면 진행 중인 타이머가 초기화돼요. 계속할까요?')) return;
  if(engine.running) pauseRun();
  draft = {...cfg[mode]};
  $('sheet-title').textContent = MODES[mode].name + ' 설정';
  $('sheet-presets').innerHTML = MODES[mode].presets.map((p,i)=>`<button data-i="${i}">${p.label}</button>`).join('');
  $('sheet-fields').innerHTML = MODES[mode].fields.map(f=>`<div class="step-row"><span>${fieldLabel(f)}</span>
    <div class="stepper"><button class="step-btn" data-f="${f}" data-d="-1" aria-label="${fieldLabel(f)} 줄이기">−</button><b id="v-${f}"></b><button class="step-btn" data-f="${f}" data-d="1" aria-label="${fieldLabel(f)} 늘리기">+</button></div></div>`).join('');
  renderSheetVals(); $('sheet').hidden = false;
}
function stepField(f, d){
  draft[f] = Math.min(FIELD[f].max, Math.max(fieldMin(f), draft[f] + d*fieldStep(f)));
  renderSheetVals(); vibrate(8);
}
let holdT, holdI;
const stopHold = () => { clearTimeout(holdT); clearInterval(holdI); };
$('sheet-fields').addEventListener('pointerdown', e => {
  const b = e.target.closest('.step-btn'); if(!b) return; e.preventDefault();
  const f = b.dataset.f, d = +b.dataset.d; stepField(f, d); stopHold();
  holdT = setTimeout(() => { holdI = setInterval(() => stepField(f, d), 90); }, 450);
});
['pointerup','pointercancel','pointerleave'].forEach(ev => $('sheet-fields').addEventListener(ev, stopHold));
$('sheet-fields').addEventListener('contextmenu', e => e.preventDefault());
$('sheet-presets').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  Object.assign(draft, MODES[mode].presets[+b.dataset.i].v); renderSheetVals();
});
$('btn-settings').onclick = openSheet;
$('sheet-cancel').onclick = () => $('sheet').hidden = true;
$('sheet').addEventListener('click', e => { if(e.target===$('sheet')) $('sheet').hidden = true; });
$('sheet-save').onclick = () => {
  cfg[mode] = {...draft}; store.set('cfg2_'+mode, cfg[mode]);
  $('sheet').hidden = true; resetEngine(); toast('저장했어요');
};

/* ---------- FOR TIME (스톱워치 + 타임캡) ---------- */
const sw = { running:false, base:0, start:0, laps:[], raf:0, cap:store.get('sw_cap',0), capHit:false, saved:false };
const swNow = () => sw.base + (sw.running ? performance.now()-sw.start : 0);
const swFmt = ms => { const t = Math.floor(ms/100); return pad(Math.floor(t/600))+':'+pad(Math.floor(t/10)%60)+'.'+(t%10); };
function swFrame(){
  const ms = swNow();
  $('sw-time').textContent = swFmt(ms);
  const frac = sw.cap ? Math.min(1, ms/(sw.cap*60000)) : 0;
  $('sw-ring').style.strokeDasharray = CIRC; $('sw-ring').style.strokeDashoffset = CIRC*(1-frac);
  if(sw.cap && !sw.capHit && ms >= sw.cap*60000){ sw.capHit = true; [0,.25,.5].forEach(d=>beep(1200,.2,'square',.3,d)); vibrate([300,100,300]); say('타임캡'); toast('⏰ 타임캡 도달!'); }
}
function swRender(){
  swFrame();
  const idle = !sw.running && !sw.base;
  $('sw-icon').textContent = sw.running ? '❚❚' : '▶';
  $('sw-label').textContent = sw.running ? '일시정지' : (sw.base ? '계속' : '시작');
  const L = $('sw-lap');
  L.textContent = sw.running ? '랩' : (sw.saved ? '저장됨 ✓' : '기록 저장'); L.disabled = idle || (!sw.running && sw.saved);
  $('sw-reset').disabled = idle;
  $('sw-cap-label').textContent = sw.cap ? `타임캡 ${sw.cap}분` : '타임캡 없음';
  document.querySelectorAll('#cap-row button').forEach(b=>b.classList.toggle('active', +b.dataset.cap===sw.cap));
  $('laps').innerHTML = sw.laps.map((t,i)=>`<li><span>#${i+1}</span><span class="split">${swFmt(t-(sw.laps[i-1]||0))}</span><span class="tot">${swFmt(t)}</span></li>`).reverse().join('');
}
function swLoop(){ swFrame(); if(sw.running) sw.raf = requestAnimationFrame(swLoop); }
function swToggle(){
  const go = () => { ctx(); sw.running = true; sw.saved = false; sw.start = performance.now(); swLoop(); swRender(); lockScreen(true); };
  if(sw.running){ sw.base = swNow(); sw.running = false; cancelAnimationFrame(sw.raf); swRender(); lockScreen(false); }
  else if(!sw.base && opts.prank) showPrank(go);
  else go();
}
$('sw-play').onclick = swToggle;
$('sw-hero').onclick = swToggle;
$('sw-lap').onclick = () => {
  if(sw.running){ sw.laps.push(swNow()); vibrate(30); beep(1000,.06,'triangle',.2); swRender(); }
  else if(sw.base && !sw.saved){
    sw.saved = true; addLog(sw.cap ? `FOR TIME (캡 ${sw.cap}분)` : 'FOR TIME', swFmt(sw.base).replace(/\.\d$/,'')); toast('기록을 저장했어요 💪'); swRender();
  }
};
$('sw-reset').onclick = () => {
  if(sw.base && !sw.saved && !confirm('저장하지 않은 기록이 있어요. 초기화할까요?')) return;
  sw.running = false; sw.base = 0; sw.laps = []; sw.capHit = false; sw.saved = false; cancelAnimationFrame(sw.raf); lockScreen(false); swRender();
};
$('cap-row').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  sw.cap = +b.dataset.cap; store.set('sw_cap', sw.cap); sw.capHit = sw.cap>0 && swNow() >= sw.cap*60000; swRender();
});

/* ---------- 하단 탭 ---------- */
function showTab(t){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===t));
  document.querySelectorAll('.view').forEach(e=>e.classList.remove('active'));
  $('view-'+t).classList.add('active');
  if(t==='timer') render(); else document.body.dataset.kind = 'work';
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- 깜짝 사진 + 폭죽 ---------- */
const DEFAULT_IMG = 'prank.jpg'; // 이 파일을 교체하면 깜짝 사진이 바뀝니다
const imgEl = $('prank-img'), fbEl = $('prank-fallback');
imgEl.onerror = () => { imgEl.style.display='none'; fbEl.style.display='block'; };
imgEl.onload = () => { imgEl.style.display='block'; fbEl.style.display='none'; };
imgEl.src = DEFAULT_IMG;

const cv = $('confetti'), g = cv.getContext('2d');
let parts = [], confRaf = 0, burstTimer = 0;
const COLORS = ['#ff4d4d','#ffd93d','#6bff6b','#4dc3ff','#d17bff','#ff8ad8','#fff'];
function sizeCanvas(){ const d = window.devicePixelRatio||1; cv.width = innerWidth*d; cv.height = innerHeight*d; g.setTransform(d,0,0,d,0,0); }
function burst(x,y,n=70){
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2, sp = 4+Math.random()*10;
    parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-4,w:6+Math.random()*7,h:4+Math.random()*6,
      r:Math.random()*6,vr:(Math.random()-.5)*.5,c:COLORS[Math.random()*COLORS.length|0],life:90+Math.random()*60,round:Math.random()<.3});
  }
}
function confLoop(){
  g.clearRect(0,0,innerWidth,innerHeight);
  parts = parts.filter(p => p.life>0 && p.y<innerHeight+30);
  for(const p of parts){
    p.vy += .22; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life--;
    g.save(); g.translate(p.x,p.y); g.rotate(p.r); g.globalAlpha = Math.min(1,p.life/30); g.fillStyle = p.c;
    if(p.round){ g.beginPath(); g.arc(0,0,p.w/2,0,7); g.fill(); } else g.fillRect(-p.w/2,-p.h/2,p.w,p.h);
    g.restore();
  }
  confRaf = requestAnimationFrame(confLoop);
}
let prankCb = null, prankOpenAt = 0;
function showPrank(cb){
  prankCb = cb; prankOpenAt = performance.now();
  $('prank').hidden = false;
  const card = $('prank-card'); card.style.animation='none'; void card.offsetWidth; card.style.animation='';
  sizeCanvas(); parts = []; cancelAnimationFrame(confRaf); confLoop();
  const W = innerWidth, H = innerHeight;
  burst(W*.2,H*.9,80); burst(W*.8,H*.9,80); burst(W/2,H*.4,100);
  let n = 0; clearInterval(burstTimer);
  burstTimer = setInterval(() => { burst(Math.random()*W, H*.2+Math.random()*H*.4, 60); if(++n>25) clearInterval(burstTimer); }, 250);
  ctx(); boing(); vibrate([100,50,100,50,300]);
}
$('prank').onclick = () => {
  if(performance.now()-prankOpenAt < 700) return;
  $('prank').hidden = true; clearInterval(burstTimer); cancelAnimationFrame(confRaf);
  const cb = prankCb; prankCb = null; if(cb) cb();
};

/* ---------- 더보기 옵션 ---------- */
for(const [k,id] of [['prank','opt-prank'],['sound','opt-sound'],['voice','opt-voice'],['vibrate','opt-vibrate']]){
  $(id).checked = opts[k]; $(id).onchange = e => { opts[k] = e.target.checked; saveOpts(); if(k==='voice' && opts.voice) say('음성 안내를 켰어요'); };
}

/* ---------- 시작 ---------- */
renderLogs(); resetEngine(); swRender(); showTab('timer');
if('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();

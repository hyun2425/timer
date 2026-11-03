(() => {
'use strict';
const $ = id => document.getElementById(id);
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch{ return false; } },
  del(k){ try{ localStorage.removeItem(k); }catch{} }
};
const pad = n => String(n).padStart(2,'0');
const fmt = s => { s = Math.max(0, Math.ceil(s)); return pad(Math.floor(s/60))+':'+pad(s%60); };

/* ---------- 설정 ---------- */
const DEFAULTS = {
  round:  {prep:10, work:60, rest:0,  rounds:5},
  tabata: {prep:10, work:20, rest:10, rounds:8},
};
const cfg = { round:{...DEFAULTS.round, ...store.get('cfg_round',{})}, tabata:{...DEFAULTS.tabata, ...store.get('cfg_tabata',{})} };
const opts = { prank:true, sound:true, vibrate:true, ...store.get('opts',{}) };
const saveOpts = () => store.set('opts', opts);

/* ---------- 소리 ---------- */
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
  [0,.15,.3,.45].forEach((d,i)=>beep(600+i*200,.18,'triangle',.25,.1+d)); // 팡파레
}
const vibrate = p => { if(opts.vibrate && navigator.vibrate) try{ navigator.vibrate(p); }catch{} };

/* ---------- Wake Lock ---------- */
let wl = null;
async function lockScreen(on){
  try{
    if(on && 'wakeLock' in navigator && !wl){ wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release',()=>wl=null); }
    else if(!on && wl){ await wl.release(); wl = null; }
  }catch{}
}
document.addEventListener('visibilitychange', () => { if(document.visibilityState==='visible' && engine.running) lockScreen(true); });

/* ---------- 타이머 엔진 ---------- */
let mode = 'tabata';
const engine = { segs:[], idx:0, elapsed:0, last:0, running:false, started:false, done:false, timer:null, lastBeepSec:null };

function buildSegs(c){
  const s = [];
  if(c.prep>0) s.push({kind:'prep', len:c.prep, label:'준비'});
  for(let r=1;r<=c.rounds;r++){
    s.push({kind:'work', len:c.work, label:'운동', round:r});
    if(c.rest>0 && r<c.rounds) s.push({kind:'rest', len:c.rest, label:'휴식', round:r});
  }
  return s;
}
function resetEngine(){
  clearInterval(engine.timer); lockScreen(false);
  Object.assign(engine, {segs:buildSegs(cfg[mode]), idx:0, elapsed:0, running:false, started:false, done:false, lastBeepSec:null});
  render();
}
function remainingInSeg(){ return engine.segs[engine.idx].len - engine.elapsed; }
function totalLeft(){
  let t = remainingInSeg();
  for(let i=engine.idx+1;i<engine.segs.length;i++) t += engine.segs[i].len;
  return t;
}
function tick(){
  const now = performance.now();
  engine.elapsed += (now - engine.last)/1000; engine.last = now;
  while(!engine.done && engine.elapsed >= engine.segs[engine.idx].len){
    engine.elapsed -= engine.segs[engine.idx].len;
    engine.idx++;
    if(engine.idx >= engine.segs.length){ finish(); break; }
    engine.lastBeepSec = null;
    const k = engine.segs[engine.idx].kind;
    beep(k==='work'?1320:660, .5, 'square', .25); vibrate(k==='work'?[200,80,200]:150);
  }
  if(!engine.done){
    const left = Math.ceil(remainingInSeg());
    if(left<=3 && left>=1 && engine.lastBeepSec!==left){ engine.lastBeepSec = left; beep(880,.12,'sine',.3); }
  }
  render();
}
function finish(){
  engine.done = true; engine.running = false; clearInterval(engine.timer); lockScreen(false);
  engine.idx = engine.segs.length-1; engine.elapsed = engine.segs[engine.idx].len;
  [0,.2,.4,.7].forEach((d,i)=>beep(784+i*130,.3,'triangle',.3,d)); vibrate([300,100,300,100,500]);
}
function startRun(){
  ctx();
  engine.running = true; engine.started = true; engine.last = performance.now();
  engine.timer = setInterval(tick, 100); lockScreen(true); render();
}
function pauseRun(){ tick(); engine.running = false; clearInterval(engine.timer); lockScreen(false); render(); }

function onPlay(){
  if(engine.done){ resetEngine(); return; }
  if(engine.running){ pauseRun(); return; }
  if(!engine.started && opts.prank){ showPrank(startRun); return; }
  startRun();
}

const CIRC = 2*Math.PI*132;
function render(){
  const c = cfg[mode], seg = engine.segs[engine.idx];
  $('mode-title').textContent = mode==='tabata' ? '타바타' : '라운드';
  $('total-left').textContent = fmt(totalLeft());
  const kind = engine.done ? 'done' : seg.kind;
  document.body.dataset.kind = kind;
  $('phase-box').dataset.kind = kind;
  $('phase-name').textContent = engine.done ? '완료!' : seg.label;
  $('phase-time').textContent = engine.done ? '00:00' : fmt(remainingInSeg());
  const frac = engine.done ? 1 : Math.min(1, engine.elapsed / seg.len);
  $('ring').style.strokeDasharray = CIRC;
  $('ring').style.strokeDashoffset = CIRC * (1 - frac);
  $('chip-work').textContent = fmt(c.work);
  $('chip-rest').textContent = fmt(c.rest);
  let doneRounds = 0;
  engine.segs.forEach((s,i)=>{ if(s.kind==='work' && (i<engine.idx || engine.done)) doneRounds++; });
  const cur = engine.done ? -1 : (seg.kind==='work' ? doneRounds : -1);
  $('rounds-left').textContent = Math.max(0, c.rounds - doneRounds);
  const dots = $('dots');
  if(dots.children.length !== c.rounds){ dots.innerHTML = '<i></i>'.repeat(c.rounds); }
  [...dots.children].forEach((d,i)=>{ d.className = i<doneRounds ? 'done' : i===cur ? 'cur' : ''; });
  $('play-icon').textContent = engine.done ? '↺' : engine.running ? '❚❚' : '▶';
  $('play-label').textContent = engine.done ? '다시' : engine.running ? '일시정지' : (engine.started ? '계속' : '시작');
  document.title = engine.running ? fmt(remainingInSeg()) : '타이머';
}

/* ---------- 스톱워치 ---------- */
const sw = { running:false, base:0, start:0, laps:[], raf:0 };
const swNow = () => sw.base + (sw.running ? performance.now()-sw.start : 0);
const swFmt = ms => { const t = Math.floor(ms/100); return pad(Math.floor(t/600))+':'+pad(Math.floor(t/10)%60)+'.'+(t%10); };
function swRender(){
  $('sw-time').textContent = swFmt(swNow());
  $('sw-icon').textContent = sw.running ? '❚❚' : '▶';
  $('sw-label').textContent = sw.running ? '일시정지' : (sw.base ? '계속' : '시작');
  $('laps').innerHTML = sw.laps.map((l,i)=>`<li><span>랩 ${sw.laps.length-i}</span><span>${swFmt(l)}</span></li>`).join('');
}
function swLoop(){ $('sw-time').textContent = swFmt(swNow()); if(sw.running) sw.raf = requestAnimationFrame(swLoop); }
function swToggle(){
  const go = () => { sw.running = true; sw.start = performance.now(); swLoop(); swRender(); lockScreen(true); };
  if(sw.running){ sw.base = swNow(); sw.running = false; cancelAnimationFrame(sw.raf); swRender(); lockScreen(false); }
  else if(!sw.base && opts.prank) showPrank(go);
  else go();
}
$('sw-play').onclick = swToggle;
$('sw-lap').onclick = () => { if(sw.running){ sw.laps.unshift(swNow()); swRender(); } };
$('sw-reset').onclick = () => { sw.running=false; sw.base=0; sw.laps=[]; cancelAnimationFrame(sw.raf); lockScreen(false); swRender(); };

/* ---------- 탭 ---------- */
function showTab(t){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===t));
  const v = t==='stopwatch' ? 'stopwatch' : t==='more' ? 'more' : 'timer';
  document.querySelectorAll('.view').forEach(e=>e.classList.remove('active'));
  if(v!=='timer') document.body.dataset.kind = 'work'; else render();
  $('view-'+v).classList.add('active');
  if(v==='timer' && t!==mode){
    if(engine.running) pauseRun();
    mode = t; resetEngine();
  }
  store.set('tab', t);
}
document.querySelectorAll('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- 설정 시트 ---------- */
const F = {prep:$('f-prep'), work:$('f-work'), rest:$('f-rest'), rounds:$('f-rounds')};
$('btn-settings').onclick = () => {
  $('sheet-title').textContent = (mode==='tabata'?'타바타':'라운드') + ' 설정';
  for(const k in F) F[k].value = cfg[mode][k];
  $('sheet').hidden = false;
};
$('sheet-cancel').onclick = () => $('sheet').hidden = true;
$('sheet-save').onclick = () => {
  const lim = {prep:[0,600], work:[1,3600], rest:[0,3600], rounds:[1,99]};
  for(const k in F){ const v = parseInt(F[k].value,10); cfg[mode][k] = isNaN(v) ? cfg[mode][k] : Math.min(lim[k][1], Math.max(lim[k][0], v)); }
  store.set('cfg_'+mode, cfg[mode]);
  $('sheet').hidden = true; resetEngine();
};
$('btn-reset').onclick = resetEngine;
$('btn-play').onclick = onPlay;

/* ---------- 깜짝 사진 ---------- */
const DEFAULT_IMG = 'prank.jpg'; // 이 파일을 교체하면 기본 사진이 바뀝니다
const imgEl = $('prank-img'), fbEl = $('prank-fallback');
function getPrankSrc(){ return store.get('prank_img', null) || DEFAULT_IMG; }
function applyPrankImg(el){
  el.onerror = () => { el.style.display='none'; if(el===imgEl) fbEl.style.display='block'; };
  el.onload = () => { el.style.display='block'; if(el===imgEl) fbEl.style.display='none'; };
  el.src = getPrankSrc();
}
applyPrankImg($('prank-preview'));

$('prank-file').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const s = Math.min(1, 1000/Math.max(img.width,img.height));
    const c = document.createElement('canvas'); c.width = img.width*s; c.height = img.height*s;
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const data = c.toDataURL('image/jpeg', .85);
    if(!store.set('prank_img', data)) alert('사진이 너무 커서 저장하지 못했어요.');
    URL.revokeObjectURL(url); applyPrankImg($('prank-preview'));
  };
  img.src = url; e.target.value = '';
};
$('prank-reset').onclick = () => { store.del('prank_img'); applyPrankImg($('prank-preview')); };
$('prank-test').onclick = () => showPrank(() => {});

/* ---------- 폭죽 ---------- */
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
  applyPrankImg(imgEl);
  const el = $('prank'); el.hidden = false;
  const card = $('prank-card'); card.style.animation='none'; void card.offsetWidth; card.style.animation='';
  sizeCanvas(); parts = []; cancelAnimationFrame(confRaf); confLoop();
  const W = innerWidth, H = innerHeight;
  const fire = () => { burst(Math.random()*W, H*.2+Math.random()*H*.4, 60); };
  burst(W*.2,H*.9,80); burst(W*.8,H*.9,80); burst(W/2,H*.4,100);
  let n = 0; clearInterval(burstTimer);
  burstTimer = setInterval(() => { fire(); if(++n>25) clearInterval(burstTimer); }, 250);
  ctx(); boing(); vibrate([100,50,100,50,300]);
}
$('prank').onclick = () => {
  if(performance.now()-prankOpenAt < 700) return; // 실수로 바로 닫히는 것 방지
  $('prank').hidden = true; clearInterval(burstTimer); cancelAnimationFrame(confRaf);
  const cb = prankCb; prankCb = null; if(cb) cb();
};

/* ---------- 더보기 옵션 ---------- */
for(const [k,id] of [['prank','opt-prank'],['sound','opt-sound'],['vibrate','opt-vibrate']]){
  $(id).checked = opts[k]; $(id).onchange = e => { opts[k] = e.target.checked; saveOpts(); };
}

/* ---------- 시작 ---------- */
const startTab = store.get('tab','tabata');
mode = startTab==='round' ? 'round' : 'tabata';
resetEngine(); swRender();
showTab(['tabata','round','stopwatch','more'].includes(startTab) ? startTab : 'tabata');

if('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();

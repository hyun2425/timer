const CACHE = 'timer-v1';
const ASSETS = ['./','index.html','style.css','app.js','manifest.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k!==CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// 네트워크 우선, 실패 시 캐시 (배포 후 바로 업데이트 반영 + 오프라인 지원)
self.addEventListener('fetch', e => {
  if(e.request.method!=='GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});

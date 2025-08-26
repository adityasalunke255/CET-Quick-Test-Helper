// sw.js - cache-first for static, network-first for data
const CACHE_NAME = 'cet-static-v3';
const ASSETS = [
  './', './index.html', './styles.css',
  './js/bundle.js','./js/sw-register.js',
  './assets/logo.svg','./assets/favicon.svg',
  './manifest.json','./data/questions-inline.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(()=> self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request).then(r => { const copy=r.clone(); caches.open(CACHE_NAME).then(c=>c.put(e.request, copy)); return r; })
        .catch(()=> caches.match(e.request))
    );
  } else {
    e.respondWith(caches.match(e.request).then(m => m || fetch(e.request)));
  }
});

/* 참가격(가제) 서비스 워커.
   앱 껍데기(아이콘·매니페스트)는 캐시 우선, index.html 은 네트워크 우선이다.
   index.html 안에 데이터가 인라인돼 있어서(build_data.py 주입) 캐시 우선으로 두면
   데이터를 새로 받아도 예전 화면이 계속 보이기 때문이다. 오프라인일 때만 캐시로 돌아간다. */

const CACHE = 'event-price-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  // 버전이 올라가면 예전 캐시를 지운다
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isPage = event.request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/');
  if (isPage) {
    // 네트워크 우선: 성공하면 캐시를 갱신하고, 실패(오프라인)하면 캐시로
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request).then(hit => hit || caches.match('./index.html')))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(hit => hit || fetch(event.request))
    );
  }
});

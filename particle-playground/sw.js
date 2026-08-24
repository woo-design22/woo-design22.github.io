/* 파티클 플레이그라운드 서비스 워커.
   설치 시 앱 파일을 캐시에 담아 두고, 이후에는 캐시를 먼저 돌려준다.
   덕분에 홈 화면에 설치한 뒤에는 오프라인에서도 실행된다. */

const CACHE = 'particle-playground-v1';
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
  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request))
  );
});

/* 서비스 워커: 앱 파일을 저장해 두어 인터넷이 약해도 앱이 열리게 합니다.
   ※ 파일을 수정해서 다시 올릴 때는 CACHE_VERSION 숫자를 올려 주세요. */
const CACHE_VERSION = 'v2';
const CACHE = `allergy-card-${CACHE_VERSION}`;

const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
];
const RUNTIME_HOSTS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 파일 하나가 없어도 설치가 통째로 실패하지 않도록 하나씩 저장
    // 외부 라이브러리는 처음 한 번 인터넷이 필요
    await Promise.all([...CORE, ...CDN].map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('allergy-card-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // 구글 시트 전송(POST)은 그대로 통과

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !RUNTIME_HOSTS.includes(url.hostname)) return;   // script.google.com 등은 건드리지 않음

  // 화면(HTML) 요청: 네트워크 우선, 실패하면 저장된 index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // 앱 파일(같은 사이트): 네트워크 우선 → 항상 최신 파일을 보여 주고, 인터넷이 없을 때만 저장본 사용
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 외부 라이브러리·폰트: 저장본을 먼저 보여 주고, 뒤에서 갱신
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

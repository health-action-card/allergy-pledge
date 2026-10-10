// 서비스 워커: 앱 기본 파일을 저장해 두어 오프라인에서도 열리게 함
// 파일을 수정해 배포할 때는 CACHE_NAME 숫자를 올려 주세요.
const CACHE_NAME = 'allergy-pledge-v2';
const CORE_FILES = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 시트 전송(POST)이나 Apps Script 요청은 캐시하지 않고 그대로 통과
  if (req.method !== 'GET' || req.url.includes('script.google.com') || req.url.includes('googleusercontent.com')) {
    return;
  }

  // 네트워크 우선 → 실패하면 캐시 (수정한 파일이 바로 반영되도록)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});

// Bump the version whenever a cached app file changes.
const version = 'v12';
const base = self.registration.scope;
const prefix = `study-checkin:${base}:`;
const cacheName = prefix + version;
const home = new URL('./index.html', base).href;
const shell = [
  './index.html', './css/style.css', './js/schedule.js', './js/storage.js', './js/app.js', './js/focus.js',
  './js/customize.js', './js/push.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './fonts/poem.woff2',
].map(path => new URL(path, base).href);

self.addEventListener('push', event => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (payload?.type !== 'focus-ended' || !/^[\da-f-]{36}$/.test(payload.id)) return;
  event.waitUntil(self.registration.showNotification('专注计时结束', {
    body: '本轮专注已完成，打开考研打卡查看记录。',
    tag: `study-focus-${payload.id}`,
    icon: new URL('./icons/icon-192.png', base).href,
  }));
});

self.addEventListener('notificationclick', event => {
  if (!event.notification.tag.startsWith('study-focus-')) return;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => client.url.startsWith(base));
    if (existing) await existing.focus();
    else await self.clients.openWindow(new URL('./#focus', base).href);
  })());
});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(shell.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('message', event => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const target = url.origin + url.pathname;
  const isHome = event.request.mode === 'navigate' && (target === base || target === home);
  if (!isHome && !shell.includes(target)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(isHome ? home : target);
    return cached || fetch(event.request);
  })());
});

// Service Worker для Paradox Comics
// Версия кэша — меняйте при каждом значимом обновлении сайта,
// чтобы у читателей подтянулась свежая версия вместо старой из кэша.
const CACHE_VERSION = 'paradox-comics-v4'; // v4: иконки переехали в папку icons/

// "Скелет" приложения — то, что нужно, чтобы сайт открылся офлайн.
// Иконки лежат в папке icons/.
const APP_SHELL = [
  './',
  './index.html',
  './404.html',
  './data.json',
  './manifest.json',
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ---------- УСТАНОВКА: кладём скелет приложения в кэш ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---------- АКТИВАЦИЯ: чистим кэши от старых версий ----------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---------- ЗАПРОСЫ: stale-while-revalidate ----------
// Отдаём мгновенно из кэша (если есть), а в фоне тихо обновляем кэш свежей версией
// из сети — следующий визит уже получит обновлённый файл.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Кэшируем только свой сайт. Внешние шрифты и т.п. пусть работают как обычно.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(event.request).then(cachedResponse => {
        const networkFetch = fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse); // офлайн — довольствуемся тем, что есть в кэше

        return cachedResponse || networkFetch;
      })
    )
  );
});

// ---------- PUSH-УВЕДОМЛЕНИЯ ----------
// ВАЖНО: этот обработчик реагирует на push-события браузера, но сами события
// должны прийти от push-сервера с валидной подпиской (VAPID). Статический сайт
// без бэкенда не может САМ отправлять push, пока у него не открыта вкладка —
// см. пояснение в чате. Код ниже корректно отработает, как только появится
// сервер, реально отправляющий push (например, через web-push + Node.js).
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'Paradox Comics', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Paradox Comics';
  const options = {
    body: data.body || 'Вышла новая глава!',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './index.html' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Клик по уведомлению — открываем сайт (или фокусируем уже открытую вкладку)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

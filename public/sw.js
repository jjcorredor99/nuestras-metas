// Cache "primero red, si falla caché" para que la app abra sin conexión.
const CACHE = 'nuestras-metas-v1'
self.addEventListener('install', (e) => {
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== location.origin && !url.hostname.includes('gstatic') && !url.hostname.includes('googleapis')) return
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone()
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {})
        return res
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match(`${self.registration.scope}index.html`))),
  )
})

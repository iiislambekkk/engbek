const CACHE_NAME = "engbek-static-v2"
const APP_SHELL = ["/offline.html", "/favicon.ico", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) return
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")))
    return
  }
  if (url.pathname === "/favicon.ico" || url.pathname.endsWith(".png")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
  }
})

"use strict";

const CACHE_VERSION = "v6-compact-nav-shell";
const CACHE_PREFIX = "prolinker-";
const PRECACHE = `${CACHE_PREFIX}precache-${CACHE_VERSION}`;
const PAGE_CACHE = `${CACHE_PREFIX}pages-${CACHE_VERSION}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-${CACHE_VERSION}`;
const OFFLINE_URL = "./offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "./Prolinker Homepage.dc.html",
  "./Prolinker Login.dc.html",
  "./Prolinker Profiel.dc.html",
  "./prolinker-theme.css",
  "./prolinker-app.js",
  "./prolinker-account-menu.js",
  "./support.js",
  "./manifest.webmanifest",
  "./assets/prolinker-mark.png",
  "./assets/prolinker-logo.png",
  "./assets/pwa/icon-192.png",
  "./assets/pwa/icon-512.png",
  "./assets/vendor/react-18.3.1.production.min.js",
  "./assets/vendor/react-dom-18.3.1.production.min.js",
  "./assets/vendor/babel-standalone-7.29.0.min.js",
  "./assets/vendor/pdfjs-compat-5.4.624.mjs",
  "./assets/vendor/pdfjs-5.4.624.mjs",
  "./assets/vendor/pdfjs-worker-bootstrap-5.4.624.mjs",
  "./assets/vendor/pdfjs-worker-5.4.624.mjs",
  "./assets/vendor/mammoth-1.12.0.browser.min.js"
];

const SENSITIVE_PATH = /(?:^|\/)(?:account|accounts|api|auth|oauth|login|logout|session|sessions|token|tokens|graphql|webhooks?|socket|ws)(?:\/|$)/i;
const SENSITIVE_QUERY_KEY = /(?:access[_-]?token|auth|authorization|code|key|password|secret|session|signature|token)/i;
const ASSET_DESTINATIONS = new Set([
  "audio",
  "font",
  "image",
  "manifest",
  "script",
  "style",
  "track",
  "video",
  "worker"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  const currentCaches = new Set([PRECACHE, PAGE_CACHE, ASSET_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key.startsWith(CACHE_PREFIX) && !currentCaches.has(key)) {
              return caches.delete(key);
            }
            return false;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept mutations. They must always reach the server directly.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Keep third-party traffic, API/auth requests and requests carrying secrets
  // outside Cache Storage so future backend integrations remain safe by default.
  if (url.origin !== self.location.origin || isSensitiveRequest(request, url)) {
    return;
  }

  if (isHtmlRequest(request)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  if (isAssetRequest(request, url)) {
    const cachePromise = caches.open(ASSET_CACHE);
    const updatePromise = Promise.all([cachePromise, fetch(request)]).then(
      async ([cache, response]) => {
        if (canCache(response)) {
          await cache.put(request, response.clone());
        }
        return response;
      }
    );

    event.respondWith(
      cachePromise
        .then((cache) => cache.match(request))
        .then((cachedResponse) => cachedResponse || updatePromise)
    );
    event.waitUntil(updatePromise.then(() => undefined, () => undefined));
  }
});

function isSensitiveRequest(request, url) {
  if (SENSITIVE_PATH.test(url.pathname)) {
    return true;
  }

  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEY.test(key)) {
      return true;
    }
  }

  if (
    request.headers.has("authorization") ||
    request.headers.has("x-api-key") ||
    request.headers.has("x-auth-token")
  ) {
    return true;
  }

  const cacheControl = request.headers.get("cache-control") || "";
  return /(?:no-store|private)/i.test(cacheControl);
}

function isHtmlRequest(request) {
  if (request.mode === "navigate" || request.destination === "document") {
    return true;
  }

  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isAssetRequest(request, url) {
  if (ASSET_DESTINATIONS.has(request.destination)) {
    return true;
  }

  return /\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|webmanifest|webp|woff2?|ttf)(?:$|\?)/i.test(
    url.pathname
  );
}

function canCache(response) {
  if (!response || !response.ok || response.type === "opaque") {
    return false;
  }

  const cacheControl = response.headers.get("cache-control") || "";
  return !/(?:no-store|private)/i.test(cacheControl);
}

async function networkFirstHtml(request) {
  try {
    const response = await fetch(request);

    if (canCache(response)) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cachedPage = await caches.match(request);
    if (cachedPage) {
      return cachedPage;
    }

    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) {
      return offlinePage;
    }

    return new Response("ProLinker is offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

// This script must be at the site root (not under '/js') otherwise fetch doesn't get intercepted.

// (A) CREATE/INSTALL CACHE
self.addEventListener("install", evt => {
    self.skipWaiting(); // to replace old workers immediately
    evt.waitUntil(addStaticResourcesToCache([
        "/",
        "/js/site.js",
        "/css/site.css" // add more files to cache here
    ]));
});

// (B) CLAIM CONTROL INSTANTLY
// Otherwise this worker will not control existing opened pages.
self.addEventListener("activate", evt => self.clients.claim());

// (C) LOAD FROM CACHE FIRST, FALLBACK TO NETWORK IF NOT FOUND
self.addEventListener("fetch", evt => evt.respondWith(fetchUseCache(evt.request)));

async function addStaticResourcesToCache(resources) {
    const cache = await caches.open("NetworkRequests");
    await cache.addAll(resources);
}

async function fetchUseCache(request) {
    //if (request.url === 'https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetViewportInfo')
    //    return new Response('', { status: 200 });
    const match = await caches.match(request);
    const response = match || await fetchAndCache(request);
    return response;
}

async function fetchAndCache(request) {
    console.log('caching ' + request.url);
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open("NetworkRequests");
        cache.put(request, response.clone());
    }
    return response;
}
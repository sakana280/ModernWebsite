// This script must be at the site root (not under '/js') otherwise fetch doesn't get intercepted.
// Or can host under /js, set scope to / and set this script's Service-Worker-Allowed header to /
// as per https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#examples

const ENABLE_CACHE = false;
const DATA_PUSH_EVENT_TAG = 'data-push';

//import localforage from './lib/localforage/dist/localforage.min.js'; // uses IndexedDB which works inside service workers
importScripts('./lib/localforage/dist/localforage.min.js'); // uses IndexedDB which works inside service workers

// (A) CREATE/INSTALL CACHE
self.addEventListener("install", evt => {
    console.log("Installed service worker");
    self.skipWaiting(); // to replace old workers immediately
    evt.waitUntil(addStaticResourcesToCache([ // these files are cached by the browser's SW mechanism, separate and in addition to our custom NetworkRequests cache
    //    "/",
    //    "/js/site.js",
    //    "/css/site.css" // add more files to cache here
    ]));
});

// (B) CLAIM CONTROL INSTANTLY
// Otherwise this worker will not control existing opened pages.
self.addEventListener("activate", evt => self.clients.claim());

// (C) LOAD FROM CACHE FIRST, FALLBACK TO NETWORK IF NOT FOUND
self.addEventListener("fetch", evt => evt.respondWith(fetchUseCache(evt.request)));

self.addEventListener('message', async (event) => {
    if (event.data.type === 'GET_PINS') {
        event.ports[0].postMessage(await loadFromStorage());
    }
    if (event.data.type === 'UPDATE_PIN') {
        await updatePin(event.data.payload);
    }
});

async function addStaticResourcesToCache(resources) {
    const cache = await caches.open("NetworkRequests");
    await cache.addAll(resources);
}

async function fetchUseCache(request) {
    const match = await caches.match(request);
    const response = match || await fetchAndCache(request);
    return response;
}

async function fetchAndCache(request) {
    console.log('caching ' + request.url);
    const response = await fetch(request);
    if (response.ok && ENABLE_CACHE) {
        const cache = await caches.open("NetworkRequests");
        cache.put(request, response.clone());
    }
    return response;
}

async function loadFromStorage() {
    var pins = [];
    await localforage.iterate(function (value, key, iterationNumber) {
        if (key.startsWith('pin') && value.show) {
            pins.push(value);
        }
    });
    return pins;
}

async function updatePin(pin) {
    pin.sync = true;
    pin.updated = new Date().toISOString();
    await localforage.setItem('pin-' + pin.id, pin);
    //todo notify all clients
    await scheduleDataPush();
}

async function scheduleDataPush() {
    const tags = await self.registration.sync.getTags();
    if (!tags.includes(DATA_PUSH_EVENT_TAG)) {
        await self.registration.sync.register(DATA_PUSH_EVENT_TAG); // need to handle NotAllowedError if user has disabled background sync?
    }
}

self.addEventListener('sync', event => {
    if (event.tag === DATA_PUSH_EVENT_TAG) {
        event.waitUntil(trySendPendingData());
        // what if even.lastChance===true?
    }
});

async function trySendPendingData() {
    // Get pins that have not been sync'ed to the backend yet.
    var pins = [];
    await localforage.iterate(function (value, key, iterationNumber) {
        if (key.startsWith('pin') && value.sync) {
            pins.push({ key:key, value: value });
        }
    });

    // Send each to the backend, and only mark as sent after successful send.
    console.log('Sending pins', pins.length);
    pins.forEach(async item => {
        console.log('Sending pin', item.value.id);
        await fetch('api/Sync', {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.value)
        });
        item.value.sync = false;
        await localforage.setItem(item.key, item.value);
    });
}

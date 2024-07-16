// This script must be at the site root (not under '/js') otherwise fetch doesn't get intercepted.
// Or can host under /js, set scope to / and set this script's Service-Worker-Allowed header to /
// as per https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#examples

const ENABLE_CACHE = false;
const DATA_PUSH_EVENT_TAG = 'data-push';
const DATA_PULL_EVENT_TAG = 'data-pull';

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
self.addEventListener("activate", evt => {
    self.clients.claim();
    evt.waitUntil(scheduleSyncEvent(DATA_PULL_EVENT_TAG));
});

// (C) LOAD FROM CACHE FIRST, FALLBACK TO NETWORK IF NOT FOUND
self.addEventListener("fetch", evt => evt.respondWith(fetchUseCache(evt.request)));

self.addEventListener('message', async (event) => {
    if (event.data.type === 'GET_PINS') {
        event.ports[0].postMessage(await loadFromStorage());
        await scheduleSyncEvent(DATA_PULL_EVENT_TAG); // force reload from server on page load TODO use something smarter and less chatty like signalr
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
    //todo don't cache browser link requests
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
    await sendToClients(pin);
    await scheduleSyncEvent(DATA_PUSH_EVENT_TAG);
}

async function sendToClients(pin) {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
        client.postMessage({ type: 'UPDATE_PIN', payload: pin });
    };
}

async function scheduleSyncEvent(tag) {
    const tags = await self.registration.sync.getTags();
    //todo work out why registrations are only firing once, tags might need to be unique?
    //if (!tags.includes(tag)) {
        console.log('Scheduling sync', tag);
        await self.registration.sync.register(tag); // need to handle NotAllowedError if user has disabled background sync?
    //}
}

self.addEventListener('sync', event => {
    if (event.tag === DATA_PUSH_EVENT_TAG) {
        event.waitUntil(trySendPendingData());
        // what if event.lastChance===true?
    } else if (event.tag === DATA_PULL_EVENT_TAG) {
        event.waitUntil(loadServerData());
        // what if event.lastChance===true?
    }
});

async function loadServerData() {
    console.log('Loading server data');
    const response = await fetch('api/Sync');
    if (!response.ok) throw new Error(`Server load status: ${response.status}`);
    const pins = await response.json();
    for (const pin of pins) {
        await mergePin(pin);
    }
}
async function mergePin(remotePin) {
    const cachedPin = await localforage.getItem('pin-' + remotePin.id);
    const cachedUpdated = cachedPin && Date.parse(cachedPin.updated);
    const remoteUpdated = Date.parse(remotePin.updated);
    //todo check pin contents for change, not just update timestamp

    if (cachedPin === null || (remotePin.updated > cachedPin.updated && !cachedPin.sync)) {
        await localforage.setItem('pin-' + remotePin.id, remotePin);
        await sendToClients(remotePin);

    } else if (remoteUpdated > cachedUpdated && cachedPin.sync) {
        console.error('Concurrent edit conflict for pin', remotePin.id);

    } else if (remoteUpdated < cachedUpdated && cachedPin.sync) {
        console.log('Pending sync for newer local pin', remotePin.id);

    } else if (remoteUpdated < cachedUpdated && !cachedPin.sync) {
        console.error('Data corruption or need to resend local pin', remotePin.id);
    }
}

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
    for (const item of pins) {
        console.log('Sending pin', item.value.id);
        await fetch('api/Sync', {
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.value)
        });
        // todo check response.ok
        item.value.sync = false;
        await localforage.setItem(item.key, item.value);
    };
}

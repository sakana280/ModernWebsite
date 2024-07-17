// Storage schemas:
// clientid: this client id, a guid generated if no clientid yet
// pin-{GUID}: a pin object: {id:GUID, owner:GUID, latlng:latlng, updated:<ISO UTC date>, show:true|false, sync:true|false}
// After a pin changes (move/delete) sync=true indicating it needs to be sync'ed to the server
// After a changed pin is sync'ed, set sync=false
// After a pin is deleted, show=false
// Can remove a pin entry after show=false and sync=false

// Use localForage as an improved localStorage that stores any object and prefers IndexedDB.
import '../lib/localforage/dist/localforage.min.js';

import { Workbox } from '../lib/workbox-window/build/workbox-window.prod.mjs';
const wb = new Workbox('../service-worker.js');
await wb.register(); // defers registration to after page load

if (Notification.permission !== "granted") {
    const btn = document.getElementById('subscribeToPushNotifications');
    btn.style.display = 'block';
    btn.addEventListener('click', async event => {
        const status = await Notification.requestPermission();
        if (status === 'granted') {
            btn.style.display = 'none';
            //todo subscribe
        }
    });
}

const map = L.map('map').setView([-34.928, 138.598], 8); // Adelaide

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Generate client id.
// TODO authentication/username should replace this.
const clientid = await localforage.getItem('clientid') || await generateAndStoreNewClientId();
console.log('clientid', clientid);

// On page load, immediately load from storage, and start sync from server.
await loadFromSW();



async function generateAndStoreNewClientId() {
    const id = crypto.randomUUID();
    await localforage.setItem('clientid', id);
    return id;
}

// https://stackoverflow.com/questions/18575722/leaflet-js-set-marker-on-click-update-position-on-drag/18601489#18601489
map.on('click', async function (e) {
    const id = crypto.randomUUID();
    const pin = { id: id, owner: clientid, latlng: e.latlng, show: true };
    wb.messageSW({ type: 'UPDATE_PIN', payload: pin });
    // Add the pin to the map when the service worker echoes back the new pin.
});

function addPin(pin) {
    const id = pin.id;
    const position = pin.latlng;
    console.log('new', id, 'at', position);
    const isMine = pin.owner === clientid;
    const icon = isMine ? redIcon : blueIcon;
    const marker = new L.marker(position, { icon: icon, draggable: isMine, interactive: isMine });
    marker.pin = pin;

    // Only allow edits to our own pins.
    if (isMine) {
        marker.on('dragend', async function (event) { // clicked and dragged
            var marker = event.target;
            var position = marker.getLatLng();
            marker.pin.latlng = position;
            wb.messageSW({ type: 'UPDATE_PIN', payload: marker.pin });
            console.log('move', id, 'to', position);
        });

        marker.on('click', async function (event) { // clicked without dragging -> delete
            var marker = event.target;
            marker.pin.show = false;
            wb.messageSW({ type: 'UPDATE_PIN', payload: marker.pin });
            console.log('delete', id);
        });
    }

    map.addLayer(marker);
}

async function loadFromSW() {
    const pins = await wb.messageSW({ type: 'GET_PINS' });
    pins.map(addPin);
}

navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data.type == 'UPDATE_PIN') {
        const pin = event.data.payload;
        const layer = getLayerForPinId(pin.id);
        if (!layer) {
            addPin(pin);
        } else if (pin.show) {
            layer.pin = pin; // might have updated our own pin from another tab or device
            layer.setLatLng(pin.latlng);
        } else {
            map.removeLayer(layer);
        }
    } else {
        console.error('Unexpected message', event);
    }
});

function getLayerForPinId(id) {
    const found = [];
    map.eachLayer(layer => {
        if (layer.pin && layer.pin.id === id) {
            found.push(layer);
        }
    });
    return found.length > 0 ? found[0] : null;
}

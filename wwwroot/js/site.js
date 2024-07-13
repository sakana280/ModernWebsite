// Storage schemas:
// clientid: this client id, a guid generated if no clientid yet
// pin-{GUID}: a pin object: {id:GUID, owner:GUID, latlng:latlng, show:true|false, sync:true|false}
// After a pin changes (move/delete) sync=true indicating it needs to be sync'ed to the server
// After a changed pin is sync'ed, set sync=false
// After a pin is deleted, show=false
// Can remove a pin entry after show=false and sync=false

const map = L.map('map').setView([-34.928, 138.598], 8); // Adelaide

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Generate client id.
// Authentication/username would normally replace this.
const clientid = await localforage.getItem('clientid') || generateAndStoreNewClientId();
console.log('clientid', clientid);

// On page load, immediately load from storage, and start sync from server.
loadFromStorage();
//todo start sync



async function generateAndStoreNewClientId() {
    const id = crypto.randomUUID();
    await localforage.setItem('clientid', id);
    return id;
}

// https://stackoverflow.com/questions/18575722/leaflet-js-set-marker-on-click-update-position-on-drag/18601489#18601489
map.on('click', async function (e) {
    const id = crypto.randomUUID();
    const pin = { id: id, owner: clientid, latlng: e.latlng, show: true, sync: true };
    addPin(pin);
    await localforage.setItem('pin-' + id, pin);
    //todo sync
});

function addPin(pin) {
    const id = pin.id;
    const position = pin.latlng;
    console.log('new', id, 'at', position);
    const icon = pin.owner===clientid ? redIcon : blueIcon;
    const marker = new L.marker(position, { icon: icon, draggable: 'true' });
    marker.pin = pin;

    marker.on('dragend', async function (event) { // clicked and dragged
        var marker = event.target;
        var position = marker.getLatLng();
        marker.pin.latlng = e.latlng;
        await localforage.setItem('pin-' + id, pin);
        //todo sync
        console.log('move', id, 'to', position);
    });

    marker.on('click', async function (event) { // clicked without dragging
        var marker = event.target;
        marker.pin.show = false;
        await localforage.setItem('pin-' + id, pin);
        //todo sync
        map.removeLayer(marker);
        console.log('delete', id);
    });

    map.addLayer(marker);
}

async function loadFromStorage() {
    await localforage.iterate(function (value, key, iterationNumber) {
        if (key.startsWith('pin') && value.show)
            addPin(value);
    });
}

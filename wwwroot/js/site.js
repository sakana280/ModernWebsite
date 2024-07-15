// Storage schemas:
// clientid: this client id, a guid generated if no clientid yet
// pin-{GUID}: a pin object: {id:GUID, owner:GUID, latlng:latlng, updated:<ISO UTC date>, show:true|false, sync:true|false}
// After a pin changes (move/delete) sync=true indicating it needs to be sync'ed to the server
// After a changed pin is sync'ed, set sync=false
// After a pin is deleted, show=false
// Can remove a pin entry after show=false and sync=false

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
    addPin(pin); //todo remove this after sw echos back updates
    window.wb.messageSW({ type: 'UPDATE_PIN', payload: pin });
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
        marker.pin.latlng = position;
        window.wb.messageSW({ type: 'UPDATE_PIN', payload: pin });
        console.log('move', id, 'to', position);
    });

    marker.on('click', async function (event) { // clicked without dragging -> delete
        var marker = event.target;
        marker.pin.show = false;
        window.wb.messageSW({ type: 'UPDATE_PIN', payload: pin });
        map.removeLayer(marker); //todo remove this after sw echos back updates
        console.log('delete', id);
    });

    map.addLayer(marker);
}

async function loadFromSW() {
    const pins = await window.wb.messageSW({ type: 'GET_PINS' });
    pins.map(addPin);
}

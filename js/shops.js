// Finds the nearest Tesco, Dunnes, SuperValu, Aldi and Lidl using OpenStreetMap data (free, no key).
//  - Overpass API: shop locations      https://wiki.openstreetmap.org/wiki/Overpass_API
//  - Nominatim: town / Eircode search   https://nominatim.org (max 1 request a second)
//  - Leaflet + OSM tiles for the map    https://leafletjs.com

import { CHAINS } from './data.js';

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Your location' }),
      () => reject(new Error('Location permission was denied. Search for your town or Eircode instead.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export async function geocode(text) {
  const url = `${NOMINATIM}?format=json&limit=1&countrycodes=ie,gb&q=${encodeURIComponent(text)}`;
  const [hit] = await (await fetch(url)).json();
  if (!hit) throw new Error(`Couldn't find "${text}".`);
  return { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name.split(',').slice(0, 2).join(',') };
}

export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// All chain shops within `radiusKm`, nearest first, each tagged with its chain id.
export async function findShops(pos, radiusKm = 15) {
  // Fetch every supermarket nearby (fast, indexed) and pick out the chains here - regex-matching
  // brand names on the server is slow enough to time out in cities.
  const r = Math.round(radiusKm * 1000);
  const query = `[out:json][timeout:25];
    (nwr["shop"="supermarket"](around:${r},${pos.lat},${pos.lon});
     nwr["shop"="convenience"]["brand"](around:${r},${pos.lat},${pos.lon}););
    out center tags;`;
  const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: query }) });
  if (!res.ok) throw new Error('The shop map service is busy. Try again in a minute.');
  const { elements = [], remark } = await res.json();
  if (!elements.length && remark) throw new Error('The shop map service is busy. Try again in a minute.');
  const seen = new Set();
  const shops = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const t = el.tags || {};
    const chain = CHAINS.find((c) => c.osm.test(t.brand || '') || c.osm.test(t.name || ''));
    if (!chain || lat == null || seen.has(`${el.type}${el.id}`)) continue;
    seen.add(`${el.type}${el.id}`);
    const address = [t['addr:street'], t['addr:city'] || t['addr:town'] || t['addr:suburb']].filter(Boolean).join(', ');
    shops.push({ chain: chain.id, name: t.name || chain.label, address, lat, lon, hours: t.opening_hours || '',
      km: distanceKm(pos, { lat, lon }) });
  }
  return shops.sort((a, b) => a.km - b.km);
}

export const directionsUrl = (s) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;

export const formatKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

// Loads Leaflet from a CDN the first time a map is shown.
let leaflet;
export function loadLeaflet() {
  if (leaflet) return leaflet;
  leaflet = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.onload = () => resolve(window.L);
    js.onerror = () => { leaflet = null; reject(new Error('Could not load the map.')); };
    document.head.append(js);
  });
  return leaflet;
}

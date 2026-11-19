// Builds approximate pilot route lines from OpenStreetMap road data until real ride-along GPX is recorded.
//   node build-routes.mjs        -> writes supabase/routes/<CODE>.geojson and supabase/routes/hubs.geojson
//
// Places are geocoded with Nominatim (1 request per second, per its usage policy), then joined
// into a driving route with the public OSRM demo server. Replace each file with recorded GPX later.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'SakayBohol-route-builder/0.1 (student capstone, development use)';
const OUT = new URL('../../supabase/routes/', import.meta.url);

const DAO = 'Dao Integrated Bus Terminal, Tagbilaran, Bohol, Philippines';
const ROUTES = {
  'TAG-PAN': ['Tagbilaran City, Bohol, Philippines', 'Panglao, Bohol, Philippines'],
  'DAO-NOR': [DAO, 'Tubigon, Bohol, Philippines', 'Talibon, Bohol, Philippines'],
  'DAO-CAR': [DAO, 'Loboc, Bohol, Philippines', 'Bilar, Bohol, Philippines', 'Carmen, Bohol, Philippines'],
  'DAO-UBA': [DAO, 'Jagna, Bohol, Philippines', 'Alicia, Bohol, Philippines', 'Ubay, Bohol, Philippines'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cache = new Map();

async function geocode(q) {
  if (cache.has(q)) return cache.get(q);
  await sleep(1100);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(q)}`;
  const [hit] = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  if (!hit) throw new Error(`Place not found: ${q}`);
  const point = [Number(hit.lon), Number(hit.lat)];
  // Every pilot place is in Bohol; anything outside this box is a wrong match.
  if (point[0] < 123.7 || point[0] > 124.7 || point[1] < 9.4 || point[1] > 10.3) throw new Error(`${q} geocoded outside Bohol: ${point}`);
  cache.set(q, { point, name: hit.display_name });
  return cache.get(q);
}

async function drive(points) {
  const path = points.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`, { headers: { 'User-Agent': UA } });
  const body = await res.json();
  if (body.code !== 'Ok') throw new Error(`OSRM: ${body.code} ${body.message ?? ''}`);
  return body.routes[0];
}

mkdirSync(OUT, { recursive: true });

for (const [code, places] of Object.entries(ROUTES)) {
  const stops = [];
  for (const p of places) stops.push(await geocode(p));
  const route = await drive(stops.map((s) => s.point));
  const feature = {
    type: 'Feature',
    properties: { code, source: 'OpenStreetMap via OSRM (approximate)', via: places, length_km: +(route.distance / 1000).toFixed(1) },
    geometry: route.geometry,
  };
  writeFileSync(new URL(`${code}.geojson`, OUT), JSON.stringify(feature));
  console.log(`${code}: ${feature.properties.length_km} km, ${route.geometry.coordinates.length} points`);
}

const dao = await geocode(DAO);
writeFileSync(new URL('hubs.geojson', OUT), JSON.stringify({ type: 'Feature', properties: { name: 'Dao Integrated Bus Terminal', matched: dao.name }, geometry: { type: 'Point', coordinates: dao.point } }));
console.log(`Dao hub: ${dao.point.join(', ')}  (${dao.name})`);

// Geocodes the towns along the pilot routes (OpenStreetMap Nominatim, 1 request per second)
// and prints SQL that fills public.places, the destination list of the trip planner.
//   node build-places.mjs > places.sql
const UA = 'SakayBohol-route-builder/0.1 (student capstone, development use)';
const TOWNS = [
  'Tagbilaran City', 'Dauis', 'Panglao', 'Baclayon', 'Loay', 'Loboc', 'Bilar', 'Batuan', 'Carmen',
  'Lila', 'Dimiao', 'Valencia', 'Garcia Hernandez', 'Jagna', 'Duero', 'Guindulman', 'Pilar', 'Alicia', 'Ubay',
  'Cortes', 'Antequera', 'Catigbian', 'San Isidro', 'Tubigon', 'Clarin', 'Inabanga', 'Buenavista', 'Getafe', 'Talibon',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
for (const town of TOWNS) {
  await sleep(1100);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ph&q=${encodeURIComponent(`${town}, Bohol, Philippines`)}`;
  const [hit] = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  if (!hit) { console.error(`not found: ${town}`); continue; }
  const lng = Number(hit.lon), lat = Number(hit.lat);
  if (lng < 123.7 || lng > 124.7 || lat < 9.4 || lat > 10.3) { console.error(`outside Bohol: ${town}`); continue; }
  rows.push(`('${town.replace("'", "''")}', 'SRID=4326;POINT(${lng} ${lat})')`);
}
console.log(`insert into public.places (name, geom) values\n  ${rows.join(',\n  ')}\non conflict (name) do update set geom = excluded.geom;`);

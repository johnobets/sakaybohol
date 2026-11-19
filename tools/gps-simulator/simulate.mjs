// Replays a recorded route (GeoJSON LineString) as a moving vehicle on the route:<route_id> Realtime channel,
// so features can be built and demoed without a real bus.
//
//   node simulate.mjs --selftest
//   node simulate.mjs route.geojson            (needs .env, see .env.example)
//
// ponytail: constant speed along the line; replay recorded timestamps if realism matters for ETA tests.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const R = 6371000; // earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

// Great-circle distance in metres between [lng, lat] points.
export function haversine([lng1, lat1], [lng2, lat2]) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Point at `dist` metres along the line, linear between vertices. Clamps to the ends.
export function pointAt(coords, dist) {
  if (dist <= 0) return coords[0];
  for (let i = 1; i < coords.length; i++) {
    const seg = haversine(coords[i - 1], coords[i]);
    if (dist <= seg) {
      const t = seg === 0 ? 0 : dist / seg;
      return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])];
    }
    dist -= seg;
  }
  return coords[coords.length - 1];
}

export function lineLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversine(coords[i - 1], coords[i]);
  return total;
}

function selftest() {
  const line = [[123.85, 9.65], [123.86, 9.65], [123.86, 9.66]];
  const seg1 = haversine(line[0], line[1]);
  assert.ok(Math.abs(seg1 - 1097) < 5, `0.01° of longitude at 9.65°N is about 1.1 km, got ${seg1}`);
  assert.deepEqual(pointAt(line, -5), line[0]);
  assert.deepEqual(pointAt(line, 1e9), line[2]);
  const mid = pointAt(line, seg1 / 2);
  assert.ok(Math.abs(mid[0] - 123.855) < 1e-9 && mid[1] === 9.65, 'halfway along the first segment');
  const corner = pointAt(line, seg1);
  assert.ok(Math.abs(corner[0] - 123.86) < 1e-9, 'end of first segment is the corner');
  assert.ok(Math.abs(lineLength(line) - (seg1 + haversine(line[1], line[2]))) < 1e-6);
  console.log('selftest ok');
}

async function run(file) {
  const { createClient } = await import('@supabase/supabase-js');
  const env = Object.fromEntries(
    readFileSync(new URL('./.env', import.meta.url), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  const geo = JSON.parse(readFileSync(file, 'utf8'));
  const coords = (geo.type === 'FeatureCollection' ? geo.features[0].geometry : geo.geometry ?? geo).coordinates;
  const speedKmh = Number(env.SPEED_KMH || 30);
  const stepS = Number(env.STEP_SECONDS || 5);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email: env.CREW_EMAIL, password: env.CREW_PASSWORD });
  if (error) throw error;
  await supabase.realtime.setAuth();

  const channel = supabase.channel(`route:${env.ROUTE_ID}`, { config: { private: true } });
  await new Promise((ok, fail) => channel.subscribe((s) => (s === 'SUBSCRIBED' ? ok() : s === 'CHANNEL_ERROR' && fail(new Error(s)))));

  const total = lineLength(coords);
  console.log(`replaying ${(total / 1000).toFixed(1)} km at ${speedKmh} km/h`);
  for (let d = 0; d <= total; d += (speedKmh / 3.6) * stepS) {
    const [lng, lat] = pointAt(coords, d);
    await channel.send({
      type: 'broadcast',
      event: 'position',
      payload: { trip_id: env.TRIP_ID, lat, lng, speed_kmh: speedKmh, seat_status: 'available', ts: new Date().toISOString() },
    });
    console.log(`${(d / 1000).toFixed(2)} km  ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    await new Promise((r) => setTimeout(r, stepS * 1000));
  }
  await supabase.removeChannel(channel);
}

const arg = process.argv[2];
if (arg === '--selftest') selftest();
else if (arg) await run(arg);
else console.log('usage: node simulate.mjs --selftest | node simulate.mjs <route.geojson>');

// Plays a van driving a pilot route, as the test crew account, so commuter maps show it live.
//
//   node simulate.mjs --selftest
//   node simulate.mjs TAG-PAN              (outbound, 30 km/h)
//   node simulate.mjs DAO-CAR --inbound --speed 45
//
// Needs .env (see .env.example). It starts a trip on the crew's assigned vehicle, broadcasts a position
// every STEP_SECONDS, saves one every 30 s like the crew app, and ends the trip at the end or on Ctrl+C.
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

const seatStatus = (capacity, taken) => (capacity - taken <= 0 ? 'full' : capacity - taken <= 3 ? 'almost_full' : 'available');
const ewkt = ([lng, lat]) => `SRID=4326;POINT(${lng} ${lat})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(code, { inbound, speedKmh }) {
  const { createClient } = await import('@supabase/supabase-js');
  const env = Object.fromEntries(
    readFileSync(new URL('./.env', import.meta.url), 'utf8')
      .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/=(.*)/s).slice(0, 2)),
  );
  const stepS = Number(env.STEP_SECONDS || 5);
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.CREW_EMAIL, password: env.CREW_PASSWORD });
  if (authErr) throw new Error(`Crew sign-in failed: ${authErr.message}`);
  const crewId = auth.user.id;

  const { data: vehicle, error: vErr } = await sb.from('vehicles').select('id, plate_no, type, capacity').eq('assigned_crew_id', crewId).eq('active', true).single();
  if (vErr) throw new Error('No vehicle is assigned to the crew account.');
  const { data: route, error: rErr } = await sb.from('route_lines').select('id, name, geojson').eq('code', code).single();
  if (rErr) throw new Error(`Route ${code} not found or not active.`);
  const direction = inbound ? 'inbound' : 'outbound';
  const coords = inbound ? [...route.geojson.coordinates].reverse() : route.geojson.coordinates;

  const { data: trip, error: tErr } = await sb.from('trips').insert({ route_id: route.id, vehicle_id: vehicle.id, crew_id: crewId, direction }).select('id').single();
  if (tErr) throw new Error(tErr.code === '23505' ? `${vehicle.plate_no} already has an active trip. End it in the crew app first.` : tErr.message);

  await sb.realtime.setAuth();
  const channel = sb.channel(`route:${route.id}`, { config: { private: true } });
  await new Promise((ok, fail) => channel.subscribe((s) => (s === 'SUBSCRIBED' ? ok() : s === 'CHANNEL_ERROR' && fail(new Error('Realtime channel error')))));

  let seatsTaken = 0;
  let ended = false;
  async function end() {
    if (ended) return;
    ended = true;
    await channel.send({ type: 'broadcast', event: 'trip_ended', payload: { trip_id: trip.id } });
    await sb.from('trips').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', trip.id);
    await sb.removeChannel(channel);
    console.log('trip ended');
  }
  process.on('SIGINT', () => end().then(() => process.exit(0)));

  const total = lineLength(coords);
  console.log(`${vehicle.plate_no} on ${route.name} (${direction}), ${(total / 1000).toFixed(1)} km at ${speedKmh} km/h. Ctrl+C to stop.`);
  let lastSaved = 0;
  for (let d = 0, step = 0; d <= total + 1; d += (speedKmh / 3.6) * stepS, step++) {
    const point = pointAt(coords, d);
    if (step > 0 && step % 6 === 0) seatsTaken = Math.min(Math.max(seatsTaken + [-1, 0, 1, 2][Math.floor(Math.random() * 4)], 0), vehicle.capacity);
    const status = seatStatus(vehicle.capacity, seatsTaken);
    const ts = new Date().toISOString();
    await channel.send({
      type: 'broadcast',
      event: 'position',
      payload: {
        trip_id: trip.id, route_id: route.id, lat: point[1], lng: point[0], speed_kmh: speedKmh, heading: null,
        seats_left: vehicle.capacity - seatsTaken, seat_status: status, plate_no: vehicle.plate_no, vehicle_type: vehicle.type, direction, ts,
      },
    });
    if (Date.now() - lastSaved >= 30_000) {
      lastSaved = Date.now();
      await Promise.all([
        sb.from('positions').insert({ trip_id: trip.id, geom: ewkt(point), speed_kmh: speedKmh, recorded_at: ts }),
        sb.from('trips').update({ last_geom: ewkt(point), last_speed_kmh: speedKmh, last_seen_at: ts, seats_taken: seatsTaken, seat_status: status }).eq('id', trip.id),
      ]);
    }
    console.log(`${(d / 1000).toFixed(2)} km  ${point[1].toFixed(5)}, ${point[0].toFixed(5)}  seats left ${vehicle.capacity - seatsTaken}`);
    await sleep(stepS * 1000);
  }
  await end();
}

const args = process.argv.slice(2);
if (args[0] === '--selftest') selftest();
else if (args[0] && !args[0].startsWith('--')) {
  const i = args.indexOf('--speed');
  await run(args[0], { inbound: args.includes('--inbound'), speedKmh: i >= 0 ? Number(args[i + 1]) : 30 }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else console.log('usage: node simulate.mjs --selftest | node simulate.mjs <ROUTE-CODE> [--inbound] [--speed 30]');

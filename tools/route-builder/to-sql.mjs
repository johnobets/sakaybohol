// Turns supabase/routes/*.geojson into SQL that sets each route's line (simplified to about 5 m) and the Dao hub.
//   node to-sql.mjs > routes.sql    then run routes.sql in the Supabase SQL editor.
// The same files can later come from recorded GPX (convert GPX to GeoJSON first, e.g. with geojson.io).
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../../supabase/routes/', import.meta.url);
const TOL = 0.00005; // degrees, about 5 m

function perp([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  return len === 0 ? Math.hypot(x - x1, y - y1) : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
}
// Douglas-Peucker: drop points that sit within TOL of the straight line between their neighbours.
function simplify(pts) {
  if (pts.length < 3) return pts;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = perp(pts[i], pts[0], pts.at(-1)); if (d > max) { max = d; idx = i; } }
  if (max <= TOL) return [pts[0], pts.at(-1)];
  return [...simplify(pts.slice(0, idx + 1)).slice(0, -1), ...simplify(pts.slice(idx))];
}

const geog = (geometry) => `extensions.st_geomfromgeojson('${JSON.stringify(geometry)}')::extensions.geography`;

for (const f of readdirSync(DIR).filter((n) => n.endsWith('.geojson') && n !== 'hubs.geojson')) {
  const feat = JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
  const coordinates = simplify(feat.geometry.coordinates).map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)]);
  console.log(`update public.routes set geom = ${geog({ type: 'LineString', coordinates })}, active = true where code = '${feat.properties.code}';`);
}
const hub = JSON.parse(readFileSync(new URL('hubs.geojson', DIR), 'utf8'));
console.log(`update public.hubs set geom = ${geog(hub.geometry)} where name = '${hub.properties.name}';`);

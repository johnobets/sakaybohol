// Self-check for the last-trip warning. Run: node src/lib/routes.test.mjs
// lastTripInfo has no imports, so it is copied here by reading the source and stripping types.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./routes.ts', import.meta.url), 'utf8');
const start = src.indexOf('export function lastTripInfo');
const body = src.slice(start, src.indexOf('export', start + 1));
const js = body
  .replace('export function', 'function')
  .replace(/\(lastTrip: string \| null, now = new Date\(\)\): \{[^)]*\} \{/, '(lastTrip, now = new Date()) {')
  .replace(/^\/\/.*$/gm, '');
const lastTripInfo = new Function(`${js}; return lastTripInfo;`)();

const at = (h, m) => new Date(2026, 10, 24, h, m);
assert.equal(lastTripInfo(null).state, 'none');
assert.equal(lastTripInfo('19:30:00', at(17, 0)).state, 'ok');
assert.equal(lastTripInfo('19:30:00', at(18, 45)).state, 'soon');
assert.equal(lastTripInfo('19:30:00', at(18, 45)).n, 45);
assert.equal(lastTripInfo('19:30:00', at(18, 45)).label, 'Last trip {time}, in {n} min');
assert.equal(lastTripInfo('19:30:00', at(19, 31)).state, 'over');
console.log('last trip ok');

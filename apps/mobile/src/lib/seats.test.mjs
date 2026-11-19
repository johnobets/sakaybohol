// Self-check for the seat rules. Run: node src/lib/seats.test.mjs  (Node 22.18+ strips the TypeScript types)
import assert from 'node:assert/strict';
import { clampSeats, seatStatus } from './seats.ts';

assert.equal(clampSeats(14, -1), 0);
assert.equal(clampSeats(14, 15), 14);
assert.equal(clampSeats(14, 7), 7);

assert.equal(seatStatus(14, 0), 'available');
assert.equal(seatStatus(14, 10), 'available'); // 4 left
assert.equal(seatStatus(14, 11), 'almost_full'); // 3 left
assert.equal(seatStatus(14, 13), 'almost_full'); // 1 left
assert.equal(seatStatus(14, 14), 'full');
assert.equal(seatStatus(50, 47), 'almost_full');

console.log('seats ok');

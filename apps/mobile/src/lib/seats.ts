// Seat rules from the spec: Full at capacity, Almost full at 3 or fewer seats left.
export type SeatStatus = 'available' | 'almost_full' | 'full';

export function clampSeats(capacity: number, taken: number): number {
  return Math.min(Math.max(taken, 0), capacity);
}

export function seatStatus(capacity: number, taken: number): SeatStatus {
  const left = capacity - taken;
  if (left <= 0) return 'full';
  if (left <= 3) return 'almost_full';
  return 'available';
}

export const SEAT_LABEL: Record<SeatStatus, string> = {
  available: 'Seats available',
  almost_full: 'Almost full',
  full: 'Full',
};

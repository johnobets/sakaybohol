// Shared shape of a live vehicle update on the Realtime channel "route:<route_id>".
// The crew app sends it; commuter maps and the GPS simulator use the same fields.
export type LivePosition = {
  trip_id: string;
  route_id: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  heading: number | null;
  seats_left: number;
  seat_status: string;
  plate_no: string;
  vehicle_type: string;
  direction: 'outbound' | 'inbound';
  ts: string;
};

export const POSITION_EVENT = 'position';
export const ENDED_EVENT = 'trip_ended';
export const routeTopic = (routeId: string) => `route:${routeId}`;

// Geography columns accept EWKT text through the API.
export const toEwkt = (lat: number, lng: number) => `SRID=4326;POINT(${lng} ${lat})`;

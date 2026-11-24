import { supabase } from '@/lib/supabase';

export type LatLng = { latitude: number; longitude: number };
export type RouteLine = { id: string; code: string; name: string; lengthKm: number; color: string; coords: LatLng[]; lastTrip: string | null };
export type Hub = { name: string; coord: LatLng };

// One fixed colour per pilot route; new routes fall back to grey until given one.
const ROUTE_COLORS: Record<string, string> = {
  'TAG-PAN': '#E07A1F',
  'DAO-NOR': '#2E8B57',
  'DAO-CAR': '#2B7BB9',
  'DAO-UBA': '#8E44AD',
};

// GeoJSON is [longitude, latitude]; react-native-maps wants { latitude, longitude }.
const toLatLng = ([longitude, latitude]: number[]): LatLng => ({ latitude, longitude });

export async function fetchRouteLines(): Promise<RouteLine[]> {
  const { data, error } = await supabase.from('route_lines').select('id, code, name, length_km, geojson, last_trip_time').order('code');
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    lengthKm: Number(r.length_km),
    color: ROUTE_COLORS[r.code] ?? '#6B7280',
    coords: r.geojson.coordinates.map(toLatLng),
    lastTrip: r.last_trip_time,
  }));
}

// Last-trip warning: "19:30:00" -> label and how close it is (now passed in for the self-check).
export function lastTripInfo(lastTrip: string | null, now = new Date()): { label: string; state: 'none' | 'ok' | 'soon' | 'over' } {
  if (!lastTrip) return { label: '', state: 'none' };
  const [h, m] = lastTrip.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  const minsLeft = (at.getTime() - now.getTime()) / 60_000;
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (minsLeft < 0) return { label: 'No more trips today', state: 'over' };
  if (minsLeft <= 60) return { label: `Last trip ${time}, in ${Math.round(minsLeft)} min`, state: 'soon' };
  return { label: `Last trip ${time}`, state: 'ok' };
}

export async function fetchHubs(): Promise<Hub[]> {
  const { data, error } = await supabase.from('hub_points').select('name, geojson');
  if (error) throw error;
  return data.map((h) => ({ name: h.name, coord: toLatLng(h.geojson.coordinates) }));
}

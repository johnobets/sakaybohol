import { supabase } from '@/lib/supabase';

export type LatLng = { latitude: number; longitude: number };
export type RouteLine = { id: string; code: string; name: string; lengthKm: number; color: string; coords: LatLng[] };
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
  const { data, error } = await supabase.from('route_lines').select('id, code, name, length_km, geojson').order('code');
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    lengthKm: Number(r.length_km),
    color: ROUTE_COLORS[r.code] ?? '#6B7280',
    coords: r.geojson.coordinates.map(toLatLng),
  }));
}

export async function fetchHubs(): Promise<Hub[]> {
  const { data, error } = await supabase.from('hub_points').select('name, geojson');
  if (error) throw error;
  return data.map((h) => ({ name: h.name, coord: toLatLng(h.geojson.coordinates) }));
}

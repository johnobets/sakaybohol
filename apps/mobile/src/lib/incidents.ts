import type { LatLng } from '@/lib/routes';
import { supabase } from '@/lib/supabase';

export type IncidentType = 'flood' | 'landslide' | 'accident' | 'roadwork' | 'other';
export type Incident = { id: string; type: IncidentType; description: string | null; photoUrl: string | null; coord: LatLng; createdAt: string };

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  flood: 'Flood',
  landslide: 'Landslide',
  accident: 'Accident',
  roadwork: 'Road work',
  other: 'Other hazard',
};

export const INCIDENT_COLOR: Record<IncidentType, string> = {
  flood: '#2B7BB9',
  landslide: '#8B5A2B',
  accident: '#C0392B',
  roadwork: '#E07A1F',
  other: '#6B7280',
};

export const photoUrl = (path: string | null) =>
  path ? supabase.storage.from('incident-photos').getPublicUrl(path).data.publicUrl : null;

// Approved, unexpired hazards (RLS filters for logged-out users; the status filter hides a reporter's own pending ones).
export async function fetchIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incident_points')
    .select('id, type, description, photo_path, created_at, geojson')
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString());
  if (error) throw error;
  return data.map((i) => ({
    id: i.id,
    type: i.type,
    description: i.description,
    photoUrl: photoUrl(i.photo_path),
    coord: { latitude: i.geojson.coordinates[1], longitude: i.geojson.coordinates[0] },
    createdAt: i.created_at,
  }));
}

import { useEffect, useState } from 'react';

import type { LatLng } from '@/lib/routes';
import { supabase } from '@/lib/supabase';

export type Arrival = {
  tripId: string;
  routeId: string;
  plateNo: string;
  vehicleType: string;
  towards: string; // where the van is heading
  seatsLeft: number;
  seatStatus: string;
  walkM: number; // from the spot to the nearest point on the route
  distanceM: number; // along the route, van to pickup point
  etaMin: number;
  pickup: LatLng;
};

const REFRESH_MS = 15_000;

// Vans coming toward `spot` (within 1 km of a route), nearest first, refreshed every 15 s.
export function useArrivals(spot: LatLng | null) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [error, setError] = useState(false);
  const lat = spot?.latitude;
  const lng = spot?.longitude;

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase.rpc('arrivals_near', { p_lat: lat, p_lng: lng });
      if (cancelled) return;
      setError(!!error);
      if (error || !data) return;
      setArrivals(
        data.map((a: any) => ({
          tripId: a.trip_id,
          routeId: a.route_id,
          plateNo: a.plate_no,
          vehicleType: a.vehicle_type,
          towards: a.direction === 'outbound' ? a.destination : a.origin,
          seatsLeft: a.seats_left,
          seatStatus: a.seat_status,
          walkM: Number(a.walk_m),
          distanceM: Number(a.distance_m),
          etaMin: Number(a.eta_min),
          pickup: { latitude: a.pickup.coordinates[1], longitude: a.pickup.coordinates[0] },
        })),
      );
    }

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lat, lng]);

  return { arrivals, error };
}

export function formatEta(etaMin: number, now = new Date()): string {
  if (etaMin < 1) return 'Arriving now';
  const at = new Date(now.getTime() + etaMin * 60_000);
  return `~${Math.round(etaMin)} min · ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

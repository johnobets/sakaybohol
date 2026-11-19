import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { ENDED_EVENT, POSITION_EVENT, routeTopic, type LivePosition } from '@/lib/live';
import { supabase } from '@/lib/supabase';

const STALE_MS = 5 * 60_000; // no update for 5 minutes: drop the van from the map

// Live vans on the given routes: last known positions from the database first, then Realtime updates.
export function useLiveVehicles(routeIds: string[]) {
  const [vehicles, setVehicles] = useState<Record<string, LivePosition>>({});
  const key = routeIds.join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',');
    let cancelled = false;

    const upsert = (p: LivePosition) => setVehicles((v) => ({ ...v, [p.trip_id]: p }));
    const remove = (tripId: string) =>
      setVehicles((v) => {
        const { [tripId]: _gone, ...rest } = v;
        return rest;
      });

    async function loadLastKnown() {
      const { data } = await supabase
        .from('live_trips')
        .select('trip_id, route_id, direction, seat_status, seats_left, plate_no, vehicle_type, geojson, last_speed_kmh, last_seen_at')
        .in('route_id', ids);
      if (cancelled || !data) return;
      setVehicles((current) => {
        const next: Record<string, LivePosition> = {};
        for (const t of data) {
          const [lng, lat] = t.geojson.coordinates;
          const known = current[t.trip_id];
          // Keep the fresher Realtime position if we already have one.
          next[t.trip_id] =
            known && Date.parse(known.ts) > Date.parse(t.last_seen_at)
              ? known
              : {
                  trip_id: t.trip_id,
                  route_id: t.route_id,
                  lat,
                  lng,
                  speed_kmh: t.last_speed_kmh,
                  heading: null,
                  seats_left: t.seats_left,
                  seat_status: t.seat_status,
                  plate_no: t.plate_no,
                  vehicle_type: t.vehicle_type,
                  direction: t.direction,
                  ts: t.last_seen_at,
                };
        }
        // Vans that only exist on Realtime so far (trip saved less than 30 s ago) stay too.
        for (const [id, p] of Object.entries(current)) if (!next[id] && Date.now() - Date.parse(p.ts) < STALE_MS) next[id] = p;
        return next;
      });
    }

    const channels: RealtimeChannel[] = ids.map((id) =>
      supabase
        .channel(routeTopic(id), { config: { private: true } })
        .on('broadcast', { event: POSITION_EVENT }, ({ payload }) => upsert(payload as LivePosition))
        .on('broadcast', { event: ENDED_EVENT }, ({ payload }) => remove((payload as { trip_id: string }).trip_id))
        .subscribe(),
    );

    loadLastKnown();
    const refresh = setInterval(() => {
      loadLastKnown();
      setVehicles((v) => Object.fromEntries(Object.entries(v).filter(([, p]) => Date.now() - Date.parse(p.ts) < STALE_MS)));
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(refresh);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [key]);

  return Object.values(vehicles);
}

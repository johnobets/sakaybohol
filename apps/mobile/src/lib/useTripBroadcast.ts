import * as Location from 'expo-location';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { ENDED_EVENT, POSITION_EVENT, routeTopic, toEwkt, type LivePosition } from '@/lib/live';
import { supabase } from '@/lib/supabase';

export type GpsStatus = 'off' | 'starting' | 'live' | 'denied' | 'error';

type TripInfo = {
  tripId: string;
  routeId: string;
  direction: 'outbound' | 'inbound';
  plateNo: string;
  vehicleType: string;
  seatsLeft: number;
  seatStatus: string;
};

const SAVE_EVERY_MS = 30_000; // history point + trip's last position, per the spec

// While a trip is active and the app is open: watch GPS, broadcast every fix to the route's channel,
// and save a point to the database every 30 s. Background GPS needs a development build (Sprint 3, part 2).
export function useTripBroadcast(trip: TripInfo | null) {
  const [status, setStatus] = useState<GpsStatus>('off');
  const [lastFixAt, setLastFixAt] = useState<Date | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastPosRef = useRef<LivePosition | null>(null);
  const tripRef = useRef(trip);
  tripRef.current = trip;

  const tripId = trip?.tripId;
  const routeId = trip?.routeId;

  useEffect(() => {
    if (!tripId || !routeId) return;
    let watch: Location.LocationSubscription | null = null;
    let lastSaved = 0;
    let cancelled = false;
    setStatus('starting');

    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setStatus('denied');
        return;
      }
      await supabase.realtime.setAuth();
      const channel = supabase.channel(routeTopic(routeId), { config: { private: true } });
      channel.subscribe();
      channelRef.current = channel;

      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        async (loc) => {
          const t = tripRef.current;
          if (!t) return;
          const { latitude: lat, longitude: lng, speed, heading } = loc.coords;
          const speedKmh = speed != null && speed >= 0 ? +(speed * 3.6).toFixed(1) : null;
          const payload: LivePosition = {
            trip_id: t.tripId,
            route_id: t.routeId,
            lat,
            lng,
            speed_kmh: speedKmh,
            heading: heading != null && heading >= 0 ? heading : null,
            seats_left: t.seatsLeft,
            seat_status: t.seatStatus,
            plate_no: t.plateNo,
            vehicle_type: t.vehicleType,
            direction: t.direction,
            ts: new Date(loc.timestamp).toISOString(),
          };
          lastPosRef.current = payload;
          channel.send({ type: 'broadcast', event: POSITION_EVENT, payload });
          setStatus('live');
          setLastFixAt(new Date());

          if (Date.now() - lastSaved >= SAVE_EVERY_MS) {
            lastSaved = Date.now();
            const point = toEwkt(lat, lng);
            await Promise.all([
              supabase.from('positions').insert({ trip_id: t.tripId, geom: point, speed_kmh: speedKmh, heading: payload.heading, recorded_at: payload.ts }),
              supabase.from('trips').update({ last_geom: point, last_speed_kmh: speedKmh, last_seen_at: payload.ts }).eq('id', t.tripId),
            ]);
          }
        },
      );
      if (cancelled) watch.remove();
    })().catch(() => setStatus('error'));

    return () => {
      cancelled = true;
      watch?.remove();
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setStatus('off');
    };
  }, [tripId, routeId]);

  // Seat changes go out right away instead of waiting for the next GPS fix.
  const seatsLeft = trip?.seatsLeft;
  const seatStatus = trip?.seatStatus;
  useEffect(() => {
    const last = lastPosRef.current;
    if (!channelRef.current || !last || seatsLeft == null || seatStatus == null) return;
    const payload = { ...last, seats_left: seatsLeft, seat_status: seatStatus, ts: new Date().toISOString() };
    lastPosRef.current = payload;
    channelRef.current.send({ type: 'broadcast', event: POSITION_EVENT, payload });
  }, [seatsLeft, seatStatus]);

  // Called by End trip so commuter maps drop the van at once.
  function announceEnded() {
    const t = tripRef.current;
    if (channelRef.current && t) channelRef.current.send({ type: 'broadcast', event: ENDED_EVENT, payload: { trip_id: t.tripId } });
  }

  return { status, lastFixAt, announceEnded };
}

# SakayBohol

Real-time bus and van tracking, arrival estimates and traffic-aware routing for the Province of Bohol.
The full design lives in the **SakayBohol Final System Specification** doc.

```
apps/mobile/          Expo app: commuter mode and crew mode
apps/admin/           Vite + React dashboard for the traffic office and Dao terminal
supabase/migrations/  Database schema and Row Level Security
supabase/seed.sql     Pilot routes and the Dao hub
tools/gps-simulator/  Replays a recorded route as a live vehicle
logo/                 App icon and horizontal logo
```

## First-time setup

1. **Supabase project.** Create one at supabase.com. In the SQL editor, run
   `supabase/migrations/20261119000000_init.sql`, then `supabase/seed.sql`.
   (With the Supabase CLI installed: `supabase link` then `supabase db push`.)
2. **Keys.** In each of `apps/mobile`, `apps/admin` and `tools/gps-simulator`, copy `.env.example` to `.env`
   and fill in the project URL and anon key from Project Settings > API. Never commit `.env`.
3. **Install.** Run `npm install` in each of the three folders.

## Run

| What | Command (from its folder) |
| --- | --- |
| Mobile app in Expo Go | `npx expo start`, then scan the QR code |
| Admin dashboard | `npm run dev`, then open the printed localhost link |
| Simulator self-check | `npm test` |
| Simulate a bus | `node simulate.mjs path/to/route.geojson` |

Background GPS and Android push need an EAS development build: `npx eas-cli@latest build --profile development --platform android`.

## Status

Sprint 2 foundation: schema, security rules, seed, app shells and the simulator.
Next (Sprint 3): crew sign-in, Start trip with background GPS, and live vehicles on the commuter map.

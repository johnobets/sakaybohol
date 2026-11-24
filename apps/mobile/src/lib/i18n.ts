import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// English / Bisaya. English text is the key, so a missing translation just shows English.
export type Lang = 'en' | 'bis';
type Vars = Record<string, string | number>;

// ponytail: one flat dictionary for the commuter screens; move to per-screen files if it passes a few hundred lines.
const BIS: Record<string, string> = {
  // home
  'Coming to you': 'Padulong nimo',
  'From the spot you picked. ': 'Gikan sa lugar nga imong gipili. ',
  'From your location. ': 'Gikan sa imong nahimutangan. ',
  'Long-press the map to pick another spot.': 'Pugngi ang mapa aron mopili og laing lugar.',
  'Could not load routes. Check your connection.': 'Dili ma-load ang mga ruta. Susiha ang imong koneksyon.',
  'Could not load arrival times. Check your connection.': 'Dili ma-load ang oras sa pag-abot. Susiha ang imong koneksyon.',
  'Location is off. Allow it, or long-press the map to pick a spot.': 'Naka-off ang location. I-allow, o pugngi ang mapa aron mopili og lugar.',
  'Use my location instead': 'Gamita na lang ang akong location',
  'No vans coming within 1 km of this spot right now.': 'Walay van nga moabot sulod sa 1 km niining lugara karon.',
  'Arriving now': 'Moabot na karon',
  '{n} seats left': '{n} ka bakanteng lingkoranan',
  '{km} km away': '{km} km ang gilay-on',
  'walk {m} m to the road': 'lakaw {m} m padulong sa dalan',
  "I'm waiting": 'Naghulat ko',
  "It's full": 'Puno na',
  'Alert me': 'Pahibaloa ko',
  'Alert at {n} min ✓': 'Pahibalo sa {n} min ✓',
  'Already reported': 'Na-report na',
  'Not sent, try again': 'Wala na-send, sulayi pag-usab',
  'Driver can see you are waiting': 'Makita sa drayber nga naghulat ka',
  'Thanks, full report sent': 'Salamat, na-send ang report nga puno',
  'Your ride is near': 'Hapit na ang imong sakyanan',
  '{vehicle} {plate} to {towards} passes you in about {n} min. {seats} seats left.':
    '{vehicle} {plate} padulong {towards} moagi nimo sa mga {n} min. {seats} ka bakanteng lingkoranan.',
  Routes: 'Mga ruta',
  '{n} live · ': '{n} nagbiyahe · ',
  'Last trip {time}': 'Katapusang biyahe {time}',
  'Last trip {time}, in {n} min': 'Katapusang biyahe {time}, sa {n} min',
  'No more trips today': 'Wala nay biyahe karong adlawa',
  'Plan a trip from here': 'Planoha ang biyahe gikan diri',
  'Tricycle fare': 'Plete sa traysikol',
  'Report a hazard': 'I-report ang peligro',
  'Driver or conductor': 'Drayber o konduktor',
  'Your spot': 'Imong lugar',
  'Wait here': 'Hulat diri',
  'Nearest point on the route': 'Pinakaduol nga bahin sa ruta',
  'Reported by a commuter': 'Gi-report sa usa ka pasahero',
  'Seats available': 'Naay bakante',
  'Almost full': 'Hapit na mapuno',
  Full: 'Puno na',
  Flood: 'Baha',
  Landslide: 'Pagdahili sa yuta',
  Accident: 'Aksidente',
  'Road work': 'Ginatrabaho ang dalan',
  'Other hazard': 'Laing peligro',
  // fare
  'Pick where you start first: allow location, or long-press the home map.': 'Pili una kung asa ka magsugod: i-allow ang location, o pugngi ang mapa sa home.',
  'Tap the map where you are going.': 'Pinduta ang mapa kung asa ka padulong.',
  From: 'Gikan',
  To: 'Padulong',
  'About {km} km by road': 'Mga {km} km sa dalan',
  '₱{base} for the first {km} km, then ₱{per} per km. Fare set by the city; ask the driver before you ride.':
    '₱{base} sa unang {km} km, dayon ₱{per} matag km. Plete nga gitakda sa siyudad; pangutan-a ang drayber sa dili pa ka mosakay.',
  'Charged more? Report it': 'Gisobrahan ka? I-report',
  'Amount you paid (₱)': 'Kantidad nga imong gibayad (₱)',
  'Tricycle body number (optional)': 'Body number sa traysikol (opsyonal)',
  'That is within the fare.': 'Sakto ra kana sa plete.',
  'Report overcharge': 'I-report ang sobra nga singil',
  'Sign in to report an overcharge': 'Mag-sign in aron maka-report sa sobra nga singil',
  'Could not get the fare. Check your connection.': 'Dili makuha ang plete. Susiha ang imong koneksyon.',
  'Could not send. Try again.': 'Wala na-send. Sulayi pag-usab.',
  'Report sent to the traffic office. Thank you.': 'Na-send ang report sa traffic office. Salamat.',
  // report
  'Pick a spot first: allow location, or long-press the map where the hazard is.': 'Pili una og lugar: i-allow ang location, o pugngi ang mapa diin ang peligro.',
  'Sign in so the traffic office can follow up on your report.': 'Mag-sign in aron masubay sa traffic office ang imong report.',
  'Thank you': 'Salamat',
  'Your report was sent. It appears on the map once the traffic office approves it.': 'Na-send ang imong report. Mogawas kini sa mapa kung aprobahan na sa traffic office.',
  'Back to the map': 'Balik sa mapa',
  'At {lat}, {lng}. To report another spot, go back and long-press the map.': 'Sa {lat}, {lng}. Aron mo-report og laing lugar, balik ug pugngi ang mapa.',
  'What is it?': 'Unsa kini?',
  'Details (optional)': 'Detalye (opsyonal)',
  'e.g. Knee-deep flood, vans turning back': 'pananglitan: Hantod tuhod ang baha, nagbalik ang mga van',
  'Photo (optional)': 'Litrato (opsyonal)',
  'Take photo': 'Pag-picture',
  'Choose photo': 'Pili og litrato',
  'Send report': 'I-send ang report',
  'Sending…': 'Gipadala…',
  'Camera permission is off.': 'Naka-off ang permiso sa camera.',
  'Photo permission is off.': 'Naka-off ang permiso sa litrato.',
  'Photo upload failed. Try again, or send without a photo.': 'Napakyas ang pag-upload sa litrato. Sulayi pag-usab, o i-send nga walay litrato.',
  'Could not send the report. Check your connection.': 'Wala na-send ang report. Susiha ang imong koneksyon.',
  // account and titles
  'Signed in': 'Naka-sign in',
  'Sign out': 'Mag-sign out',
  'An account lets you tell drivers you are waiting, report full vans and road hazards.':
    'Sa akawnt, mapahibalo nimo ang drayber nga naghulat ka, ug maka-report sa punong van ug peligro sa dalan.',
  'Crew mode': 'Para sa crew',
  'Plan a trip': 'Planoha ang biyahe',
  Account: 'Akawnt',
};

let lang: Lang = 'en';
const listeners = new Set<() => void>();
const KEY = 'sakaybohol.lang';

export function setLang(next: Lang) {
  lang = next;
  AsyncStorage.setItem(KEY, next).catch(() => {});
  listeners.forEach((l) => l());
}

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === 'bis') setLang('bis');
  })
  .catch(() => {});

export function translate(l: Lang, en: string, vars?: Vars): string {
  let s = l === 'bis' ? (BIS[en] ?? en) : en;
  for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
  return s;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// Screens call this so they re-render (and the React Compiler re-memoizes) when the language changes.
export function useT() {
  const l = useSyncExternalStore(subscribe, () => lang);
  return { lang: l, t: (en: string, vars?: Vars) => translate(l, en, vars) };
}

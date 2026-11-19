import { LiveMap } from './LiveMap'

// Screens from the spec, built in Sprints 4 to 6. Only Live map exists so far.
const SCREENS = ['Live map', 'Routes', 'Vehicles and crew', 'Reports', 'Analytics', 'Users and settings']

export default function App() {
  return (
    <div className="shell">
      <nav className="nav" aria-label="Dashboard">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          <span>SakayBohol</span>
        </div>
        {SCREENS.map((name, i) => (
          <button key={name} className="nav-item" aria-current={i === 0 ? 'page' : undefined} disabled={i !== 0}>
            {name}
          </button>
        ))}
      </nav>
      <main className="main">
        <h1>Live map</h1>
        <LiveMap />
      </main>
    </div>
  )
}

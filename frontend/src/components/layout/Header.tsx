import { Satellite, Wifi, WifiOff } from 'lucide-react';

import { WELL_KNOWN_SATELLITES } from '../../config';
import { useTracking } from '../../context/TrackingContext';

interface HeaderProps {
  isPolling: boolean;
}

export function Header({ isPolling }: HeaderProps) {
  const { noradId, setNoradId, geolocation } = useTracking();
  const hasGps = geolocation.status === 'watching';

  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-cosmos-900/90 px-5 py-3 backdrop-blur-md">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="rounded-md border border-sky-400/30 bg-sky-400/10 p-1.5">
          <Satellite className="h-4 w-4 text-sky-400" />
        </div>
        <div>
          <p className="text-sm font-bold tracking-wider text-slate-100">TRACKER ORBITAS</p>
          <p className="text-[9px] uppercase tracking-widest text-slate-500">Telemetría Satelital</p>
        </div>
      </div>

      {/* Satellite selector */}
      <nav className="hidden gap-1 sm:flex">
        {WELL_KNOWN_SATELLITES.map(({ noradId: id, label }) => (
          <button
            key={id}
            onClick={() => setNoradId(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              noradId === id
                ? 'bg-sky-400/15 text-sky-400 ring-1 ring-sky-400/40'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Status indicators */}
      <div className="flex items-center gap-3 text-xs">
        <div className={`flex items-center gap-1.5 ${hasGps ? 'text-emerald-400' : 'text-slate-500'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${hasGps ? 'animate-blink bg-emerald-400' : 'bg-slate-600'}`} />
          GPS
        </div>
        <div className={`flex items-center gap-1.5 ${isPolling ? 'text-sky-400' : 'text-slate-500'}`}>
          {isPolling ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className={isPolling ? 'animate-blink' : ''}>LIVE</span>
        </div>
      </div>
    </header>
  );
}

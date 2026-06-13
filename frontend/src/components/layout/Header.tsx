import { Satellite } from 'lucide-react';

import { WELL_KNOWN_SATELLITES } from '../../config';
import { useTracking } from '../../context/TrackingContext';

export function Header() {
  const { noradId, setNoradId } = useTracking();

  return (
    <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
      <div className="flex items-center gap-3">
        <Satellite className="h-6 w-6" aria-hidden />
        <h1 className="text-lg font-semibold">Tracker Orbitas</h1>
      </div>
      <label className="flex items-center gap-2 text-sm">
        Satélite
        <select
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1"
          value={noradId}
          onChange={(event) => setNoradId(Number(event.target.value))}
        >
          {WELL_KNOWN_SATELLITES.map(({ noradId: id, label }) => (
            <option key={id} value={id}>
              {label} ({id})
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}

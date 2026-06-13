import { AlertTriangle, Database, MapPinOff } from 'lucide-react';

import { useTracking } from '../../context/TrackingContext';
import type { SatelliteInfo } from '../../types/api';

const DEGRADED = new Set(['stale_cache', 'emergency']);

interface Props {
  satellite?: SatelliteInfo | null;
  staleTle?: boolean;
}

export function StatusBanner({ satellite, staleTle }: Props) {
  const { geolocation } = useTracking();
  const warnings: Array<{ icon: React.ReactNode; text: string }> = [];

  if (geolocation.status === 'denied') {
    warnings.push({ icon: <MapPinOff className="h-3.5 w-3.5" />, text: 'Permiso de ubicación denegado. El tracking necesita tu posición GPS.' });
  } else if (geolocation.status === 'error') {
    warnings.push({ icon: <MapPinOff className="h-3.5 w-3.5" />, text: geolocation.errorMessage ?? 'No se pudo obtener la ubicación.' });
  }
  if (satellite && DEGRADED.has(satellite.tle_source)) {
    warnings.push({ icon: <Database className="h-3.5 w-3.5" />, text: `TLE desde fallback (${satellite.tle_source}) — CelesTrak no respondió. Datos pueden estar desactualizados.` });
  }
  if (staleTle) {
    warnings.push({ icon: <AlertTriangle className="h-3.5 w-3.5" />, text: 'TLE con más de 14 días de antigüedad. Las posiciones pueden desviarse varios km.' });
  }

  if (warnings.length === 0) return null;

  return (
    <div role="alert" className="border-b border-amber-800/50 bg-amber-950/80 px-5 py-2">
      {warnings.map(({ icon, text }) => (
        <p key={text} className="flex items-center gap-2 text-xs text-amber-300">
          {icon} {text}
        </p>
      ))}
    </div>
  );
}

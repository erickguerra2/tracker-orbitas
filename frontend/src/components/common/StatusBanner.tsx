/**
 * Avisos de datos degradados: TLE viejo (stale_tle), TLE servido desde
 * fallback (stale_cache/emergency) o problemas de geolocalización.
 */

import { AlertTriangle, MapPinOff } from 'lucide-react';

import { useTracking } from '../../context/TrackingContext';
import type { SatelliteInfo } from '../../types/api';

const DEGRADED_SOURCES = new Set(['stale_cache', 'emergency']);

export function StatusBanner({ satellite, staleTle }: { satellite?: SatelliteInfo | null; staleTle?: boolean }) {
  const { geolocation } = useTracking();
  const warnings: string[] = [];

  if (geolocation.status === 'denied') {
    warnings.push('Permiso de ubicación denegado: el tracking necesita tu posición.');
  } else if (geolocation.status === 'unavailable' || geolocation.status === 'error') {
    warnings.push(geolocation.errorMessage ?? 'No se pudo obtener tu ubicación.');
  }
  if (satellite && DEGRADED_SOURCES.has(satellite.tle_source)) {
    warnings.push(`TLE servido desde fallback (${satellite.tle_source}): CelesTrak no respondió.`);
  }
  if (staleTle) {
    warnings.push('El TLE tiene más de 14 días: las posiciones pueden desviarse varios km.');
  }

  if (warnings.length === 0) return null;

  return (
    <div role="alert" className="flex flex-col gap-1 border-b border-amber-700 bg-amber-950 px-6 py-2 text-sm text-amber-200">
      {warnings.map((warning) => (
        <p key={warning} className="flex items-center gap-2">
          {geolocation.status === 'denied' ? <MapPinOff className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
          {warning}
        </p>
      ))}
    </div>
  );
}

import { MapPin, Navigation } from 'lucide-react';

import { useTracking } from '../../context/TrackingContext';

export function ObserverPanel() {
  const { geolocation } = useTracking();
  const { observer, accuracyM, status } = geolocation;

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-sky-400" />
        <span className="label">Observador</span>
      </div>

      {observer ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <span className="label">Latitud</span>
              <span className="font-mono text-sm text-slate-200">{observer.latitude.toFixed(4)}°</span>
            </div>
            <div className="flex flex-col">
              <span className="label">Longitud</span>
              <span className="font-mono text-sm text-slate-200">{observer.longitude.toFixed(4)}°</span>
            </div>
            <div className="flex flex-col">
              <span className="label">Altitud</span>
              <span className="font-mono text-sm text-slate-200">{(observer.altitude_m ?? 0).toFixed(0)} m</span>
            </div>
            <div className="flex flex-col">
              <span className="label">Precisión GPS</span>
              <span className={`font-mono text-sm ${accuracyM !== null && accuracyM < 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {accuracyM !== null ? `±${accuracyM.toFixed(0)} m` : '—'}
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <Navigation className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] text-emerald-400">GPS activo</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <MapPin className="h-7 w-7 text-slate-600" />
          <p className="text-xs text-slate-500">
            {status === 'denied'
              ? 'Permiso denegado'
              : status === 'unavailable'
              ? 'GPS no disponible'
              : 'Esperando ubicación…'}
          </p>
        </div>
      )}
    </div>
  );
}

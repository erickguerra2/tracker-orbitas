/** Placeholder: ubicación actual del observador. */

import { MapPin } from 'lucide-react';

import { useTracking } from '../../context/TrackingContext';

export function ObserverPanel() {
  const { geolocation } = useTracking();
  const { observer, accuracyM, status } = geolocation;

  return (
    <section className="rounded-lg border border-slate-700 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <MapPin className="h-4 w-4" aria-hidden /> Observador
      </h2>
      {observer ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt>Latitud</dt>
          <dd>{observer.latitude.toFixed(4)}°</dd>
          <dt>Longitud</dt>
          <dd>{observer.longitude.toFixed(4)}°</dd>
          <dt>Altitud</dt>
          <dd>{(observer.altitude_m ?? 0).toFixed(0)} m</dd>
          <dt>Precisión</dt>
          <dd>{accuracyM !== null ? `±${accuracyM.toFixed(0)} m` : '—'}</dd>
        </dl>
      ) : (
        <p className="text-sm text-slate-500">
          {status === 'idle' ? 'Esperando permiso de ubicación…' : 'Sin posición disponible.'}
        </p>
      )}
    </section>
  );
}

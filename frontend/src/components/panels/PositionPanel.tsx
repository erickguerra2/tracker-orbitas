/** Placeholder: telemetría en vivo (azimut, elevación, distancia). */

import { Radar } from 'lucide-react';

import type { PositionResponse } from '../../types/api';
import type { TrackingApiError } from '../../services/trackingApi';

interface Props {
  position: PositionResponse | null;
  error: TrackingApiError | null;
}

export function PositionPanel({ position, error }: Props) {
  return (
    <section className="rounded-lg border border-slate-700 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <Radar className="h-4 w-4" aria-hidden /> Telemetría en vivo
      </h2>
      {error ? (
        <p className="text-sm text-red-400">{error.message}</p>
      ) : position ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt>Azimut</dt>
          <dd>{position.azimuth_deg.toFixed(1)}°</dd>
          <dt>Elevación</dt>
          <dd>{position.elevation_deg.toFixed(1)}°</dd>
          <dt>Distancia</dt>
          <dd>{position.range_km.toFixed(0)} km</dd>
          <dt>Velocidad radial</dt>
          <dd>{position.range_rate_km_s.toFixed(2)} km/s</dd>
          <dt>Sobre el horizonte</dt>
          <dd>{position.above_horizon ? 'Sí' : 'No'}</dd>
          <dt>Altitud orbital</dt>
          <dd>{position.satellite_altitude_km.toFixed(0)} km</dd>
        </dl>
      ) : (
        <p className="text-sm text-slate-500">Esperando datos del backend…</p>
      )}
    </section>
  );
}

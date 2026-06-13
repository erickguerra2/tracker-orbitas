/** Placeholder: tabla de próximos pases visibles. */

import { CalendarClock } from 'lucide-react';

import type { PassesResponse } from '../../types/api';
import type { TrackingApiError } from '../../services/trackingApi';

interface Props {
  passes: PassesResponse | null;
  error: TrackingApiError | null;
  isLoading: boolean;
}

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—';
}

export function PassesPanel({ passes, error, isLoading }: Props) {
  return (
    <section className="rounded-lg border border-slate-700 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <CalendarClock className="h-4 w-4" aria-hidden /> Próximos pases (&ge;
        {passes?.min_culmination_deg ?? 10}°)
      </h2>
      {error ? (
        <p className="text-sm text-red-400">{error.message}</p>
      ) : isLoading && !passes ? (
        <p className="text-sm text-slate-500">Calculando pases…</p>
      ) : passes && passes.passes.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="py-1 pr-2">Salida</th>
              <th className="py-1 pr-2">Culminación</th>
              <th className="py-1 pr-2">Elev. máx</th>
              <th className="py-1">Duración</th>
            </tr>
          </thead>
          <tbody>
            {passes.passes.map((pass) => (
              <tr key={pass.culmination_time} className="border-t border-slate-800">
                <td className="py-1 pr-2">{formatTime(pass.rise_time)}</td>
                <td className="py-1 pr-2">{formatTime(pass.culmination_time)}</td>
                <td className="py-1 pr-2">{pass.max_elevation_deg.toFixed(0)}°</td>
                <td className="py-1">
                  {pass.duration_s !== null ? `${Math.round(pass.duration_s / 60)} min` : '—'}
                  {pass.truncated ? ' (truncado)' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500">Sin pases visibles en la ventana de búsqueda.</p>
      )}
    </section>
  );
}

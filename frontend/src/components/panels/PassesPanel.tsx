import { CalendarClock, ChevronDown, ChevronRight, Clock, TrendingUp } from 'lucide-react';

import { useTracking } from '../../context/TrackingContext';
import { ElevationChart } from './ElevationChart';
import type { PassesResponse } from '../../types/api';
import type { TrackingApiError } from '../../services/trackingApi';

interface Props {
  passes: PassesResponse | null;
  error: TrackingApiError | null;
  isLoading: boolean;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

function elevColor(deg: number): string {
  if (deg >= 60) return 'text-emerald-400';
  if (deg >= 30) return 'text-sky-400';
  if (deg >= 10) return 'text-amber-400';
  return 'text-slate-500';
}

export function PassesPanel({ passes, error, isLoading }: Props) {
  const { selectedPassIndex, setSelectedPassIndex } = useTracking();

  return (
    <div className="panel flex flex-col">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <CalendarClock className="h-3.5 w-3.5 text-sky-400" />
        <span className="label">Próximos pases</span>
        {passes && (
          <span className="ml-1 text-[10px] text-slate-500">≥ {passes.min_culmination_deg}° elev.</span>
        )}
        {isLoading && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
            <span className="h-1.5 w-1.5 animate-blink rounded-full bg-sky-400" /> calculando
          </span>
        )}
      </div>

      {error ? (
        <div className="p-4 text-xs text-red-400">{error.message}</div>
      ) : !passes || passes.passes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <CalendarClock className="h-8 w-8 text-slate-700" />
          <p className="text-xs text-slate-500">
            {isLoading ? 'Calculando ventanas de paso…' : 'Sin pases visibles en las próximas 24 h.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {passes.passes.map((pass, idx) => {
            const isSelected = idx === selectedPassIndex;
            const day = fmtDate(pass.rise_time ?? pass.culmination_time);

            return (
              <div
                key={pass.culmination_time}
                className={`border-b border-slate-800/60 transition-colors last:border-0 ${
                  isSelected ? 'bg-sky-400/5' : 'hover:bg-slate-800/40'
                }`}
              >
                {/* Row */}
                <button
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                  onClick={() => setSelectedPassIndex(idx)}
                  aria-pressed={isSelected}
                >
                  {/* Index */}
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    isSelected ? 'bg-sky-400 text-cosmos-950' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {idx + 1}
                  </span>

                  {/* Date + rise time */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{day}</span>
                      <div className="flex items-center gap-1 text-xs text-slate-300">
                        <Clock className="h-2.5 w-2.5 text-slate-500" />
                        {fmtTime(pass.rise_time)} → {fmtTime(pass.set_time)}
                      </div>
                      {pass.truncated && <span className="rounded bg-slate-700 px-1 text-[8px] text-slate-500">truncado</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                      <span>Azm {pass.rise_azimuth_deg?.toFixed(0) ?? '—'}°→{pass.set_azimuth_deg?.toFixed(0) ?? '—'}°</span>
                      {pass.duration_s !== null && <span>{Math.round(pass.duration_s / 60)} min</span>}
                    </div>
                  </div>

                  {/* Max elevation badge */}
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1">
                      <TrendingUp className={`h-3 w-3 ${elevColor(pass.max_elevation_deg)}`} />
                      <span className={`font-mono text-sm font-semibold ${elevColor(pass.max_elevation_deg)}`}>
                        {pass.max_elevation_deg.toFixed(0)}°
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-600">máx elev.</span>
                  </div>

                  {/* Expand icon */}
                  {isSelected
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  }
                </button>

                {/* Elevation chart (expanded) */}
                {isSelected && (
                  <div className="animate-fade-in border-t border-slate-800/60 px-4 pb-3 pt-2">
                    <p className="mb-2 flex items-center gap-1 text-[9px] text-slate-500">
                      <TrendingUp className="h-3 w-3" /> Elevación vs. tiempo
                    </p>
                    <ElevationChart pass={pass} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

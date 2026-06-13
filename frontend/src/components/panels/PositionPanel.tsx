import { Activity, Gauge } from 'lucide-react';

import { MetricCard } from '../common/MetricCard';
import type { PositionResponse } from '../../types/api';
import type { TrackingApiError } from '../../services/trackingApi';

interface Props {
  position: PositionResponse | null;
  error: TrackingApiError | null;
}

function fmt(v: number, decimals = 1): string {
  return v.toFixed(decimals);
}

export function PositionPanel({ position, error }: Props) {
  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span className="label">Telemetría en vivo</span>
        </div>
        {position && (
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
            position.above_horizon
              ? 'bg-emerald-400/15 text-emerald-400'
              : 'bg-slate-700 text-slate-500'
          }`}>
            {position.above_horizon ? 'Sobre horizonte' : 'Bajo horizonte'}
          </span>
        )}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-3 py-2">
          <Gauge className="h-4 w-4 text-red-400" />
          <p className="text-xs text-red-400">{error.message}</p>
        </div>
      ) : position ? (
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Azimut"
            value={fmt(position.azimuth_deg)}
            unit="°"
            accent="sky"
          />
          <MetricCard
            label="Elevación"
            value={fmt(position.elevation_deg)}
            unit="°"
            accent={position.elevation_deg > 10 ? 'green' : position.elevation_deg > 0 ? 'amber' : 'slate'}
          />
          <MetricCard
            label="Distancia"
            value={fmt(position.range_km, 0)}
            unit="km"
            accent="sky"
          />
          <MetricCard
            label="Vel. radial"
            value={fmt(position.range_rate_km_s, 2)}
            unit="km/s"
            accent={position.range_rate_km_s < 0 ? 'green' : 'amber'}
            sub={position.range_rate_km_s < 0 ? '↓ acercándose' : '↑ alejándose'}
          />
          <MetricCard
            label="Altitud orbital"
            value={fmt(position.satellite_altitude_km, 0)}
            unit="km"
          />
          <MetricCard
            label="Edad TLE"
            value={fmt(position.tle_age_days, 1)}
            unit="días"
            accent={position.tle_age_days > 14 ? 'amber' : 'green'}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[58px] animate-pulse rounded-lg border border-slate-800 bg-slate-800/50" />
          ))}
        </div>
      )}
    </div>
  );
}

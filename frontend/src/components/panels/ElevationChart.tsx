import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, type TooltipProps,
} from 'recharts';

import type { PassWindow } from '../../types/api';

interface DataPoint { timeMs: number; elevation: number; }

function buildData(pass: PassWindow): DataPoint[] {
  if (!pass.rise_time || !pass.set_time) return [];
  const riseMs = new Date(pass.rise_time).getTime();
  const setMs  = new Date(pass.set_time).getTime();
  const N = 40;
  return Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N;
    return {
      timeMs: riseMs + t * (setMs - riseMs),
      elevation: Math.max(0, pass.max_elevation_deg * Math.sin(Math.PI * t)),
    };
  });
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const el = payload[0]?.value ?? 0;
  const ms = payload[0]?.payload?.timeMs as number;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-mono text-sky-400">{hhmm(ms)}</p>
      <p className="font-mono text-emerald-400">{Number(el).toFixed(1)}°</p>
    </div>
  );
}

interface Props {
  pass: PassWindow;
}

export function ElevationChart({ pass }: Props) {
  const data = buildData(pass);
  const culminationMs = new Date(pass.culmination_time).getTime();

  if (data.length === 0) return null;

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="timeMs"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={hhmm}
            tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            domain={[0, Math.ceil(pass.max_elevation_deg / 10) * 10]}
            tickFormatter={(v: number) => `${v}°`}
            tick={{ fill: '#64748b', fontSize: 9, fontFamily: 'monospace' }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
          <ReferenceLine
            x={culminationMs}
            stroke="#38bdf8"
            strokeDasharray="4 3"
            label={{ value: `${pass.max_elevation_deg.toFixed(0)}°`, fill: '#38bdf8', fontSize: 9, position: 'top' }}
          />
          <Area
            type="monotone"
            dataKey="elevation"
            stroke="#38bdf8"
            strokeWidth={1.5}
            fill="url(#elevGrad)"
            dot={false}
            activeDot={{ r: 3, fill: '#38bdf8', stroke: '#020817' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

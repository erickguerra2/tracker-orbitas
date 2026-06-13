import { useEffect, useRef, useState } from 'react';
import { Crosshair } from 'lucide-react';

import type { PassWindow, PositionResponse } from '../../types/api';

const SIZE = 320;
const CENTER = SIZE / 2;
const OUTER_R = SIZE / 2 - 22;   // radius of the 0° ring (horizon)
const LABEL_R = OUTER_R + 12;    // radius where cardinal labels sit

/** Azimuth/elevation → SVG cartesian. North = top. */
function polar(azDeg: number, elDeg: number): { x: number; y: number } {
  const r = OUTER_R * (1 - Math.max(elDeg, 0) / 90);
  const rad = (azDeg * Math.PI) / 180;
  return { x: CENTER + r * Math.sin(rad), y: CENTER - r * Math.cos(rad) };
}

/**
 * Generate N points along a pass arc.
 * Elevation is approximated as a sinusoidal profile: el(t) = maxEl · sin(πt).
 * Azimuth is interpolated via quadratic Bézier through rise/culmination/set,
 * with wrap-around normalization so the path never crosses 0°/360°.
 */
function buildArcPath(pass: PassWindow, n = 48): string {
  const { rise_azimuth_deg: az0, culmination_azimuth_deg: azM, set_azimuth_deg: azN, max_elevation_deg: elMax } = pass;
  if (az0 === null || azN === null) return '';

  // Normalize to avoid wrap-around jumps (keep all values within ±180° of az0)
  const wrap = (a: number) => az0 + (((a - az0 + 540) % 360) - 180);
  const azMn = wrap(azM);
  const azNn = wrap(azN);
  // Quadratic Bézier control point that makes the curve pass through azMn at t=0.5
  const ctrl = 2 * azMn - (az0 + azNn) / 2;

  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const az = (1 - t) ** 2 * az0 + 2 * (1 - t) * t * ctrl + t ** 2 * azNn;
    const el = elMax * Math.sin(Math.PI * t);
    const { x, y } = polar(az, el);
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

const MAX_TRAIL = 12;

interface Props {
  position: PositionResponse | null;
  selectedPass: PassWindow | null;
}

export function SkyViewPanel({ position, selectedPass }: Props) {
  const [trail, setTrail] = useState<Array<{ x: number; y: number }>>([]);
  const scanRef = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!position?.above_horizon) { setTrail([]); return; }
    const pt = polar(position.azimuth_deg, position.elevation_deg);
    setTrail(prev => [...prev.slice(-(MAX_TRAIL - 1)), pt]);
  }, [position]);

  const satPt = position?.above_horizon ? polar(position.azimuth_deg, position.elevation_deg) : null;
  const arcPath = selectedPass ? buildArcPath(selectedPass) : '';
  const arcRisePt = selectedPass?.rise_azimuth_deg !== null ? polar(selectedPass?.rise_azimuth_deg ?? 0, 0) : null;
  const arcSetPt  = selectedPass?.set_azimuth_deg  !== null ? polar(selectedPass?.set_azimuth_deg  ?? 0, 0) : null;
  const arcCulmPt = selectedPass ? polar(selectedPass.culmination_azimuth_deg, selectedPass.max_elevation_deg) : null;

  return (
    <div className="panel flex flex-col gap-0">
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <Crosshair className="h-3.5 w-3.5 text-sky-400" />
        <span className="label">Vista de cielo</span>
        {position && (
          <span className="ml-auto font-mono text-xs text-slate-400">
            Az {position.azimuth_deg.toFixed(1)}° / El {position.elevation_deg.toFixed(1)}°
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full max-w-sm"
          role="img"
          aria-label="Mapa polar del cielo"
        >
          <defs>
            {/* Radar scan gradient */}
            <radialGradient id="scanGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </radialGradient>
            {/* Pass arc gradient */}
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Background circle */}
          <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="rgba(15,32,67,0.6)" stroke="#1e293b" strokeWidth="1" />

          {/* Elevation rings 30° and 60° */}
          {[30, 60].map(el => (
            <circle
              key={el}
              cx={CENTER} cy={CENTER}
              r={OUTER_R * (1 - el / 90)}
              fill="none" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="3 3"
            />
          ))}

          {/* Crosshair lines */}
          <line x1={CENTER} y1={CENTER - OUTER_R} x2={CENTER} y2={CENTER + OUTER_R} stroke="#1e3a5f" strokeWidth="1" />
          <line x1={CENTER - OUTER_R} y1={CENTER} x2={CENTER + OUTER_R} y2={CENTER} stroke="#1e3a5f" strokeWidth="1" />

          {/* Elevation ring labels */}
          {[30, 60].map(el => (
            <text key={el} x={CENTER + 3} y={CENTER - OUTER_R * (1 - el / 90) - 3} fontSize="8" fill="#475569">{el}°</text>
          ))}

          {/* Radar scan sweep */}
          <g
            ref={scanRef}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px`, animation: 'radarScan 5s linear infinite' }}
          >
            <line x1={CENTER} y1={CENTER} x2={CENTER} y2={CENTER - OUTER_R} stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.5" />
            <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="url(#scanGrad)" style={{ clipPath: `path('M ${CENTER} ${CENTER} L ${CENTER} ${CENTER - OUTER_R} A ${OUTER_R} ${OUTER_R} 0 0 1 ${CENTER + OUTER_R} ${CENTER} Z')` }} />
          </g>

          {/* Horizon ring (foreground) */}
          <circle cx={CENTER} cy={CENTER} r={OUTER_R} fill="none" stroke="#334155" strokeWidth="1.5" />

          {/* Cardinal labels */}
          {[
            { label: 'N', x: CENTER,       y: CENTER - LABEL_R },
            { label: 'S', x: CENTER,       y: CENTER + LABEL_R + 4 },
            { label: 'E', x: CENTER + LABEL_R + 4, y: CENTER + 1 },
            { label: 'O', x: CENTER - LABEL_R - 4, y: CENTER + 1 },
          ].map(({ label, x, y }) => (
            <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="bold" fill="#64748b">
              {label}
            </text>
          ))}

          {/* Selected pass trajectory arc */}
          {arcPath && (
            <>
              {/* Glow behind the arc */}
              <path d={arcPath} fill="none" stroke="#38bdf8" strokeWidth="4" strokeOpacity="0.15" strokeLinecap="round" />
              {/* Main arc */}
              <path d={arcPath} fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.7" strokeDasharray="4 2" strokeLinecap="round" />
              {/* Rise marker */}
              {arcRisePt && <circle cx={arcRisePt.x} cy={arcRisePt.y} r={3} fill="#38bdf8" fillOpacity="0.5" />}
              {/* Culmination marker */}
              {arcCulmPt && (
                <>
                  <circle cx={arcCulmPt.x} cy={arcCulmPt.y} r={5} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
                  <circle cx={arcCulmPt.x} cy={arcCulmPt.y} r={2} fill="#38bdf8" />
                  <text x={arcCulmPt.x + 7} y={arcCulmPt.y - 2} fontSize="8" fill="#38bdf8">
                    {selectedPass?.max_elevation_deg.toFixed(0)}°
                  </text>
                </>
              )}
              {/* Set marker */}
              {arcSetPt && <circle cx={arcSetPt.x} cy={arcSetPt.y} r={3} fill="#38bdf8" fillOpacity="0.5" />}
            </>
          )}

          {/* Comet trail */}
          {trail.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x} cy={pt.y}
              r={2.5 * (i + 1) / trail.length}
              fill="#4ade80"
              opacity={(i + 1) / trail.length * 0.6}
            />
          ))}

          {/* Live satellite dot */}
          {satPt ? (
            <>
              {/* Outer glow ring */}
              <circle cx={satPt.x} cy={satPt.y} r={9} fill="none" stroke="#4ade80" strokeWidth="1" strokeOpacity="0.3" />
              <circle cx={satPt.x} cy={satPt.y} r={6} fill="none" stroke="#4ade80" strokeWidth="1" strokeOpacity="0.5" />
              {/* Core dot */}
              <circle cx={satPt.x} cy={satPt.y} r={3.5} fill="#4ade80" style={{ filter: 'drop-shadow(0 0 4px #4ade80)' }} />
            </>
          ) : (
            /* Off-horizon indicator: small dot at azimuth on the horizon ring */
            position && (
              (() => {
                const pt2 = polar(position.azimuth_deg, 0);
                return <circle cx={pt2.x} cy={pt2.y} r={2.5} fill="#64748b" />;
              })()
            )
          )}

          {/* Center cross */}
          <circle cx={CENTER} cy={CENTER} r={2} fill="#475569" />
        </svg>
      </div>
    </div>
  );
}

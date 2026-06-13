/**
 * Placeholder del gráfico polar de cielo (azimut/elevación).
 *
 * Esqueleto SVG: anillos de elevación (0°/30°/60°) y el satélite como un
 * punto. La fase visual lo reemplazará por un componente completo
 * (trayectoria del pase, etiquetas cardinales, animación).
 */

import { Compass } from 'lucide-react';

import type { PositionResponse } from '../../types/api';

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 10;

/** Proyección polar: elevación 90° = centro, 0° = borde. */
function project(azimuthDeg: number, elevationDeg: number): { x: number; y: number } {
  const r = RADIUS * (1 - Math.max(elevationDeg, 0) / 90);
  const azimuthRad = (azimuthDeg * Math.PI) / 180;
  return {
    x: CENTER + r * Math.sin(azimuthRad),
    y: CENTER - r * Math.cos(azimuthRad),
  };
}

export function SkyViewPanel({ position }: { position: PositionResponse | null }) {
  const point =
    position && position.above_horizon
      ? project(position.azimuth_deg, position.elevation_deg)
      : null;

  return (
    <section className="rounded-lg border border-slate-700 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        <Compass className="h-4 w-4" aria-hidden /> Vista de cielo
      </h2>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block max-w-xs" role="img" aria-label="Mapa polar del cielo">
        {[0, 30, 60].map((elevation) => (
          <circle
            key={elevation}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS * (1 - elevation / 90)}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.25}
          />
        ))}
        <text x={CENTER} y={12} textAnchor="middle" fontSize={10} fill="currentColor">N</text>
        <text x={CENTER} y={SIZE - 4} textAnchor="middle" fontSize={10} fill="currentColor">S</text>
        {point && <circle cx={point.x} cy={point.y} r={5} fill="currentColor" />}
      </svg>
      {!point && (
        <p className="text-center text-sm text-slate-500">Satélite bajo el horizonte.</p>
      )}
    </section>
  );
}

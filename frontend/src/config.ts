/** Configuración global del frontend. */

/** Vacío = mismo origen; en dev el proxy de Vite reenvía /api al backend. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Precisión de cuantización de coordenadas, igual que el backend
 * (2 decimales ≈ 1.1 km). Sirve para detectar cuándo el usuario se movió
 * "de verdad" y evitar recalcular pases por el jitter del GPS.
 */
export const COORDINATE_DECIMALS = 2;

/** Frecuencia de refresco de la posición en vivo. */
export const POSITION_POLL_MS = 2_000;

/** Ventana por defecto de búsqueda de pases. */
export const PASSES_SEARCH_HOURS = 24;

/** Satélites de interés común (espejo de WELL_KNOWN_SATELLITES del backend). */
export const WELL_KNOWN_SATELLITES: ReadonlyArray<{ noradId: number; label: string }> = [
  { noradId: 25544, label: 'ISS (ZARYA)' },
  { noradId: 28654, label: 'NOAA 18' },
  { noradId: 33591, label: 'NOAA 19' },
];

export function quantize(value: number, decimals: number = COORDINATE_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Clave estable de ubicación: cambia solo con movimientos reales (~1 km). */
export function observerKey(latitude: number, longitude: number): string {
  return `${quantize(latitude)},${quantize(longitude)}`;
}

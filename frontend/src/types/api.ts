/**
 * Espejo TypeScript del contrato del backend (backend/app/schemas/tracking.py).
 * Si el contrato cambia en Pydantic, este archivo debe cambiar con él.
 */

/** TLE manual, para usuarios avanzados. */
export interface TLEInput {
  name?: string;
  line1: string;
  line2: string;
}

/** Coordenadas del observador (Geolocation API del navegador). */
export interface ObserverInput {
  latitude: number;
  longitude: number;
  /** Altitud sobre el elipsoide en METROS (no km). */
  altitude_m?: number;
}

/** Procedencia del TLE usado por el backend en el cálculo. */
export type TleSource =
  | 'manual'
  | 'celestrak'
  | 'cache'
  | 'stale_cache'
  | 'emergency';

export interface SatelliteInfo {
  name: string;
  norad_id: number | null;
  tle_source: TleSource;
  tle_fetched_at: string | null;
}

/** El satélite se identifica por norad_id O por tle manual, nunca ambos. */
interface TrackingRequestBase {
  norad_id?: number;
  tle?: TLEInput;
  observer: ObserverInput;
}

export interface PositionRequest extends TrackingRequestBase {
  /** ISO-8601 UTC; null/ausente = ahora. */
  timestamp?: string | null;
}

export interface PositionResponse {
  satellite: SatelliteInfo;
  timestamp: string;
  azimuth_deg: number;
  elevation_deg: number;
  range_km: number;
  /** Negativo = el satélite se acerca al observador. */
  range_rate_km_s: number;
  above_horizon: boolean;
  satellite_latitude_deg: number;
  satellite_longitude_deg: number;
  satellite_altitude_km: number;
  tle_age_days: number;
  stale_tle: boolean;
}

export interface PassesRequest extends TrackingRequestBase {
  /** ISO-8601 UTC; null/ausente = ahora. */
  start?: string | null;
  /** Ventana de búsqueda en horas (máx. 120). */
  hours?: number;
  /** Elevación máxima mínima para reportar un pase (default backend: 10°). */
  min_culmination_deg?: number;
}

export interface PassWindow {
  rise_time: string | null;
  rise_azimuth_deg: number | null;
  culmination_time: string;
  culmination_azimuth_deg: number;
  max_elevation_deg: number;
  set_time: string | null;
  set_azimuth_deg: number | null;
  duration_s: number | null;
  /** true: el pase quedó cortado por el borde de la ventana de búsqueda. */
  truncated: boolean;
}

export interface PassesResponse {
  satellite: SatelliteInfo;
  search_start: string;
  search_end: string;
  min_culmination_deg: number;
  tle_age_days: number;
  stale_tle: boolean;
  passes: PassWindow[];
}

/** Códigos de error estructurados que emite el backend. */
export type ApiErrorCode =
  | 'invalid_tle'
  | 'tle_too_old'
  | 'propagation_failed'
  | 'unknown_satellite'
  | 'tle_unavailable';

export interface ApiErrorBody {
  error?: ApiErrorCode;
  detail?: unknown;
}

/**
 * Predicción de pases: el cálculo caro del backend.
 *
 * Solo se recalcula cuando cambia el satélite o la *clave cuantizada* de
 * la ubicación (~1 km): el jitter del GPS del navegador no dispara
 * recálculos (mismo criterio de cuantización que el backend).
 */

import { useEffect, useState } from 'react';

import { PASSES_SEARCH_HOURS, observerKey } from '../config';
import { fetchPasses, TrackingApiError } from '../services/trackingApi';
import type { ObserverInput, PassesResponse } from '../types/api';

export interface SatellitePassesState {
  passes: PassesResponse | null;
  error: TrackingApiError | null;
  isLoading: boolean;
}

export function useSatellitePasses(
  noradId: number,
  observer: ObserverInput | null,
  hours: number = PASSES_SEARCH_HOURS,
): SatellitePassesState {
  const [passes, setPasses] = useState<PassesResponse | null>(null);
  const [error, setError] = useState<TrackingApiError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Claves estables: solo cambian con movimientos reales del usuario.
  // La altitud se cuantiza a 100 m: el jitter vertical del GPS es de
  // metros y no afecta la geometría de un pase.
  const locationKey = observer ? observerKey(observer.latitude, observer.longitude) : null;
  const altitudeKeyM = Math.round((observer?.altitude_m ?? 0) / 100) * 100;

  useEffect(() => {
    if (locationKey === null) return;
    const [latitude, longitude] = locationKey.split(',').map(Number);

    const controller = new AbortController();
    setIsLoading(true);
    fetchPasses(
      {
        norad_id: noradId,
        observer: { latitude, longitude, altitude_m: altitudeKeyM },
        hours,
      },
      controller.signal,
    )
      .then((result) => {
        setPasses(result);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof TrackingApiError) setError(err);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [noradId, locationKey, altitudeKeyM, hours]);

  return { passes, error, isLoading };
}

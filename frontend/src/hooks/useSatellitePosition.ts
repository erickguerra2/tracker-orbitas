/**
 * Polling de la posición en vivo del satélite.
 *
 * Reglas:
 * - Cada tick cancela la request anterior (AbortController): si el backend
 *   tarda más que el intervalo, nunca se acumulan requests ni se pintan
 *   respuestas fuera de orden.
 * - El observer SIN cuantizar viaja al backend (él cuantiza); aquí solo
 *   importa tener la última lectura.
 */

import { useEffect, useRef, useState } from 'react';

import { POSITION_POLL_MS } from '../config';
import { fetchPosition, TrackingApiError } from '../services/trackingApi';
import type { ObserverInput, PositionResponse } from '../types/api';

export interface SatellitePositionState {
  position: PositionResponse | null;
  error: TrackingApiError | null;
  isPolling: boolean;
}

export function useSatellitePosition(
  noradId: number,
  observer: ObserverInput | null,
  pollMs: number = POSITION_POLL_MS,
): SatellitePositionState {
  const [position, setPosition] = useState<PositionResponse | null>(null);
  const [error, setError] = useState<TrackingApiError | null>(null);
  const observerRef = useRef(observer);
  observerRef.current = observer;

  const hasObserver = observer !== null;

  useEffect(() => {
    if (!hasObserver) return;

    let controller: AbortController | null = null;

    const tick = async () => {
      const current = observerRef.current;
      if (current === null) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const result = await fetchPosition(
          { norad_id: noradId, observer: current },
          controller.signal,
        );
        setPosition(result);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof TrackingApiError) setError(err);
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), pollMs);
    return () => {
      clearInterval(interval);
      controller?.abort();
    };
  }, [noradId, hasObserver, pollMs]);

  return { position, error, isPolling: hasObserver };
}

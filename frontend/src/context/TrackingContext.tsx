/**
 * Estado global mínimo del dashboard: qué satélite se observa y dónde está
 * el observador. Context API es suficiente a esta escala; si el árbol de
 * estado crece (multi-satélite, históricos), migrar a Zustand.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { WELL_KNOWN_SATELLITES } from '../config';
import { useGeolocation, type GeolocationState } from '../hooks/useGeolocation';

interface TrackingContextValue {
  /** NORAD ID del satélite seleccionado (default: ISS). */
  noradId: number;
  setNoradId: (noradId: number) => void;
  /** Ubicación dinámica del usuario (Geolocation API). */
  geolocation: GeolocationState;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [noradId, setNoradId] = useState<number>(WELL_KNOWN_SATELLITES[0].noradId);
  const geolocation = useGeolocation();

  const value = useMemo(
    () => ({ noradId, setNoradId, geolocation }),
    [noradId, geolocation],
  );

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingContextValue {
  const context = useContext(TrackingContext);
  if (context === null) {
    throw new Error('useTracking debe usarse dentro de <TrackingProvider>.');
  }
  return context;
}

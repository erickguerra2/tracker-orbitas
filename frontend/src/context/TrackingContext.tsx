import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { WELL_KNOWN_SATELLITES } from '../config';
import { useGeolocation, type GeolocationState } from '../hooks/useGeolocation';

interface TrackingContextValue {
  noradId: number;
  setNoradId: (noradId: number) => void;
  geolocation: GeolocationState;
  selectedPassIndex: number;
  setSelectedPassIndex: (idx: number) => void;
}

const TrackingContext = createContext<TrackingContextValue | null>(null);

export function TrackingProvider({ children }: { children: ReactNode }) {
  const [noradId, setNoradId] = useState<number>(WELL_KNOWN_SATELLITES[0].noradId);
  const [selectedPassIndex, setSelectedPassIndex] = useState<number>(0);
  const geolocation = useGeolocation();

  const value = useMemo(
    () => ({ noradId, setNoradId, geolocation, selectedPassIndex, setSelectedPassIndex }),
    [noradId, geolocation, selectedPassIndex],
  );

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking(): TrackingContextValue {
  const ctx = useContext(TrackingContext);
  if (ctx === null) throw new Error('useTracking debe usarse dentro de <TrackingProvider>.');
  return ctx;
}

/**
 * Captura dinámica de la posición del usuario vía Geolocation API.
 *
 * Usa watchPosition (no getCurrentPosition) para seguir al usuario en
 * movimiento. La altitud del navegador puede ser null (depende del
 * hardware): se degrada a 0 m, un error despreciable para la geometría
 * observador–satélite.
 */

import { useEffect, useState } from 'react';

import type { ObserverInput } from '../types/api';

export type GeolocationStatus =
  | 'idle'          // aún no se pidió permiso
  | 'watching'      // recibiendo posiciones
  | 'denied'        // el usuario rechazó el permiso
  | 'unavailable'   // el navegador no soporta geolocalización
  | 'error';        // fallo del sensor / timeout

export interface GeolocationState {
  observer: ObserverInput | null;
  /** Precisión horizontal reportada por el navegador, en metros. */
  accuracyM: number | null;
  status: GeolocationStatus;
  errorMessage: string | null;
}

const INITIAL_STATE: GeolocationState = {
  observer: null,
  accuracyM: null,
  status: 'idle',
  errorMessage: null,
};

export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>(INITIAL_STATE);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState({
        ...INITIAL_STATE,
        status: 'unavailable',
        errorMessage: 'Este navegador no soporta la API de geolocalización.',
      });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setState({
          observer: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude_m: coords.altitude ?? 0,
          },
          accuracyM: coords.accuracy,
          status: 'watching',
          errorMessage: null,
        });
      },
      (error) => {
        setState((previous) => ({
          // Si ya teníamos una posición, la conservamos: una lectura vieja
          // es mejor que ninguna para seguir mostrando telemetría.
          ...previous,
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error',
          errorMessage: error.message,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return state;
}

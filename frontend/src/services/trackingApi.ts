/**
 * Cliente del backend FastAPI (endpoints /api/v1/tracking/*).
 *
 * Sin librerías externas: el contrato es pequeño y fetch nativo +
 * AbortController cubren cancelación y errores. Si el día de mañana hay
 * más endpoints o caching complejo, este módulo es el único lugar a
 * migrar a TanStack Query.
 */

import { API_BASE_URL } from '../config';
import type {
  ApiErrorBody,
  PassesRequest,
  PassesResponse,
  PositionRequest,
  PositionResponse,
} from '../types/api';

export class TrackingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorBody['error'] | 'network_error' | 'validation_error',
    message: string,
  ) {
    super(message);
    this.name = 'TrackingApiError';
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new TrackingApiError(0, 'network_error', 'No se pudo contactar al backend.');
  }

  if (!response.ok) {
    let parsed: ApiErrorBody = {};
    try {
      parsed = (await response.json()) as ApiErrorBody;
    } catch {
      // Cuerpo no-JSON (p. ej. un proxy intermedio): se reporta solo el status.
    }
    const detail =
      typeof parsed.detail === 'string' ? parsed.detail : `HTTP ${response.status}`;
    throw new TrackingApiError(response.status, parsed.error ?? 'validation_error', detail);
  }

  return (await response.json()) as T;
}

/** Posición instantánea del satélite relativa al observador. */
export function fetchPosition(
  request: PositionRequest,
  signal?: AbortSignal,
): Promise<PositionResponse> {
  return post<PositionResponse>('/api/v1/tracking/position', request, signal);
}

/** Próximas ventanas de paso sobre la ubicación del observador. */
export function fetchPasses(
  request: PassesRequest,
  signal?: AbortSignal,
): Promise<PassesResponse> {
  return post<PassesResponse>('/api/v1/tracking/passes', request, signal);
}

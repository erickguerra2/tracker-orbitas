# Frontend — Tracker Orbitas (React + Vite + TypeScript)

Esqueleto del dashboard de telemetría. La lógica de datos (geolocalización,
polling, cancelación, anti-jitter) ya está completa; la fase visual
(Tailwind a fondo, recharts) construye encima sin tocar hooks ni servicios.

## Arranque

```bash
npm install
npm run dev        # http://localhost:5173 (proxy /api → backend :8000)
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + bundle de producción
```

Requiere el backend corriendo: `uvicorn app.main:app --port 8000` desde
`backend/`. En producción, configura `VITE_API_BASE_URL` (ver `.env.example`).

## Estructura

```
src/
├── types/api.ts            # Espejo TS del contrato Pydantic del backend
├── config.ts               # URL base, cuantización (~1 km), satélites conocidos
├── services/
│   └── trackingApi.ts      # fetch + errores estructurados del backend
├── hooks/
│   ├── useGeolocation.ts   # watchPosition: lat/lon/alt dinámicas
│   ├── useSatellitePosition.ts  # polling 2 s con cancelación (AbortController)
│   └── useSatellitePasses.ts    # recalcula solo si la coordenada cuantizada cambia
├── context/
│   └── TrackingContext.tsx # satélite seleccionado + estado de geolocalización
└── components/
    ├── layout/Header.tsx          # selector de satélite
    ├── common/StatusBanner.tsx    # avisos: TLE viejo/fallback, GPS denegado
    └── panels/                    # placeholders del dashboard
        ├── ObserverPanel.tsx      # ubicación del usuario
        ├── PositionPanel.tsx      # azimut / elevación / distancia en vivo
        ├── SkyViewPanel.tsx       # gráfico polar SVG (esqueleto)
        └── PassesPanel.tsx        # tabla de próximos pases
```

## Decisiones de arquitectura

- **fetch nativo + hooks propios, sin librería de queries:** el contrato son
  dos endpoints POST; `trackingApi.ts` es el único módulo a migrar a
  TanStack Query si el caching se complica.
- **Anti-jitter espejado con el backend:** los pases (el cálculo caro) solo
  se recalculan cuando la coordenada cuantizada a 2 decimales (~1.1 km)
  cambia; la posición en vivo usa la lectura cruda.
- **Cancelación estricta en el polling:** cada tick aborta la request
  anterior — nunca se pintan respuestas fuera de orden ni se acumulan
  requests si el backend se pone lento.
- **Datos degradados visibles:** `tle_source` y `stale_tle` del backend se
  muestran en `StatusBanner` para que el usuario sepa cuándo desconfiar.
- **Context API, no Redux/Zustand:** el estado global es mínimo (satélite +
  geolocalización). Migrar solo si crece (multi-satélite, históricos).
- `recharts` ya está en las dependencias para la fase de gráficos
  (elevación vs. tiempo de cada pase); aún no se usa.

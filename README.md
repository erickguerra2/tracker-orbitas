# Tracker Orbitas 🛰️

Dashboard de Telemetría Orbital y Satelital: registra en tiempo real el paso
de satélites (ISS, CubeSats) sobre la ubicación actual del usuario.

- **Backend:** Python · FastAPI · Skyfield (propagación SGP4)
- **Frontend:** React (pendiente — ver `frontend/`)

## Estructura del repositorio

```
tracker-orbitas/
├── backend/
│   ├── app/
│   │   ├── main.py                  # App FastAPI, CORS, exception handlers
│   │   ├── api/
│   │   │   └── v1/
│   │   │       └── routes/
│   │   │           └── tracking.py  # Endpoints /position y /passes
│   │   ├── schemas/
│   │   │   └── tracking.py          # Contrato de la API (Pydantic v2)
│   │   └── services/
│   │       └── orbital_engine.py    # Motor SGP4/Skyfield (sin dependencias HTTP)
│   ├── tests/
│   │   └── test_orbital_engine.py
│   └── requirements.txt
├── frontend/                        # React (próxima fase)
└── README.md
```

La regla de capas: `routes` → `schemas` + `services`. El motor orbital
(`orbital_engine.py`) no importa nada de FastAPI, así que puede reutilizarse
desde un worker de WebSockets, un job programado de refresco de TLEs o un CLI.

## Arranque del backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# Docs interactivas: http://localhost:8000/docs
pytest            # correr la suite
```

## Contrato de la API (coordenadas dinámicas)

Se eligió **POST con cuerpo JSON** (no query params): las líneas TLE contienen
espacios significativos y signos `+` que se corrompen al URL-encodearlas, y el
navegador reenvía coordenadas con alta frecuencia, donde el caching por URL no
aporta nada.

### `POST /api/v1/tracking/position`

Posición instantánea del satélite relativa al observador.

```jsonc
// Request
{
  "tle": {
    "name": "ISS (ZARYA)",
    "line1": "1 25544U 98067A   24051.51610305  .00018603  00000+0  33412-3 0  9996",
    "line2": "2 25544  51.6401  86.9469 0004617  93.6643  17.0807 15.50113759439648"
  },
  "observer": {
    "latitude": 14.6349,     // grados WGS84, del navigator.geolocation
    "longitude": -90.5069,
    "altitude_m": 1500       // METROS sobre el elipsoide
  },
  "timestamp": null          // ISO-8601 UTC; null = ahora
}
```

```jsonc
// Response 200
{
  "timestamp": "2024-02-20T12:23:11Z",
  "azimuth_deg": 213.4,            // 0°=N, 90°=E
  "elevation_deg": 42.1,           // negativo = bajo el horizonte
  "range_km": 587.3,               // distancia oblicua observador→satélite
  "range_rate_km_s": -4.2,         // negativo = acercándose
  "above_horizon": true,
  "satellite_latitude_deg": 12.9,  // subpunto, para pintarlo en un mapa
  "satellite_longitude_deg": -88.2,
  "satellite_altitude_km": 421.7,
  "tle_age_days": 0.3,
  "stale_tle": false               // true si el TLE supera 14 días
}
```

### `POST /api/v1/tracking/passes`

Próximas ventanas de paso sobre la ubicación del observador.

```jsonc
// Request: mismos campos tle/observer, más:
{
  "start": null,              // inicio de búsqueda UTC; null = ahora
  "hours": 24,                // ventana de búsqueda (máx 120)
  "min_culmination_deg": 10   // descarta pases que culminan bajo 10°
}
```

```jsonc
// Response 200
{
  "search_start": "...", "search_end": "...",
  "min_culmination_deg": 10.0,
  "tle_age_days": 0.3, "stale_tle": false,
  "passes": [
    {
      "rise_time": "2024-02-20T18:01:05Z", "rise_azimuth_deg": 318.2,
      "culmination_time": "2024-02-20T18:06:30Z", "culmination_azimuth_deg": 47.0,
      "max_elevation_deg": 63.5,
      "set_time": "2024-02-20T18:11:55Z", "set_azimuth_deg": 132.8,
      "duration_s": 650.0,
      "truncated": false   // true si el pase quedó cortado por el borde de la ventana
    }
  ]
}
```

### Errores

| HTTP | `error`              | Causa                                                        |
|------|----------------------|--------------------------------------------------------------|
| 422  | `invalid_tle`        | TLE no parseable o mal formado                                |
| 422  | `tle_too_old`        | Época del TLE a >30 días del instante solicitado              |
| 422  | —                    | Validación Pydantic (lat/lon fuera de rango, hours > 120, …)  |
| 409  | `propagation_failed` | SGP4 no puede propagar (satélite decaído, perigeo negativo)   |

## Casos esquina críticos y su manejo

### 1. Envejecimiento de la época del TLE (epoch drift)

SGP4 es un propagador analítico de perturbaciones medias: su error crece
**~1–3 km por día** transcurrido desde la época del TLE (peor con drag alto,
como la ISS tras una tormenta solar). Un TLE de hace un mes puede situar el
satélite a cientos de km de su posición real, y la predicción de pases se
desplaza minutos enteros — suficiente para perder el pase por completo.

**Manejo implementado:** `orbital_engine._check_tle_age()` calcula
`|t − epoch|` en cada operación. A partir de 14 días el resultado se marca
`stale_tle: true` (el frontend debe avisar al usuario); a partir de 30 días se
rechaza con 422 `tle_too_old`. Para pases, la edad se valida contra el
**extremo lejano** de la ventana de búsqueda, que es donde la propagación es
menos confiable. Siguiente fase: un servicio `tle_provider` que cachee TLEs de
CelesTrak con TTL de ~12 h.

### 2. Costo de inicialización y trabajo CPU-bound bloqueando el event loop

Construir el `Timescale` de Skyfield y parsear un TLE en cada request cuesta
decenas de ms, y `find_events()` sobre 48–120 h es genuinamente CPU-bound. En
un endpoint `async def`, ese trabajo **bloquea el event loop** y congela a
todos los clientes concurrentes — letal cuando el navegador reenvía
coordenadas cada pocos segundos.

**Manejo implementado:**
- `Timescale` singleton (`lru_cache(maxsize=1)`) con `builtin=True` (sin
  descargas de red en el arranque).
- Objetos `EarthSatellite` cacheados por líneas TLE (`lru_cache(maxsize=256)`).
- Handlers **síncronos** (`def`): FastAPI los despacha a su threadpool,
  dejando libre el event loop. Si la carga crece, el siguiente paso es un
  `ProcessPoolExecutor` para `find_events`.

### 3. Jitter de la geolocalización del navegador y degeneraciones geométricas

`navigator.geolocation.watchPosition()` emite coordenadas que fluctúan varios
metros por segundo aunque el usuario no se mueva. Tratar cada lectura como una
ubicación "nueva" dispara recálculos completos de pases (el cálculo más caro)
sin que el resultado cambie de forma medible. Además hay degeneraciones
geométricas reales: el azimut es **indefinido en el cénit** (elevación = 90°),
la longitud salta de +180° a −180° en el antimeridiano, y los pases pueden
quedar **truncados** en los bordes de la ventana de búsqueda (el satélite ya
estaba sobre el horizonte en `t0`).

**Manejo implementado:**
- Las coordenadas se **cuantizan a 2 decimales (~1.1 km)** en el schema
  Pydantic: imperceptible para la geometría satelital, pero estabiliza el
  jitter y hace las coordenadas usables como clave de caché.
- El agrupado de eventos rise/culminate/set tolera secuencias incompletas y
  reporta esos pases con `truncated: true` y `rise_time`/`set_time` nulos,
  estimando la elevación máxima en los extremos disponibles, en lugar de
  lanzar una excepción o descartar el pase silenciosamente.
- Rangos validados en el contrato (`lat ∈ [−90, 90]`, `lon ∈ [−180, 180]`,
  altitud en **metros** con límites físicos) para atrapar el clásico bug de
  enviar km donde se esperan metros.

**Bonus (4):** satélites decaídos o TLEs físicamente inválidos. SGP4 puede
fallar en runtime con un TLE sintácticamente perfecto (satélite reentrado,
perigeo bajo tierra). Se inspecciona `satellite.model.error` tras cada
propagación y se traduce a un 409 `propagation_failed` con el mensaje oficial
de `SGP4_ERRORS`, en lugar de devolver NaNs silenciosos al frontend.

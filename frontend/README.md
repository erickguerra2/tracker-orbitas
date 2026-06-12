# Frontend (React) — próxima fase

Aquí vivirá el dashboard React. Pendiente de scaffolding (Vite + React).

Integración prevista con el backend:

1. Obtener coordenadas con `navigator.geolocation.watchPosition()`.
2. Enviar `{ latitude, longitude, altitude_m }` a
   `POST /api/v1/tracking/position` para la posición en vivo (polling cada
   ~2 s) y a `POST /api/v1/tracking/passes` para la tabla de próximos pases
   (recalcular solo cuando la coordenada cuantizada cambie).
3. Mostrar advertencia al usuario cuando la respuesta traiga
   `stale_tle: true`.

Ver el contrato completo en el `README.md` raíz o en `/docs` del backend.

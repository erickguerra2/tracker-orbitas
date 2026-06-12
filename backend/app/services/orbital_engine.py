"""Motor de cálculo orbital (propagación SGP4 vía Skyfield).

Este módulo es deliberadamente independiente de FastAPI: recibe y devuelve
dataclasses puras, de modo que la misma lógica pueda usarse desde la API
HTTP, un worker de websockets, un CLI o los tests sin arrastrar la capa web.

Decisiones de diseño relevantes:

- El ``Timescale`` de Skyfield y los objetos ``EarthSatellite`` se cachean a
  nivel de proceso (``lru_cache``): construirlos en cada request cuesta
  decenas de milisegundos y son inmutables para un TLE dado.
- La edad del TLE se valida en cada cálculo. SGP4 acumula un error de
  ~1-3 km por día transcurrido desde la época del TLE, por lo que se marca
  el resultado como "stale" a partir de STALE_TLE_AGE_DAYS y se rechaza el
  cálculo a partir de MAX_TLE_AGE_DAYS.
- La predicción de pases busca eventos horizonte-a-horizonte (0°) y después
  filtra por elevación de culminación, en lugar de pedirle a Skyfield
  eventos a 10°. Así el pase reportado conserva sus tiempos reales de
  salida/puesta sobre el horizonte, y el umbral de culminación es un
  filtro de calidad configurable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import numpy as np
from sgp4.api import SGP4_ERRORS
from skyfield.api import EarthSatellite, load, wgs84
from skyfield.timelib import Time, Timescale
from skyfield.toposlib import GeographicPosition

# Umbrales de envejecimiento del TLE (días desde su época).
STALE_TLE_AGE_DAYS = 14.0
MAX_TLE_AGE_DAYS = 30.0

# Elevación mínima de culminación por defecto para considerar un pase
# "observable" (filtra obstáculos locales: edificios, árboles, horizonte).
DEFAULT_MIN_CULMINATION_DEG = 10.0


class TLEError(ValueError):
    """El TLE recibido es sintácticamente inválido o no se puede parsear."""


class TLETooOldError(TLEError):
    """La época del TLE está demasiado lejos del instante solicitado."""


class PropagationError(RuntimeError):
    """SGP4 no pudo propagar la órbita (p. ej. satélite decaído)."""


@dataclass(frozen=True)
class Observer:
    """Posición geodésica (WGS84) del observador."""

    latitude_deg: float
    longitude_deg: float
    altitude_m: float = 0.0


@dataclass(frozen=True)
class TopocentricPosition:
    """Posición instantánea del satélite relativa al observador."""

    timestamp: datetime
    azimuth_deg: float
    elevation_deg: float
    range_km: float
    range_rate_km_s: float  # negativo = acercándose al observador
    above_horizon: bool
    # Subpunto geodésico del satélite (útil para pintarlo sobre un mapa).
    satellite_latitude_deg: float
    satellite_longitude_deg: float
    satellite_altitude_km: float
    tle_age_days: float
    stale_tle: bool


@dataclass(frozen=True)
class PassWindow:
    """Una ventana de paso del satélite sobre el observador.

    ``rise_time`` o ``set_time`` pueden ser ``None`` si el pase quedó
    truncado por el borde de la ventana de búsqueda (el satélite ya estaba
    sobre el horizonte al inicio, o aún no se ha puesto al final).
    """

    rise_time: datetime | None
    rise_azimuth_deg: float | None
    culmination_time: datetime
    culmination_azimuth_deg: float
    max_elevation_deg: float
    set_time: datetime | None
    set_azimuth_deg: float | None
    duration_s: float | None
    truncated: bool


@dataclass(frozen=True)
class PassPrediction:
    """Resultado completo de una predicción de pases."""

    search_start: datetime
    search_end: datetime
    min_culmination_deg: float
    tle_age_days: float
    stale_tle: bool
    passes: list[PassWindow] = field(default_factory=list)


@lru_cache(maxsize=1)
def _timescale() -> Timescale:
    # builtin=True usa las tablas de salto/ΔT empaquetadas con Skyfield en
    # lugar de descargarlas de internet: arranque determinista y sin red.
    return load.timescale(builtin=True)


@lru_cache(maxsize=256)
def _cached_satellite(line1: str, line2: str, name: str) -> EarthSatellite:
    return EarthSatellite(line1, line2, name, _timescale())


def build_satellite(line1: str, line2: str, name: str = "SATELLITE") -> EarthSatellite:
    """Parsea y cachea un TLE, con validación de formato amigable."""
    line1, line2 = line1.rstrip(), line2.rstrip()
    if not line1.startswith("1 ") or not line2.startswith("2 "):
        raise TLEError(
            "Formato TLE inválido: line1 debe comenzar con '1 ' y line2 con '2 '."
        )
    # sgp4 es extremadamente tolerante y puede "parsear" basura produciendo
    # épocas absurdas, así que validamos la estructura nosotros: longitud
    # estándar de 69 columnas y número de catálogo NORAD coherente.
    if len(line1) != 69 or len(line2) != 69:
        raise TLEError("Formato TLE inválido: cada línea debe tener 69 columnas.")
    if not line1[2:7].strip().isdigit() or line1[2:7] != line2[2:7]:
        raise TLEError(
            "Formato TLE inválido: número de catálogo NORAD ausente o "
            "inconsistente entre líneas."
        )
    try:
        return _cached_satellite(line1, line2, name.strip() or "SATELLITE")
    except Exception as exc:  # Skyfield/sgp4 lanzan ValueError variados
        raise TLEError(f"No se pudo parsear el TLE: {exc}") from exc


def _ensure_utc(when: datetime | None) -> datetime:
    if when is None:
        return datetime.now(timezone.utc)
    if when.tzinfo is None:
        # Asumimos UTC para timestamps naive: el navegador envía ISO-8601
        # con 'Z', pero protegemos a clientes menos cuidadosos.
        return when.replace(tzinfo=timezone.utc)
    return when.astimezone(timezone.utc)


def _check_tle_age(satellite: EarthSatellite, t: Time) -> tuple[float, bool]:
    """Devuelve (edad_en_días, stale) y rechaza TLEs demasiado viejos."""
    age_days = abs(float(t - satellite.epoch))
    if age_days > MAX_TLE_AGE_DAYS:
        raise TLETooOldError(
            f"El TLE tiene {age_days:.1f} días respecto al instante solicitado "
            f"(máximo permitido: {MAX_TLE_AGE_DAYS:.0f}). SGP4 acumula ~1-3 km "
            "de error por día; actualiza el TLE desde CelesTrak/Space-Track."
        )
    return age_days, age_days > STALE_TLE_AGE_DAYS


def _observer_position(observer: Observer) -> GeographicPosition:
    return wgs84.latlon(
        observer.latitude_deg,
        observer.longitude_deg,
        elevation_m=observer.altitude_m,
    )


def _raise_if_propagation_failed(satellite: EarthSatellite) -> None:
    error_code = satellite.model.error
    if error_code != 0:
        message = SGP4_ERRORS.get(error_code, f"código SGP4 desconocido ({error_code})")
        raise PropagationError(f"SGP4 falló al propagar la órbita: {message}")


def compute_position(
    line1: str,
    line2: str,
    observer: Observer,
    when: datetime | None = None,
    name: str = "SATELLITE",
) -> TopocentricPosition:
    """Posición topocéntrica (azimut, elevación, distancia) del satélite.

    ``when`` en UTC; si es ``None`` se usa el instante actual.
    """
    ts = _timescale()
    satellite = build_satellite(line1, line2, name)
    when_utc = _ensure_utc(when)
    t = ts.from_datetime(when_utc)
    age_days, stale = _check_tle_age(satellite, t)

    topos = _observer_position(observer)
    topocentric = (satellite - topos).at(t)
    _raise_if_propagation_failed(satellite)

    alt, az, distance = topocentric.altaz()

    # Velocidad radial: proyección del vector velocidad relativa sobre la
    # línea de visión observador→satélite.
    position_km = topocentric.position.km
    velocity_km_s = topocentric.velocity.km_per_s
    range_rate = float(
        np.dot(position_km, velocity_km_s) / np.linalg.norm(position_km)
    )

    geocentric = satellite.at(t)
    subpoint = wgs84.geographic_position_of(geocentric)

    return TopocentricPosition(
        timestamp=when_utc,
        azimuth_deg=float(az.degrees),
        elevation_deg=float(alt.degrees),
        range_km=float(distance.km),
        range_rate_km_s=range_rate,
        above_horizon=float(alt.degrees) > 0.0,
        satellite_latitude_deg=float(subpoint.latitude.degrees),
        satellite_longitude_deg=float(subpoint.longitude.degrees),
        satellite_altitude_km=float(subpoint.elevation.km),
        tle_age_days=age_days,
        stale_tle=stale,
    )


def predict_passes(
    line1: str,
    line2: str,
    observer: Observer,
    start: datetime | None = None,
    hours: float = 24.0,
    min_culmination_deg: float = DEFAULT_MIN_CULMINATION_DEG,
    name: str = "SATELLITE",
) -> PassPrediction:
    """Predice las ventanas de paso sobre el observador.

    Busca eventos rise/culminate/set respecto al horizonte geométrico (0°)
    y descarta los pases cuya elevación máxima no alcanza
    ``min_culmination_deg``.
    """
    ts = _timescale()
    satellite = build_satellite(line1, line2, name)
    start_utc = _ensure_utc(start)
    end_utc = start_utc + timedelta(hours=hours)

    t0 = ts.from_datetime(start_utc)
    t1 = ts.from_datetime(end_utc)
    # Validamos la edad en el extremo más lejano de la ventana: es ahí
    # donde la propagación SGP4 es menos confiable.
    age_days, stale = _check_tle_age(satellite, t1)

    topos = _observer_position(observer)
    times, events = satellite.find_events(topos, t0, t1, altitude_degrees=0.0)
    _raise_if_propagation_failed(satellite)

    difference = satellite - topos

    def altaz_at(t: Time) -> tuple[float, float]:
        position = difference.at(t)
        alt, az, _ = position.altaz()
        return float(alt.degrees), float(az.degrees)

    # Agrupar la secuencia plana de eventos (0=rise, 1=culminate, 2=set) en
    # pases individuales, tolerando pases truncados en los bordes de la
    # ventana (p. ej. el primer evento es 'culminate' o 'set' porque el
    # satélite ya estaba sobre el horizonte en t0).
    RISE, CULMINATE, SET = 0, 1, 2
    raw_passes: list[dict] = []
    current: dict = {}
    for t, event in zip(times, events):
        if event == RISE:
            if current:
                raw_passes.append(current)
            current = {"rise": t, "culminations": []}
        elif event == CULMINATE:
            current.setdefault("culminations", []).append(t)
        else:  # SET
            current["set"] = t
            raw_passes.append(current)
            current = {}
    if current:
        raw_passes.append(current)

    windows: list[PassWindow] = []
    for raw in raw_passes:
        rise_t: Time | None = raw.get("rise")
        set_t: Time | None = raw.get("set")
        culminations: list[Time] = raw.get("culminations", [])

        # Pase truncado sin culminación registrada: estimamos la elevación
        # máxima en los extremos disponibles de la ventana.
        candidates = culminations or [t for t in (rise_t, set_t, t0, t1) if t is not None]
        best_alt, best_az, best_t = -90.0, 0.0, candidates[0]
        for t in candidates:
            alt, az = altaz_at(t)
            if alt > best_alt:
                best_alt, best_az, best_t = alt, az, t

        if best_alt < min_culmination_deg:
            continue

        rise_az = altaz_at(rise_t)[1] if rise_t is not None else None
        set_az = altaz_at(set_t)[1] if set_t is not None else None
        duration = (
            (set_t.utc_datetime() - rise_t.utc_datetime()).total_seconds()
            if rise_t is not None and set_t is not None
            else None
        )

        windows.append(
            PassWindow(
                rise_time=rise_t.utc_datetime() if rise_t is not None else None,
                rise_azimuth_deg=rise_az,
                culmination_time=best_t.utc_datetime(),
                culmination_azimuth_deg=best_az,
                max_elevation_deg=best_alt,
                set_time=set_t.utc_datetime() if set_t is not None else None,
                set_azimuth_deg=set_az,
                duration_s=duration,
                truncated=rise_t is None or set_t is None,
            )
        )

    return PassPrediction(
        search_start=start_utc,
        search_end=end_utc,
        min_culmination_deg=min_culmination_deg,
        tle_age_days=age_days,
        stale_tle=stale,
        passes=windows,
    )

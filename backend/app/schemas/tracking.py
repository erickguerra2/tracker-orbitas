"""Contrato de la API de tracking (Pydantic v2).

Se usa POST con cuerpo JSON en lugar de query params: las líneas TLE
contienen espacios significativos, signos '+' y puntos que se corrompen
con facilidad al codificarlas en una URL, y el navegador reenvía las
coordenadas con alta frecuencia (no tiene sentido cachear por URL).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

# Precisión a la que se cuantizan las coordenadas del observador.
# 2 decimales ≈ 1.1 km: imperceptible para azimut/elevación de un satélite
# a cientos de km, pero estabiliza el jitter del GPS del navegador y
# permite usar las coordenadas como clave de caché.
COORDINATE_DECIMALS = 2


class TLEInput(BaseModel):
    """Two-Line Element set, tal como se obtiene de CelesTrak/Space-Track."""

    name: str = Field(default="SATELLITE", max_length=64)
    line1: str = Field(min_length=60, max_length=72, examples=[
        "1 25544U 98067A   24051.51610305  .00018603  00000+0  33412-3 0  9996"
    ])
    line2: str = Field(min_length=60, max_length=72, examples=[
        "2 25544  51.6401  86.9469 0004617  93.6643  17.0807 15.50113759439648"
    ])


class ObserverInput(BaseModel):
    """Coordenadas dinámicas enviadas por el navegador (Geolocation API)."""

    latitude: float = Field(ge=-90.0, le=90.0, description="Grados, WGS84")
    longitude: float = Field(ge=-180.0, le=180.0, description="Grados, WGS84")
    altitude_m: float = Field(
        default=0.0,
        ge=-450.0,  # Mar Muerto
        le=9000.0,  # por encima del Everest
        description="Altitud sobre el elipsoide en METROS (no km)",
    )

    @field_validator("latitude", "longitude", mode="after")
    @classmethod
    def _quantize(cls, value: float) -> float:
        return round(value, COORDINATE_DECIMALS)


class TrackingRequestBase(BaseModel):
    """Base común: el satélite se identifica por TLE manual O por NORAD ID.

    Con ``norad_id`` el backend resuelve el TLE automáticamente vía
    CelesTrak (con caché de 24 h y fallback de resiliencia). El campo
    ``tle`` se mantiene para usuarios avanzados que traen su propio TLE.
    """

    tle: Optional[TLEInput] = None
    norad_id: Optional[int] = Field(
        default=None, ge=1, le=999_999,
        description="Número de catálogo NORAD (p. ej. 25544 = ISS)",
        examples=[25544],
    )
    observer: ObserverInput

    @model_validator(mode="after")
    def _exactly_one_satellite_source(self) -> "TrackingRequestBase":
        if (self.tle is None) == (self.norad_id is None):
            raise ValueError(
                "Envía exactamente uno: 'norad_id' (resolución automática vía "
                "CelesTrak) o 'tle' (TLE manual)."
            )
        return self


class PositionRequest(TrackingRequestBase):
    timestamp: Optional[datetime] = Field(
        default=None,
        description="Instante UTC del cálculo; null = ahora",
    )

    @field_validator("timestamp", mode="after")
    @classmethod
    def _ensure_tz(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class SatelliteInfo(BaseModel):
    """Procedencia del TLE usado en el cálculo."""

    name: str
    norad_id: Optional[int] = None
    tle_source: str = Field(
        description="manual | celestrak | cache | stale_cache | emergency"
    )
    tle_fetched_at: Optional[datetime] = Field(
        default=None, description="Cuándo se descargó el TLE (null si es manual)"
    )


class PositionResponse(BaseModel):
    satellite: SatelliteInfo
    timestamp: datetime
    azimuth_deg: float
    elevation_deg: float
    range_km: float
    range_rate_km_s: float
    above_horizon: bool
    satellite_latitude_deg: float
    satellite_longitude_deg: float
    satellite_altitude_km: float
    tle_age_days: float
    stale_tle: bool


class PassesRequest(TrackingRequestBase):
    start: Optional[datetime] = Field(
        default=None, description="Inicio de la búsqueda en UTC; null = ahora"
    )
    hours: float = Field(
        default=24.0, gt=0.0, le=120.0,
        description="Tamaño de la ventana de búsqueda en horas",
    )
    min_culmination_deg: float = Field(
        default=10.0, ge=0.0, le=90.0,
        description="Elevación máxima mínima para reportar un pase",
    )

    @field_validator("start", mode="after")
    @classmethod
    def _ensure_tz(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class PassWindowResponse(BaseModel):
    rise_time: Optional[datetime]
    rise_azimuth_deg: Optional[float]
    culmination_time: datetime
    culmination_azimuth_deg: float
    max_elevation_deg: float
    set_time: Optional[datetime]
    set_azimuth_deg: Optional[float]
    duration_s: Optional[float]
    truncated: bool


class PassesResponse(BaseModel):
    satellite: SatelliteInfo
    search_start: datetime
    search_end: datetime
    min_culmination_deg: float
    tle_age_days: float
    stale_tle: bool
    passes: list[PassWindowResponse]

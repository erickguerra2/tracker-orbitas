"""Endpoints de tracking.

Los handlers son funciones síncronas (``def``, no ``async def``) a
propósito: la propagación SGP4, la búsqueda de eventos y el fetch a
CelesTrak son bloqueantes, y FastAPI ejecuta los handlers síncronos en su
threadpool, evitando bloquear el event loop para el resto de clientes.
"""

from dataclasses import dataclass

from fastapi import APIRouter

from app.schemas.tracking import (
    PassesRequest,
    PassesResponse,
    PositionRequest,
    PositionResponse,
    SatelliteInfo,
    TrackingRequestBase,
)
from app.services import orbital_engine, tle_provider
from app.services.orbital_engine import Observer

router = APIRouter(prefix="/tracking", tags=["tracking"])


@dataclass(frozen=True)
class _ResolvedTLE:
    line1: str
    line2: str
    info: SatelliteInfo


def _resolve_tle(payload: TrackingRequestBase) -> _ResolvedTLE:
    """TLE manual del body, o resolución automática vía tle_provider."""
    if payload.tle is not None:
        return _ResolvedTLE(
            line1=payload.tle.line1,
            line2=payload.tle.line2,
            info=SatelliteInfo(name=payload.tle.name, tle_source="manual"),
        )
    record = tle_provider.get_tle(payload.norad_id)
    return _ResolvedTLE(
        line1=record.line1,
        line2=record.line2,
        info=SatelliteInfo(
            name=record.name,
            norad_id=record.norad_id,
            tle_source=record.source,
            tle_fetched_at=record.fetched_at,
        ),
    )


def _observer_from(payload: TrackingRequestBase) -> Observer:
    return Observer(
        latitude_deg=payload.observer.latitude,
        longitude_deg=payload.observer.longitude,
        altitude_m=payload.observer.altitude_m,
    )


@router.post("/position", response_model=PositionResponse)
def get_position(payload: PositionRequest) -> PositionResponse:
    """Posición actual del satélite relativa al observador."""
    resolved = _resolve_tle(payload)
    result = orbital_engine.compute_position(
        line1=resolved.line1,
        line2=resolved.line2,
        observer=_observer_from(payload),
        when=payload.timestamp,
        name=resolved.info.name,
    )
    return PositionResponse(satellite=resolved.info, **result.__dict__)


@router.post("/passes", response_model=PassesResponse)
def get_passes(payload: PassesRequest) -> PassesResponse:
    """Próximas ventanas de paso visibles sobre la ubicación del observador."""
    resolved = _resolve_tle(payload)
    prediction = orbital_engine.predict_passes(
        line1=resolved.line1,
        line2=resolved.line2,
        observer=_observer_from(payload),
        start=payload.start,
        hours=payload.hours,
        min_culmination_deg=payload.min_culmination_deg,
        name=resolved.info.name,
    )
    return PassesResponse(
        satellite=resolved.info,
        search_start=prediction.search_start,
        search_end=prediction.search_end,
        min_culmination_deg=prediction.min_culmination_deg,
        tle_age_days=prediction.tle_age_days,
        stale_tle=prediction.stale_tle,
        passes=[window.__dict__ for window in prediction.passes],
    )

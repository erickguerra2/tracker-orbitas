"""Endpoints de tracking.

Los handlers son funciones síncronas (``def``, no ``async def``) a
propósito: la propagación SGP4 y la búsqueda de eventos son CPU-bound, y
FastAPI ejecuta los handlers síncronos en su threadpool, evitando bloquear
el event loop para el resto de clientes.
"""

from fastapi import APIRouter

from app.schemas.tracking import (
    PassesRequest,
    PassesResponse,
    PositionRequest,
    PositionResponse,
)
from app.services import orbital_engine
from app.services.orbital_engine import Observer

router = APIRouter(prefix="/tracking", tags=["tracking"])


def _observer_from(payload: PositionRequest | PassesRequest) -> Observer:
    return Observer(
        latitude_deg=payload.observer.latitude,
        longitude_deg=payload.observer.longitude,
        altitude_m=payload.observer.altitude_m,
    )


@router.post("/position", response_model=PositionResponse)
def get_position(payload: PositionRequest) -> PositionResponse:
    """Posición actual del satélite relativa al observador."""
    result = orbital_engine.compute_position(
        line1=payload.tle.line1,
        line2=payload.tle.line2,
        observer=_observer_from(payload),
        when=payload.timestamp,
        name=payload.tle.name,
    )
    return PositionResponse(**result.__dict__)


@router.post("/passes", response_model=PassesResponse)
def get_passes(payload: PassesRequest) -> PassesResponse:
    """Próximas ventanas de paso visibles sobre la ubicación del observador."""
    prediction = orbital_engine.predict_passes(
        line1=payload.tle.line1,
        line2=payload.tle.line2,
        observer=_observer_from(payload),
        start=payload.start,
        hours=payload.hours,
        min_culmination_deg=payload.min_culmination_deg,
        name=payload.tle.name,
    )
    return PassesResponse(
        search_start=prediction.search_start,
        search_end=prediction.search_end,
        min_culmination_deg=prediction.min_culmination_deg,
        tle_age_days=prediction.tle_age_days,
        stale_tle=prediction.stale_tle,
        passes=[window.__dict__ for window in prediction.passes],
    )

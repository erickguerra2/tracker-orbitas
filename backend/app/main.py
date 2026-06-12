"""Punto de entrada de la aplicación FastAPI.

Arranque local:
    uvicorn app.main:app --reload --port 8000
"""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.routes.tracking import router as tracking_router
from app.services.orbital_engine import (
    PropagationError,
    TLEError,
    TLETooOldError,
)
from app.services.tle_provider import TLENotFoundError, TLEUnavailableError

app = FastAPI(
    title="Tracker Orbitas API",
    description="Telemetría orbital y predicción de pases de satélites (SGP4/Skyfield).",
    version="0.1.0",
)

# En desarrollo el frontend React (Vite/CRA) corre en otro puerto.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tracking_router, prefix="/api/v1")


@app.exception_handler(TLETooOldError)
def tle_too_old_handler(_: Request, exc: TLETooOldError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "tle_too_old", "detail": str(exc)})


@app.exception_handler(TLEError)
def tle_error_handler(_: Request, exc: TLEError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "invalid_tle", "detail": str(exc)})


@app.exception_handler(PropagationError)
def propagation_error_handler(_: Request, exc: PropagationError) -> JSONResponse:
    # 409: el TLE es sintácticamente válido pero la órbita no es propagable
    # (satélite decaído, perigeo bajo tierra, etc.).
    return JSONResponse(status_code=409, content={"error": "propagation_failed", "detail": str(exc)})


@app.exception_handler(TLENotFoundError)
def tle_not_found_handler(_: Request, exc: TLENotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "unknown_satellite", "detail": str(exc)})


@app.exception_handler(TLEUnavailableError)
def tle_unavailable_handler(_: Request, exc: TLEUnavailableError) -> JSONResponse:
    # 503: fallo transitorio de la fuente de TLEs sin fallback aplicable.
    # El cliente puede reintentar o enviar un TLE manual en el campo 'tle'.
    return JSONResponse(status_code=503, content={"error": "tle_unavailable", "detail": str(exc)})


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}

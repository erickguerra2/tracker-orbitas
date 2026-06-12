"""Proveedor de TLEs: descarga de CelesTrak, caché local y fallback.

Cadena de resolución para un NORAD ID (de más fresco a más degradado):

1. Caché local (memoria + JSON en disco) con menos de 24 h  -> ``cache``
2. Descarga en vivo de la API GP de CelesTrak               -> ``celestrak``
3. Caché vencida, de cualquier edad (CelesTrak caído)       -> ``stale_cache``
4. TLE de emergencia empaquetado en ``app/data/``           -> ``emergency``
5. ``TLEUnavailableError`` (la API lo mapea a 503, nunca a un 500 crudo)

El campo ``source`` del ``TLERecord`` viaja hasta la respuesta HTTP para que
el frontend pueda avisar al usuario cuando está viendo datos degradados.
Nótese que el motor orbital aplica su propia guardia física aparte: aunque
este módulo entregue un TLE de emergencia, ``orbital_engine`` lo marcará
``stale_tle`` (>14 días) o lo rechazará (>30 días) según su época — un TLE
viejo produce posiciones erróneas en silencio, y eso es peor que un error.

La caché en disco se comparte entre reinicios del proceso; la ruta se
configura con la variable de entorno ``TLE_CACHE_PATH`` (por defecto, un
archivo en el directorio temporal del sistema).

Refrescar los TLEs de emergencia (requiere internet, idealmente en CI o
al momento del deploy)::

    python -m app.services.tle_provider 25544 28654 33591
"""

from __future__ import annotations

import json
import os
import tempfile
import threading
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

CELESTRAK_GP_URL = "https://celestrak.org/NORAD/elements/gp.php"
HTTP_TIMEOUT_S = 10.0
CACHE_TTL = timedelta(hours=24)

# Satélites de interés común (referencia para el frontend y para el CLI de
# refresco). CelesTrak también acepta GROUP=stations|noaa|weather|cubesat.
WELL_KNOWN_SATELLITES = {
    25544: "ISS (ZARYA)",
    28654: "NOAA 18",
    33591: "NOAA 19",
}

_EMERGENCY_FILE = Path(__file__).resolve().parent.parent / "data" / "emergency_tles.json"

_lock = threading.Lock()
_memory: dict[int, "TLERecord"] = {}
_loaded = False


class TLEProviderError(RuntimeError):
    """Error base del proveedor de TLEs."""


class TLENotFoundError(TLEProviderError):
    """CelesTrak respondió pero no conoce ese NORAD ID o grupo."""


class TLEUnavailableError(TLEProviderError):
    """Sin red, sin caché y sin TLE de emergencia para ese satélite."""


@dataclass(frozen=True)
class TLERecord:
    norad_id: int
    name: str
    line1: str
    line2: str
    fetched_at: datetime
    source: str = "celestrak"


def _cache_path() -> Path:
    default = Path(tempfile.gettempdir()) / "tracker_orbitas_tle_cache.json"
    return Path(os.getenv("TLE_CACHE_PATH", str(default)))


def _download(params: dict) -> str:
    """Única función que toca la red; los tests la monkeypatchean."""
    response = httpx.get(CELESTRAK_GP_URL, params=params, timeout=HTTP_TIMEOUT_S)
    response.raise_for_status()
    return response.text


def _parse_tle_text(text: str, fetched_at: datetime) -> list[TLERecord]:
    """Parsea la respuesta TLE de CelesTrak (formato 3LE o 2LE)."""
    if "no gp data found" in text.lower():
        return []
    lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    records: list[TLERecord] = []
    name = ""
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("1 ") and i + 1 < len(lines) and lines[i + 1].startswith("2 "):
            line1, line2 = line, lines[i + 1]
            try:
                norad_id = int(line1[2:7])
            except ValueError:
                i += 1
                continue
            records.append(
                TLERecord(
                    norad_id=norad_id,
                    name=name or WELL_KNOWN_SATELLITES.get(norad_id, f"NORAD {norad_id}"),
                    line1=line1,
                    line2=line2,
                    fetched_at=fetched_at,
                )
            )
            name = ""
            i += 2
        else:
            name = line  # línea 0 del 3LE: nombre del satélite
            i += 1
    return records


def _ensure_loaded_locked() -> None:
    """Carga la caché de disco a memoria. Llamar con ``_lock`` tomado."""
    global _loaded
    if _loaded:
        return
    _loaded = True
    path = _cache_path()
    if not path.exists():
        return
    try:
        raw = json.loads(path.read_text())
        for key, entry in raw.items():
            record = TLERecord(
                norad_id=int(key),
                name=entry["name"],
                line1=entry["line1"],
                line2=entry["line2"],
                fetched_at=datetime.fromisoformat(entry["fetched_at"]),
                source="cache",
            )
            _memory[record.norad_id] = record
    except (json.JSONDecodeError, KeyError, ValueError, OSError):
        # Caché corrupta: se descarta en silencio y se reconstruye al
        # siguiente fetch exitoso. Nunca debe tumbar una request.
        _memory.clear()


def _persist_locked() -> None:
    """Escritura atómica de la caché a disco. Llamar con ``_lock`` tomado."""
    path = _cache_path()
    payload = {
        str(record.norad_id): {
            "name": record.name,
            "line1": record.line1,
            "line2": record.line2,
            "fetched_at": record.fetched_at.isoformat(),
        }
        for record in _memory.values()
    }
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2))
        os.replace(tmp, path)
    except OSError:
        # Disco de solo lectura o sin espacio: la caché en memoria sigue
        # funcionando; perder la persistencia no justifica fallar la request.
        pass


def _store(records: list[TLERecord]) -> None:
    with _lock:
        _ensure_loaded_locked()
        for record in records:
            _memory[record.norad_id] = record
        _persist_locked()


def _emergency_tles() -> dict[int, TLERecord]:
    try:
        raw = json.loads(_EMERGENCY_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    result: dict[int, TLERecord] = {}
    for key, entry in raw.items():
        result[int(key)] = TLERecord(
            norad_id=int(key),
            name=entry["name"],
            line1=entry["line1"],
            line2=entry["line2"],
            fetched_at=datetime.fromisoformat(entry["fetched_at"]),
            source="emergency",
        )
    return result


def get_tle(norad_id: int) -> TLERecord:
    """Resuelve el TLE de un satélite siguiendo la cadena de fallback."""
    now = datetime.now(timezone.utc)
    with _lock:
        _ensure_loaded_locked()
        cached = _memory.get(norad_id)

    if cached is not None and now - cached.fetched_at < CACHE_TTL:
        return replace(cached, source="cache")

    try:
        text = _download({"CATNR": norad_id, "FORMAT": "TLE"})
        records = _parse_tle_text(text, fetched_at=now)
        if not records:
            raise TLENotFoundError(
                f"CelesTrak no tiene datos GP para el NORAD ID {norad_id}."
            )
        _store(records)
        return records[0]
    except TLENotFoundError:
        # El ID no existe: no tiene sentido degradar a caché/emergencia.
        raise
    except Exception:
        if cached is not None:
            return replace(cached, source="stale_cache")
        emergency = _emergency_tles().get(norad_id)
        if emergency is not None:
            return emergency
        raise TLEUnavailableError(
            f"No se pudo obtener el TLE del NORAD ID {norad_id}: CelesTrak no "
            "responde y no hay caché ni TLE de emergencia para ese satélite."
        ) from None


def refresh_group(group: str) -> list[TLERecord]:
    """Descarga y cachea un grupo del catálogo de CelesTrak.

    Grupos útiles: ``stations`` (ISS y compañía), ``noaa``, ``weather``,
    ``cubesat``, ``active``. Pensado para un job de precalentamiento de
    caché, no para la ruta crítica de una request.
    """
    now = datetime.now(timezone.utc)
    text = _download({"GROUP": group, "FORMAT": "TLE"})
    records = _parse_tle_text(text, fetched_at=now)
    if not records:
        raise TLENotFoundError(f"CelesTrak no devolvió TLEs para el grupo '{group}'.")
    _store(records)
    return records


def reset_cache() -> None:
    """Vacía la caché en memoria (para tests)."""
    global _loaded
    with _lock:
        _memory.clear()
        _loaded = False


if __name__ == "__main__":
    # Regenera app/data/emergency_tles.json con TLEs frescos de CelesTrak.
    # Uso: python -m app.services.tle_provider [norad_id ...]
    import sys

    ids = [int(arg) for arg in sys.argv[1:]] or list(WELL_KNOWN_SATELLITES)
    fresh: dict[str, dict] = {}
    for norad_id in ids:
        record = get_tle(norad_id)
        fresh[str(record.norad_id)] = {
            k: v.isoformat() if isinstance(v, datetime) else v
            for k, v in asdict(record).items()
            if k in {"name", "line1", "line2", "fetched_at"}
        }
        print(f"  {record.norad_id}: {record.name} ({record.source})")
    _EMERGENCY_FILE.parent.mkdir(parents=True, exist_ok=True)
    _EMERGENCY_FILE.write_text(json.dumps(fresh, indent=2) + "\n")
    print(f"Escrito {_EMERGENCY_FILE} con {len(fresh)} satélites.")

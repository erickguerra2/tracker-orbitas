"""Tests del tle_provider y de su integración con las rutas.

La función ``tle_provider._download`` es el único punto que toca la red,
así que se monkeypatchea para simular CelesTrak vivo, caído o sin datos.
"""

import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import tle_provider
from app.services.tle_provider import (
    TLENotFoundError,
    TLEUnavailableError,
    get_tle,
    refresh_group,
)

# Mismo TLE real de la ISS que en test_orbital_engine (época: 2024-02-20).
TLE_NAME = "ISS (ZARYA)"
TLE_LINE1 = "1 25544U 98067A   24051.51610305  .00018603  00000+0  33412-3 0  9996"
TLE_LINE2 = "2 25544  51.6401  86.9469 0004617  93.6643  17.0807 15.50113759439648"
TLE_EPOCH = datetime(2024, 2, 20, 12, 23, 11, tzinfo=timezone.utc)

CELESTRAK_3LE = f"{TLE_NAME}\n{TLE_LINE1}\n{TLE_LINE2}\n"

NOAA18_LINE1 = "1 28654U 05018A   24051.50000000  .00000200  00000+0  12000-3 0  9991"
NOAA18_LINE2 = "2 28654  98.8700 100.0000 0014000  60.0000 300.0000 14.13000000970000"
CELESTRAK_GROUP = f"{CELESTRAK_3LE}NOAA 18\n{NOAA18_LINE1}\n{NOAA18_LINE2}\n"


@pytest.fixture(autouse=True)
def isolated_cache(tmp_path, monkeypatch):
    """Cada test usa una caché de disco propia y memoria limpia."""
    monkeypatch.setenv("TLE_CACHE_PATH", str(tmp_path / "tle_cache.json"))
    tle_provider.reset_cache()
    yield
    tle_provider.reset_cache()


def mock_celestrak(monkeypatch, response_text=CELESTRAK_3LE):
    """CelesTrak vivo; devuelve un contador de llamadas reales a la red."""
    calls = {"count": 0}

    def fake_download(params):
        calls["count"] += 1
        return response_text

    monkeypatch.setattr(tle_provider, "_download", fake_download)
    return calls


def mock_celestrak_down(monkeypatch):
    def fake_download(params):
        raise httpx.ConnectError("simulated network failure")

    monkeypatch.setattr(tle_provider, "_download", fake_download)


class TestFetchAndCache:
    def test_live_fetch_parses_and_persists(self, monkeypatch, tmp_path):
        calls = mock_celestrak(monkeypatch)
        record = get_tle(25544)
        assert record.source == "celestrak"
        assert record.name == TLE_NAME
        assert record.line1 == TLE_LINE1
        assert calls["count"] == 1
        # Persistido en disco para sobrevivir reinicios del proceso.
        on_disk = json.loads((tmp_path / "tle_cache.json").read_text())
        assert on_disk["25544"]["line2"] == TLE_LINE2

    def test_fresh_cache_avoids_network(self, monkeypatch):
        calls = mock_celestrak(monkeypatch)
        get_tle(25544)
        record = get_tle(25544)
        assert record.source == "cache"
        assert calls["count"] == 1  # la segunda llamada no tocó la red

    def test_disk_cache_survives_process_restart(self, monkeypatch):
        calls = mock_celestrak(monkeypatch)
        get_tle(25544)
        tle_provider.reset_cache()  # simula reinicio: memoria vacía
        record = get_tle(25544)
        assert record.source == "cache"
        assert calls["count"] == 1

    def test_expired_cache_triggers_refetch(self, monkeypatch, tmp_path):
        old = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
        (tmp_path / "tle_cache.json").write_text(json.dumps({
            "25544": {"name": TLE_NAME, "line1": TLE_LINE1,
                      "line2": TLE_LINE2, "fetched_at": old}
        }))
        calls = mock_celestrak(monkeypatch)
        record = get_tle(25544)
        assert record.source == "celestrak"
        assert calls["count"] == 1

    def test_corrupt_disk_cache_is_discarded(self, monkeypatch, tmp_path):
        (tmp_path / "tle_cache.json").write_text("{not valid json")
        calls = mock_celestrak(monkeypatch)
        record = get_tle(25544)
        assert record.source == "celestrak"
        assert calls["count"] == 1


class TestFallbackChain:
    def test_stale_cache_used_when_celestrak_down(self, monkeypatch, tmp_path):
        old = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        (tmp_path / "tle_cache.json").write_text(json.dumps({
            "25544": {"name": TLE_NAME, "line1": TLE_LINE1,
                      "line2": TLE_LINE2, "fetched_at": old}
        }))
        mock_celestrak_down(monkeypatch)
        record = get_tle(25544)
        assert record.source == "stale_cache"
        assert record.line1 == TLE_LINE1

    def test_emergency_tle_when_no_cache(self, monkeypatch):
        mock_celestrak_down(monkeypatch)
        record = get_tle(25544)  # la ISS está en emergency_tles.json
        assert record.source == "emergency"
        assert record.norad_id == 25544

    def test_unavailable_when_no_fallback_exists(self, monkeypatch):
        mock_celestrak_down(monkeypatch)
        with pytest.raises(TLEUnavailableError):
            get_tle(424242)

    def test_unknown_satellite_does_not_degrade(self, monkeypatch):
        mock_celestrak(monkeypatch, response_text="No GP data found\n")
        with pytest.raises(TLENotFoundError):
            get_tle(99999)


class TestGroupRefresh:
    def test_group_fetch_caches_all_members(self, monkeypatch):
        calls = mock_celestrak(monkeypatch, response_text=CELESTRAK_GROUP)
        records = refresh_group("noaa")
        assert {r.norad_id for r in records} == {25544, 28654}
        assert get_tle(28654).source == "cache"  # ya cacheado por el grupo
        assert calls["count"] == 1


class TestRoutesIntegration:
    @pytest.fixture()
    def client(self):
        return TestClient(app, raise_server_exceptions=False)

    def _payload(self, **extra):
        return {
            "norad_id": 25544,
            "observer": {"latitude": 14.6349, "longitude": -90.5069, "altitude_m": 1500},
            "timestamp": TLE_EPOCH.isoformat(),
            **extra,
        }

    def test_position_by_norad_id(self, client, monkeypatch):
        mock_celestrak(monkeypatch)
        response = client.post("/api/v1/tracking/position", json=self._payload())
        assert response.status_code == 200
        body = response.json()
        assert body["satellite"]["tle_source"] == "celestrak"
        assert body["satellite"]["name"] == TLE_NAME
        assert body["satellite"]["norad_id"] == 25544
        assert -90 <= body["elevation_deg"] <= 90

    def test_passes_by_norad_id_with_degraded_source(self, client, monkeypatch, tmp_path):
        old = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        (tmp_path / "tle_cache.json").write_text(json.dumps({
            "25544": {"name": TLE_NAME, "line1": TLE_LINE1,
                      "line2": TLE_LINE2, "fetched_at": old}
        }))
        mock_celestrak_down(monkeypatch)
        payload = self._payload(start=TLE_EPOCH.isoformat(), hours=24)
        payload.pop("timestamp")
        response = client.post("/api/v1/tracking/passes", json=payload)
        assert response.status_code == 200
        assert response.json()["satellite"]["tle_source"] == "stale_cache"

    def test_manual_tle_still_works(self, client):
        payload = self._payload(
            tle={"name": TLE_NAME, "line1": TLE_LINE1, "line2": TLE_LINE2}
        )
        payload.pop("norad_id")
        response = client.post("/api/v1/tracking/position", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["satellite"]["tle_source"] == "manual"
        assert body["satellite"]["tle_fetched_at"] is None

    def test_both_tle_and_norad_id_rejected(self, client):
        payload = self._payload(
            tle={"name": TLE_NAME, "line1": TLE_LINE1, "line2": TLE_LINE2}
        )
        response = client.post("/api/v1/tracking/position", json=payload)
        assert response.status_code == 422

    def test_neither_tle_nor_norad_id_rejected(self, client):
        payload = self._payload()
        payload.pop("norad_id")
        response = client.post("/api/v1/tracking/position", json=payload)
        assert response.status_code == 422

    def test_unknown_satellite_returns_404(self, client, monkeypatch):
        mock_celestrak(monkeypatch, response_text="No GP data found\n")
        response = client.post(
            "/api/v1/tracking/position", json=self._payload(norad_id=99999)
        )
        assert response.status_code == 404
        assert response.json()["error"] == "unknown_satellite"

    def test_celestrak_down_without_fallback_returns_503(self, client, monkeypatch):
        mock_celestrak_down(monkeypatch)
        response = client.post(
            "/api/v1/tracking/position", json=self._payload(norad_id=424242)
        )
        assert response.status_code == 503
        assert response.json()["error"] == "tle_unavailable"

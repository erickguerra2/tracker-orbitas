"""Tests del motor orbital y del contrato de la API.

Se usa un TLE real de la ISS y se evalúa cerca de su época, de modo que
los tests sean deterministas y no dependan de descargar TLEs frescos.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.orbital_engine import (
    Observer,
    TLEError,
    TLETooOldError,
    compute_position,
    predict_passes,
)

# ISS (ZARYA) — época: día 51.516 de 2024 (20 de febrero de 2024).
TLE_NAME = "ISS (ZARYA)"
TLE_LINE1 = "1 25544U 98067A   24051.51610305  .00018603  00000+0  33412-3 0  9996"
TLE_LINE2 = "2 25544  51.6401  86.9469 0004617  93.6643  17.0807 15.50113759439648"
TLE_EPOCH = datetime(2024, 2, 20, 12, 23, 11, tzinfo=timezone.utc)

# Observador de prueba: Ciudad de Guatemala.
OBSERVER = Observer(latitude_deg=14.63, longitude_deg=-90.51, altitude_m=1500.0)


class TestComputePosition:
    def test_returns_valid_topocentric_coordinates(self):
        result = compute_position(TLE_LINE1, TLE_LINE2, OBSERVER, when=TLE_EPOCH)
        assert 0.0 <= result.azimuth_deg < 360.0
        assert -90.0 <= result.elevation_deg <= 90.0
        # La ISS orbita a ~420 km: la distancia oblicua nunca baja de eso.
        assert result.range_km > 400.0
        assert 350.0 < result.satellite_altitude_km < 500.0
        assert result.tle_age_days < 1.0
        assert result.stale_tle is False

    def test_naive_datetime_is_treated_as_utc(self):
        naive = TLE_EPOCH.replace(tzinfo=None)
        aware = compute_position(TLE_LINE1, TLE_LINE2, OBSERVER, when=TLE_EPOCH)
        assumed = compute_position(TLE_LINE1, TLE_LINE2, OBSERVER, when=naive)
        assert assumed.azimuth_deg == pytest.approx(aware.azimuth_deg)

    def test_rejects_stale_tle(self):
        far_future = TLE_EPOCH + timedelta(days=60)
        with pytest.raises(TLETooOldError):
            compute_position(TLE_LINE1, TLE_LINE2, OBSERVER, when=far_future)

    def test_rejects_malformed_tle(self):
        with pytest.raises(TLEError):
            compute_position("garbage", "also garbage", OBSERVER, when=TLE_EPOCH)


class TestPredictPasses:
    def test_finds_passes_and_filters_by_culmination(self):
        all_passes = predict_passes(
            TLE_LINE1, TLE_LINE2, OBSERVER,
            start=TLE_EPOCH, hours=48.0, min_culmination_deg=0.0,
        )
        filtered = predict_passes(
            TLE_LINE1, TLE_LINE2, OBSERVER,
            start=TLE_EPOCH, hours=48.0, min_culmination_deg=10.0,
        )
        # En 48 h la ISS cruza el horizonte de una latitud media varias veces.
        assert len(all_passes.passes) > 0
        assert len(filtered.passes) <= len(all_passes.passes)
        for window in filtered.passes:
            assert window.max_elevation_deg >= 10.0

    def test_pass_windows_are_chronologically_consistent(self):
        prediction = predict_passes(
            TLE_LINE1, TLE_LINE2, OBSERVER, start=TLE_EPOCH, hours=48.0
        )
        for window in prediction.passes:
            if window.rise_time and window.set_time:
                assert window.rise_time < window.culmination_time < window.set_time
                assert window.duration_s == pytest.approx(
                    (window.set_time - window.rise_time).total_seconds()
                )


class TestAPI:
    @pytest.fixture()
    def client(self):
        return TestClient(app)

    def _payload(self, **extra):
        return {
            "tle": {"name": TLE_NAME, "line1": TLE_LINE1, "line2": TLE_LINE2},
            "observer": {"latitude": 14.6349, "longitude": -90.5069, "altitude_m": 1500},
            **extra,
        }

    def test_position_endpoint(self, client):
        response = client.post(
            "/api/v1/tracking/position",
            json=self._payload(timestamp=TLE_EPOCH.isoformat()),
        )
        assert response.status_code == 200
        body = response.json()
        assert {"azimuth_deg", "elevation_deg", "range_km"} <= body.keys()

    def test_passes_endpoint(self, client):
        response = client.post(
            "/api/v1/tracking/passes",
            json=self._payload(start=TLE_EPOCH.isoformat(), hours=48),
        )
        assert response.status_code == 200
        body = response.json()
        assert body["min_culmination_deg"] == 10.0
        assert isinstance(body["passes"], list)

    def test_invalid_tle_returns_422(self, client):
        payload = self._payload(timestamp=TLE_EPOCH.isoformat())
        payload["tle"]["line1"] = "1 " + "x" * 66
        response = client.post("/api/v1/tracking/position", json=payload)
        assert response.status_code == 422
        assert response.json()["error"] == "invalid_tle"

    def test_out_of_range_latitude_returns_422(self, client):
        payload = self._payload(timestamp=TLE_EPOCH.isoformat())
        payload["observer"]["latitude"] = 123.0
        response = client.post("/api/v1/tracking/position", json=payload)
        assert response.status_code == 422

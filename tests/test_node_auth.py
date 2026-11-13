import os

os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
import main


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(name="client")
def client_fixture():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    def override_get_db():
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[main.get_db] = override_get_db
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def register_and_login(client: TestClient) -> str:
    response = client.post(
        "/api/user",
        json={"username": "pijus", "email": "pijus@example.com", "password": "S3curePass!"},
    )
    assert response.status_code == 201
    response = client.post(
        "/api/auth/login",
        json={"email": "pijus@example.com", "password": "S3curePass!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_create_node_requires_token(client):
    response = client.post("/api/node", json={"node_name": "Pi 5"})
    assert response.status_code == 401


def test_create_node_with_token(client):
    token = register_and_login(client)
    response = client.post(
        "/api/node",
        json={"node_name": "Pi 5", "latitude": 53.35, "longitude": -6.26},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["node_name"] == "Pi 5"
    assert body["user_id"] == 1
    assert body["status"] == "inactive"


def test_ingest_reading_requires_token(client):
    token = register_and_login(client)
    response = client.post(
        "/api/node",
        json={"node_name": "Pi 5"},
        headers={"Authorization": f"Bearer {token}"},
    )
    node_id = response.json()["node_id"]
    response = client.post(
        f"/api/node/{node_id}/reading",
        json={"temperature": 21.5, "humidity": 48.0},
    )
    assert response.status_code == 401


def test_ingest_reading_with_token(client):
    token = register_and_login(client)
    response = client.post(
        "/api/node",
        json={"node_name": "Pi 5"},
        headers={"Authorization": f"Bearer {token}"},
    )
    node_id = response.json()["node_id"]
    response = client.post(
        f"/api/node/{node_id}/reading",
        json={"temperature": 21.5, "humidity": 48.0, "pressure": 1013.2, "motion_detected": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    assert response.json()["node_id"] == node_id
    node = client.get(f"/api/node/{node_id}").json()
    assert node["status"] == "active"


def test_ingest_reading_for_other_users_node(client):
    token = register_and_login(client)
    response = client.post(
        "/api/node",
        json={"node_name": "Pi 5"},
        headers={"Authorization": f"Bearer {token}"},
    )
    node_id = response.json()["node_id"]
    client.post(
        "/api/user",
        json={"username": "raivis", "email": "raivis@example.com", "password": "S3curePass!"},
    )
    other_token = client.post(
        "/api/auth/login",
        json={"email": "raivis@example.com", "password": "S3curePass!"},
    ).json()["access_token"]
    response = client.post(
        f"/api/node/{node_id}/reading",
        json={"temperature": 21.5},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 403


def test_heartbeat_updates_last_seen(client):
    token = register_and_login(client)
    response = client.post(
        "/api/node",
        json={"node_name": "Pi 5"},
        headers={"Authorization": f"Bearer {token}"},
    )
    node_id = response.json()["node_id"]
    response = client.post(
        f"/api/node/{node_id}/heartbeat",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active"
    assert body["last_seen"] is not None


def test_readings_support_scoping_and_limit(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    node_one = client.post(
        "/api/node", json={"node_name": "Pi 5"}, headers=headers
    ).json()["node_id"]
    node_two = client.post(
        "/api/node", json={"node_name": "Pi Zero"}, headers=headers
    ).json()["node_id"]

    for temperature in (20.0, 21.0, 22.0):
        client.post(
            f"/api/node/{node_one}/reading",
            json={"temperature": temperature, "humidity": 48.0},
            headers=headers,
        )
    for temperature in (23.0, 24.0):
        client.post(
            f"/api/node/{node_two}/reading",
            json={"temperature": temperature, "humidity": 50.0},
            headers=headers,
        )

    response = client.get(f"/api/readings?node_id={node_one}&limit=2")
    assert response.status_code == 200
    assert len(response.json()) == 2
    assert all(reading["node_id"] == node_one for reading in response.json())

    response = client.get("/api/readings?user_id=1&limit=10")
    assert response.status_code == 200
    assert len(response.json()) == 5

    assert client.get("/api/readings?limit=0").status_code == 422


def test_demo_mode_activation(client, monkeypatch):
    monkeypatch.delenv("DEMO_MODE_KEY", raising=False)
    assert client.get("/demo?key=anything", follow_redirects=False).status_code == 404

    monkeypatch.setenv("DEMO_MODE_KEY", "demo-secret")
    assert client.get("/demo?key=wrong", follow_redirects=False).status_code == 404

    response = client.get("/demo?key=demo-secret", follow_redirects=False)
    assert response.status_code == 303
    assert "viq_demo" in response.cookies

    response = client.get("/app")
    assert 'data-demo="true"' in response.text

    response = client.get("/demo/exit", follow_redirects=False)
    assert response.status_code == 303

    response = client.get("/app")
    assert 'data-demo="false"' in response.text


def test_diagnostics_support_scoping_and_limit(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    node_one = client.post(
        "/api/node", json={"node_name": "Pi 5"}, headers=headers
    ).json()["node_id"]
    node_two = client.post(
        "/api/node", json={"node_name": "Pi Zero"}, headers=headers
    ).json()["node_id"]

    for uptime in (100, 200):
        client.post(
            f"/api/node/{node_one}/diagnostic",
            json={"uptime": uptime, "wifi_connected": True},
            headers=headers,
        )
    client.post(
        f"/api/node/{node_two}/diagnostic",
        json={"uptime": 300, "wifi_connected": False},
        headers=headers,
    )

    response = client.get(f"/api/diagnostics?node_id={node_one}&limit=1")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["node_id"] == node_one

    response = client.get("/api/diagnostics?user_id=1&limit=10")
    assert response.status_code == 200
    assert len(response.json()) == 3

    assert client.get("/api/diagnostics?limit=0").status_code == 422


def test_node_targets_from_preset_and_crud(client):
    token = register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        "/api/node",
        json={"node_name": "Beardie", "targets": {"preset_key": "bearded_dragon"}},
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    node_id = body["node_id"]
    targets = body["targets"]
    assert targets is not None
    assert targets["preset_key"] == "bearded_dragon"
    assert targets["preset_name"] == "Bearded Dragon"
    assert float(targets["temperature_min"]) == 28
    assert float(targets["temperature_max"]) == 38
    assert float(targets["humidity_min"]) == 30
    assert float(targets["humidity_max"]) == 50
    assert float(targets["pressure_min"]) == 990
    assert float(targets["pressure_max"]) == 1030

    listed = client.get("/api/nodes").json()
    listed_node = next(item for item in listed if item["node_id"] == node_id)
    assert listed_node["targets"]["preset_name"] == "Bearded Dragon"

    response = client.put(
        f"/api/node/{node_id}/targets",
        json={
            "temperature_min": 26,
            "temperature_max": 30,
            "humidity_min": 40,
            "humidity_max": 55,
            "pressure_min": 995,
            "pressure_max": 1025,
        },
        headers=headers,
    )
    assert response.status_code == 200
    updated = response.json()
    assert float(updated["temperature_min"]) == 26
    assert float(updated["temperature_max"]) == 30
    assert float(updated["pressure_max"]) == 1025

    persisted = client.get(f"/api/node/{node_id}/targets").json()
    assert float(persisted["temperature_min"]) == 26

    response = client.delete(f"/api/node/{node_id}/targets", headers=headers)
    assert response.status_code == 204
    assert client.get(f"/api/node/{node_id}/targets").status_code == 404
    assert client.get(f"/api/node/{node_id}").json()["targets"] is None


def test_species_presets_endpoint(client):
    response = client.get("/api/species-presets")
    assert response.status_code == 200
    presets = response.json()
    assert len(presets) >= 45
    keys = {preset["key"] for preset in presets}
    assert {"crested_gecko", "bearded_dragon", "pacman_frog"} <= keys

    bearded = next(preset for preset in presets if preset["key"] == "bearded_dragon")
    assert bearded["name"] == "Bearded Dragon"
    assert bearded["group"] == "Desert reptiles"
    assert bearded["temperature_min"] == 28
    assert bearded["temperature_max"] == 38
    assert bearded["pressure_min"] == 990
    assert bearded["pressure_max"] == 1030

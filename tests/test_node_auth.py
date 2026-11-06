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
        json={"temperature": 21.5, "humidity": 48.0, "pressure": 1013.2, "light_level": 540.0},
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

# urcast Backend API README

> A centralized, community-driven local weather monitoring system backend. This repository contains the Python FastAPI server, responsible for authenticating contributors, validating incoming IoT telemetry, managing database relationships via SQLAlchemy, and serving live and historical weather data to the Android client.

---

## About the Backend API

The urcast API acts as the central communication bridge between the outdoor Raspberry Pi weather stations (Contributors) and the Android application (Viewers and Contributors). It provides robust RESTful endpoints designed for high reliability, precise data validation, and strict separation of data sources.

---

## Key Features and Responsibilities

### For Raspberry Pi Nodes (Contributors)

* **Automated Telemetry Ingestion:** Secure endpoints to receive real-time JSON payloads containing temperature, humidity, atmospheric pressure, light levels, GPS coordinates, and timestamps.
* **Node Health and Diagnostics:** Endpoints for reporting node uptime, Wi-Fi status, and individual sensor operational flags (DHT22, BMP280, BH1750, GPS).
* **Node Management:** Registration, configuration, and ownership verification of hardware nodes.

### For the Android Client (Viewers and Contributors)

* **Live Weather Data Delivery:** Endpoints to serve current local weather conditions grouped by node or geographic coordinates.
* **Historical Queries:** Retrieval of historical time-series data for 24-hour and 7-day environmental trends.
* **Map and Location Services:** Endpoints exposing active node locations, status, and community metadata.
* **User and Alert Management:** Contributor authentication and customizable weather threshold alert configurations.

---

## Security and Validation

* **Data Validation:** Incoming payloads and user inputs are strictly validated using Pydantic models to reject malformed or invalid readings before touching the database.
* **Authentication and Authorization:** Passwords are hashed with bcrypt and login is handled with token-based authentication using JSON Web Tokens (JWT), ensuring only authorized contributors can manage their registered nodes.
* **Database Isolation:** Direct database access is strictly restricted to authorized backend modules using SQLAlchemy ORM.
* **MQTT Telemetry:** Sensor data travels over a Mosquitto MQTT broker. Every message payload must carry the node owner's JWT, so a node cannot publish readings for another user's node.

---

## Technology Stack

* **Language:** Python 3.10+
* **Framework:** FastAPI
* **Data Validation:** Pydantic
* **ORM:** SQLAlchemy
* **Database:** MySQL / MariaDB
* **Telemetry:** MQTT (Mosquitto broker, paho-mqtt client)
* **Testing:** Pytest and HTTPX
* **Version Control:** Git and GitHub

---

## Database Schema Overview

The backend interfaces with a relational MySQL database consisting of six primary tables:

* **`User`**: Stores account details, hashed passwords, and roles (Viewer or Contributor).
* **`Node`**: Tracks registered Raspberry Pi weather stations, ownership, location coordinates, and status.
* **`Weather_Reading`**: Time-series environmental data linked to a specific node.
* **`Node_Diagnostic`**: Hardware health metrics including uptime, Wi-Fi connectivity, and individual sensor statuses.
* **`Favourite`**: Junction table allowing users to save and pin preferred weather nodes.
* **`Alert`**: Stores user-defined threshold conditions for specific environmental measurements.

---

## Database Backups

The MySQL database is backed up automatically each day using a Bash script and cron on the Ubuntu AWS server.
- Backup method: mysqldump, compressed using gzip.
- Schedule: Daily at 00:00 UTC.
- Storage: /home/ubuntu/db_backup/.
- Retention: Backups older than six days are removed using find -mtime +6.
- Security: Backup files have restricted permissions.
Backup script: Database/backup_urcast.sh

Cron configuration:
0 0 * * * /bin/bash /home/ubuntu/scripts/backup_urcast.sh

The script must be copied to /home/ubuntu/scripts/backup_urcast.sh before configuring cron. The backup directory must also exist. The cron entry is installed using sudo crontab -e.

Testing: The scheduled backup was verified on 1 November 2026 at 00:00 UTC. The compressed backup was successfully restored into a temporary MySQL database, with all six tables present.

## Getting Started and Installation

### Prerequisites

* Python 3.10 or higher installed on your system.
* A running MySQL or MariaDB database instance.

### Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/urcast/urcast-api.git
cd urcast-api

```


2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

```


3. Install dependencies:
```bash
pip install -r requirements.txt

```


4. Configure your environment variables. Create a `.env` file in the root directory:


5. Initialize tables via SQLAlchemy or run database migrations.
6. Start the development server using Uvicorn:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

```



---

## API Documentation

Once the server is running, interactive documentation is automatically generated by FastAPI:

* **Swagger UI:** `http://localhost:8000/docs`
* **ReDoc:** `http://localhost:8000/redoc`

---

## Authentication Guide

The API uses token based authentication. A user registers with an email and password, logs in to receive a JSON Web Token (JWT), and then sends that token in the `Authorization` header of every request that needs authentication.

### 1. Register

Passwords are hashed with bcrypt before they are stored, so the plain text password never touches the database.

```bash
curl -X POST http://localhost:8000/api/user \
  -H "Content-Type: application/json" \
  -d '{"username": "pijus", "email": "pijus@example.com", "password": "S3curePass!"}'
```

### 2. Log in

Send the email and password to get a token. The token is valid for 24 hours.

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "pijus@example.com", "password": "S3curePass!"}'
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer"
}
```

### 3. Use the token

Add the token as a Bearer token to access protected endpoints such as `/api/auth/me`:

```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

Tip: you can also try this in the Swagger UI. Log in, copy the `access_token`, click the **Authorize** button at the top and paste the token there.

### How it works

* **Registration (`POST /api/user`)** checks that the username and email are not already taken, hashes the password with bcrypt and stores the user with the default `user` role.
* **Login (`POST /api/auth/login`)** looks the user up by email and checks the password against the stored bcrypt hash. Wrong credentials always return `401 Invalid email or password`, the same message for a wrong password and an unknown email.
* **Token** is a JWT signed with the `SECRET_KEY` environment variable using HS256. It contains the user id (`sub`) and an expiry time (`exp`) 24 hours in the future. A missing, invalid or expired token returns `401 Invalid or expired token`.
* **Protecting endpoints** is done with the `get_current_user` dependency from `auth.py`:

```python
from auth import get_current_user

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: Annotated[models.User, Depends(get_current_user)]):
    return current_user
```

The dependency decodes the token, loads the matching user from the database and passes it to the endpoint. If the token is missing, expired or fake, it raises a 401 instead.

### Which endpoints need a token

Weather data is public, so anyone can view nodes, readings and diagnostics without an account. Everything that changes data or belongs to a user needs a Bearer token:

| Endpoints | Requirements |
|---|---|
| `POST /api/user` (register), `POST /api/auth/login` | public, no token |
| `GET /api/nodes`, `GET /api/node/{node_id}` | public, no token |
| `GET /api/readings`, `GET /api/reading/{reading_id}` | public, no token |
| `GET /api/diagnostics`, `GET /api/diagnostics/{diagnostic_id}` | public, no token |
| `GET /api/users`, `GET /api/user/{user_id}` | public, no token |
| `GET /api/favourites`, `GET /api/alerts` | any logged in user |
| `POST /api/node` | token, the node belongs to the logged in user |
| `PATCH /api/node/{node_id}`, `DELETE /api/node/{node_id}` | token, only the owner of the node |
| `GET`, `POST` and `DELETE` on `/api/user/{user_id}/favourites` | token, and `user_id` in the URL must match the token |
| `POST /api/node/{node_id}/reading` | token, only the owner of the node |
| `POST /api/node/{node_id}/diagnostic` | token, only the owner of the node |
| `POST /api/node/{node_id}/heartbeat` | token, only the owner of the node |
| `POST /api/alert` | token, the alert belongs to the logged in user |
| `GET /api/alert/{alert_id}`, `PATCH`, `DELETE` | token, only the owner of the alert |

Two different errors can come back:

* **401** - no token was sent, or the token is invalid or expired.
* **403** - the token is valid, but it belongs to another user, so you are not allowed to touch that data.

Ownership is checked in two ways: endpoints under `/api/user/{user_id}/...` use the `require_self` dependency from `auth.py`, which compares the `user_id` in the URL with the one inside the token, and the node and alert endpoints compare the `user_id` stored on the record before updating or deleting.

Note for the Android client: `POST /api/node` and `POST /api/alert` no longer take a `user_id` in the request body, the user is taken from the token instead.

---

## Weather Nodes (MQTT)

The Raspberry Pi nodes don't post their data through the REST api. They publish JSON messages to a Mosquitto MQTT broker, and the backend listens on the broker and stores everything. Node registration is the only step that goes through the REST api, and it needs a JWT token - a node can never be created or send data without one.

### How it works

```
Raspberry Pi 5 (urcast-node)          Mosquitto broker           urcast API backend
┌─────────────────────────┐          ┌──────────────┐          ┌────────────────────┐
│ TSL2591 / DHT22 / BMP280 │          │              │          │  mqtt_listener.py  │
│ combinedTest.py reads    │ ───────▶ │   urcast/    │ ───────▶ │  checks the JWT,   │
│ sensors every 3 seconds  │  publish │  <node_id>/  │          │  stores readings,  │
│ and publishes JSON       │          │   ...        │          │  diagnostics and   │
└─────────────────────────┘          └──────────────┘          │  heartbeats in the │
        │                                      ▲               │  database          │
        │ 1. register_node.py uses the JWT                              └────────────────────┘
        └────────── POST /api/node (HTTPS REST) ─────────────────────▶ create_node endpoint
```

The flow from a node's point of view:

1. **Register** - `register_node.py` calls `POST /api/node` with the owner's JWT in the `Authorization` header. The api takes the user id from the token, not from the request body, so the node is always linked to the logged in user. Without a valid token the api returns `401 Invalid or expired token` and the node is not created.
2. **Publish** - the sensor loop (`combinedTest.py`) reads the three sensors and publishes each sample to the broker on `urcast/<node_id>/reading`. Every payload includes a `token` field.
3. **Verify + store** - `mqtt_listener.py` on the backend receives the message, decodes the JWT and checks that the token's user matches the user that registered the node. If it does, the reading is stored and the node is marked `active` with a fresh `last_seen`. If the token is missing, expired or belongs to someone else, the message is silently ignored and nothing is stored.
4. **Heartbeat** - every 10th sample the node also publishes a diagnostic and a heartbeat so the backend can tell which sensors are alive and which nodes are still online.

### Topics

| Topic | Payload | Stored as |
|---|---|---|
| `urcast/<node_id>/reading` | `temperature`, `humidity`, `pressure`, `light_level`, `token` | row in `weather_reading` |
| `urcast/<node_id>/diagnostic` | sensor status flags, `token` | row in `node_diagnostic` |
| `urcast/<node_id>/heartbeat` | `token` | updates node `status` and `last_seen` |

Every payload must also contain the `token` field with the node owner's JWT. The backend checks that the token belongs to the user that registered the node, otherwise the message is ignored.

Example reading payload (what `mqtt_client.py` publishes):

```json
{
  "temperature": 21.5,
  "humidity": 48.0,
  "pressure": 1013.2,
  "light_level": 540.0,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Any field except `token` can be `null` if that sensor failed its read - the api accepts partial readings, exactly like the printed terminal output shows `n/a`.

### Setting up a node

Full walkthrough from nothing to a node streaming data:

1. **Start the backend stack** (database, api and broker):
```bash
docker compose up -d
```
2. **Create a user and log in** to get the JWT the node will use:
```bash
curl -X POST http://<api-host>:8000/api/user \
  -H "Content-Type: application/json" \
  -d '{"username": "pijus", "email": "pijus@example.com", "password": "S3curePass!"}'

curl -X POST http://<api-host>:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "pijus@example.com", "password": "S3curePass!"}'
```
Copy the `access_token` from the response.
3. **On the Raspberry Pi**, clone the node code from its own repo and install the sensor libraries (see the urcast-node README):
```bash
git clone https://github.com/urcast/urcast-node.git
cd urcast-node/test
```
Then set the token in both scripts:
   * `register_node.py` - set `API_URL` and paste the token into `NODE_TOKEN`.
   * `mqtt_client.py` - set `MQTT_BROKER` to the broker address, paste the token into `NODE_TOKEN`.
4. **Register the node** (uses `POST /api/node`, so a valid JWT is required):
```bash
python register_node.py
```
It prints `node registered, id = <id>`. Put that id into `NODE_ID` in `mqtt_client.py`.
5. **Run the sensor loop**:
```bash
python combinedTest.py
```
Every 3 seconds a sample is printed to the terminal and published to the broker; the api stores it and the node shows up as `active` at `GET /api/node/{node_id}`.

The broker runs in docker compose (`docker compose up mqtt`), or on a separate machine with `mosquitto -c mosquitto.conf`. The broker currently allows anonymous connections - anyone on the network can publish, which is why every message is still checked against the node owner's JWT by the backend.

### MQTT over TLS

By default the broker listens on port 1883 in plain text, so the JWT in every payload travels over the network unencrypted. For the AWS deployment we add a second TLS listener on port 8883 using the Let's Encrypt cert the server already has, so the nodes can verify it with their normal system CA store and no custom certificates are needed.

**On the server** (one-time setup):

```bash
# lets encrypt files are root only, copy them somewhere mosquitto can read
sudo mkdir /etc/mosquitto/certs
sudo cp /etc/letsencrypt/live/urcast.pjmisev.com/fullchain.pem /etc/mosquitto/certs/
sudo cp /etc/letsencrypt/live/urcast.pjmisev.com/privkey.pem /etc/mosquitto/certs/
sudo chown -R mosquitto:mosquitto /etc/mosquitto/certs

# install the TLS listener config from this repo
sudo cp mosquitto-tls.conf /etc/mosquitto/conf.d/urcast-tls.conf
sudo systemctl restart mosquitto
sudo ss -tlnp | grep 8883   # should show mosquitto listening on 0.0.0.0:8883
```

The cert gets renewed every ~90 days, so a deploy hook has to re-copy it and restart mosquitto after each renewal (see the comments at the top of `mosquitto-tls.conf`).

Also open port **8883** in the AWS security group, same as was done for 80 and 1883.

**On the backend** - set `MQTT_TLS=true` in `.env` (see `.env.example`). The listener then verifies the broker certificate against the system CA store. Note that `MQTT_BROKER` has to be the real hostname (`mqtt.pjmisev.com`), not `localhost` - the cert is issued for the hostname, so connecting to localhost would fail the certificate check. The listener log will say `connected to mqtt broker ... over tls` when it worked.

**On the node** - the node-side repo gets the matching change (paho `tls_set()`, port 8883), check the urcast-node README.

To confirm TLS is actually enforced, a plain connection to 8883 must fail while one with the CA file succeeds:

```bash
# should hang/fail the handshake - no CA given
mosquitto_pub -h localhost -p 8883 -t "urcast/test/heartbeat" -m '{}'

# should succeed
mosquitto_pub -h localhost -p 8883 \
  --cafile /etc/ssl/certs/ca-certificates.crt \
  -t "urcast/test/heartbeat" -m '{}'
```

Port 1883 stays as a fallback for the backend listener on the same machine (that traffic never leaves the server, so plain text on loopback is fine). It can be removed later if everything moves to 8883.

### What to watch out for

* **Token expired** - tokens last 24 hours. If your node suddenly stops storing readings, the backend log will say `token is missing or wrong for node <id>`. Log in again and update `NODE_TOKEN` in `mqtt_client.py`.
* **Node not registered** - messages for a node id that doesn't exist are ignored (`node <id> does not exist`). Run `register_node.py` first.
* **Wrong node id** - make sure `NODE_ID` in `mqtt_client.py` matches the id returned by `register_node.py`, otherwise the api can't find the node.
* **Broker unreachable** - if the Pi can't reach the broker, `mqtt_client.py` prints `could not send ... (no connection to broker)` and keeps the sensor loop running; data resumes once the broker is back.
* **TLS certificate errors** - if the backend or node prints a certificate verification error, the broker was probably restarted after a cert renewal with stale files in `/etc/mosquitto/certs`, or the connection is going to `localhost`/an IP instead of the hostname on the cert.

### Verifying it works

```bash
# watch the raw messages on the broker
mosquitto_sub -h <broker-host> -t "urcast/#"

# check the node went active
curl http://<api-host>:8000/api/node/1

# check the readings arrived
curl http://<api-host>:8000/api/readings
```

---

## Testing

Run the test suite using `pytest` to verify endpoint functionality, database interactions, and Pydantic validation rules:

```bash
pytest

```

---

## Team

* **Pijus (PM)** – Back-End, Version Control
* **Raivis** – Database, Back-End
* **Anastasija** – Front-End, UI/UX/UD, Database
* **Leonas** – Hardware, Front-End
* **Kornel** – UI/UX/UD, Testing, Hardware

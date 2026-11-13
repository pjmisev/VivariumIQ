# VivariumIQ

VivariumIQ is a full-stack IoT remote monitoring and behavioral tracking system for exotic pet enclosures. A Raspberry Pi 400 with a complete sensor array captures microclimate telemetry, atmospheric pressure trends, regional positioning and physical security events. The data streams over an MQTT pub/sub broker to a cloud-hosted FastAPI backend, which validates and stores it, builds hourly and daily summaries, and serves a web dashboard and REST API.

This repository contains the backend API, the MQTT ingestion service and the web dashboard.

---

## Table of Contents

- [System Architecture and Hardware](#system-architecture-and-hardware)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Web Dashboard](#web-dashboard)
- [Security Implementation](#security-implementation)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Database Schema Overview](#database-schema-overview)
- [Database Backups](#database-backups)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Authentication Guide](#authentication-guide)
- [Enclosure Nodes and MQTT](#enclosure-nodes-and-mqtt)
- [Hourly and Daily Summaries](#hourly-and-daily-summaries)
- [Testing](#testing)
- [Project Status and Known Issues](#project-status-and-known-issues)
- [Screencast and Demo](#screencast-and-demo)
- [Team](#team)

---

## System Architecture and Hardware

**Controller:** Raspberry Pi 400

**Sensor and Actuator Array:**

- Temperature and humidity sensor for microclimate monitoring
- Barometer for atmospheric pressure and seasonal trend analysis
- GPS sensor for regional coordinate tracking and native hemisphere day-length calculations
- PIR sensor for enclosure intrusion and animal movement detection
- LED light and piezo buzzer for local visual and audible alerts

**Communication Protocols:** MQTTS between the Pi and the broker, HTTPS for the web dashboard and REST API, MQTT pub/sub for telemetry ingestion.

**Backend and Frontend:** FastAPI, Jinja2 templates, Tailwind CSS 4 and daisyUI 5, with a custom VivariumIQ light/dark theme.

**Database:** MySQL / MariaDB (MariaDB 12 in Docker Compose).

**Cloud Infrastructure:** AWS, with Mosquitto, a MySQL database and the API running on the server.

---

## Key Features

- **Health Status Banner:** A front-and-center, color-coded dashboard indicator reflecting overall system and environmental health (Optimal, Environmental Drift, Critical Alert).
- **Biological Clock and Liveliness Index:** Processes environmental streams alongside regional GPS data to estimate behavioral shifts and activity levels.
- **Intrusion and Motion Detection:** PIR events are ingested with every sample and rolled up into hourly and daily motion counts for behavioral and security insight.
- **Multi-Pet Management:** Switch between animal profiles and enclosures from a unified web interface.
- **Bidirectional Actuator Control:** Remotely trigger the local warning LED or piezo buzzer on the Raspberry Pi from the cloud dashboard via MQTT commands.
- **Telemetry Ingestion:** Raw sensor samples, sensor health diagnostics and heartbeats are received over MQTT and stored per enclosure node.
- **Historical Trends:** Hourly aggregates and daily rollups of temperature, humidity, pressure and motion counts, exposed through dedicated REST endpoints.
- **User Accounts and Alerts:** JWT-based authentication, saved favourite nodes and user-defined threshold alerts per measurement.

---

## How It Works

```
Raspberry Pi 400 (enclosure node)        Mosquitto broker          VivariumIQ API
┌──────────────────────────┐            ┌──────────────┐         ┌────────────────────┐
│ DHT22 / BMP280 / PIR /    │            │              │         │  mqtt_listener.py  │
│ GPS / actuators           │ ─────────▶ │   urcast/    │ ──────▶ │  verifies the JWT, │
│ sensor loop publishes     │  publish   │  <node_id>/  │         │  stores readings,  │
│ JSON every few seconds    │            │   ...        │         │  diagnostics and   │
└──────────────────────────┘            └──────────────┘         │  heartbeats        │
        │                                                          └────────────────────┘
        │ 1. register node with the owner's JWT
        └────────── POST /api/node (HTTPS REST) ────────────────────▶ create_node endpoint
```

1. **Register** - the node registers itself once with `POST /api/node`, sending the owner's JWT. The API takes the user id from the token, never from the request body, so a node is always linked to the logged-in user.
2. **Publish** - the sensor loop reads the hardware and publishes each sample to `urcast/<node_id>/reading`, including the owner's JWT in the payload.
3. **Verify and store** - `mqtt_listener.py` decodes the token, checks that it belongs to the user that registered the node, stores the reading and marks the node `active` with a fresh `last_seen`. Messages with a missing, expired or foreign token are silently ignored.
4. **Summarize** - a scheduled job aggregates raw readings into hourly summaries, and the API rolls those up into daily figures on request.
5. **Serve** - the REST API and web dashboard expose live status, historical trends, diagnostics, favourites and alerts.

> The MQTT topic prefix and several internal identifiers still use the original `urcast` name for compatibility with nodes already deployed. The product and database are VivariumIQ.

---

## Web Dashboard

The web interface is server-rendered with Jinja2 and progressively enhanced with a small vanilla JavaScript layer. Tailwind CSS 4, daisyUI 5, and Chart.js are vendored under `static/vendor/`, so there is no frontend build step or runtime CDN dependency.

| Route | Purpose |
|---|---|
| `/` | Public landing page with product overview and calls to action |
| `/login`, `/register` | Account access screens with inline validation and password strength feedback |
| `/app` | Authenticated overview: health banner, stats, 24-hour chart, enclosure cards, alerts and activity |
| `/app/nodes` | Searchable enclosure list, status filters, favourite toggles and node registration |
| `/app/nodes/{id}` | Per-node telemetry, hourly/daily history, diagnostics, edit/delete and node alerts |
| `/app/alerts` | Create, edit, pause and delete threshold alerts |
| `/app/profile` | Account settings, API token access, sign out and account deletion |

The dashboard talks to the existing REST API with the JWT stored in `localStorage`, so every write is still authorised by the backend. If a token expires, the client clears the session and redirects to `/login` with a return path. The light/dark theme is remembered per browser.

---

## Security Implementation

- **Authentication and Authorization:** Users register with an email and password, and receive a 24-hour JWT (HS256) on login. Passwords are hashed with bcrypt. Protected routes resolve the current user through the `get_current_user` dependency, and ownership is enforced either by comparing the user id inside the token with the record owner or through the `require_self` dependency.
- **Data in Transit:** The Raspberry Pi can publish to Mosquitto over TLS on port 8883 using a Let's Encrypt certificate, and web traffic is served over HTTPS with a custom domain.
- **Data at Rest:** Database credentials, the JWT signing key, and broker settings are read exclusively from environment variables. No secrets are committed to the repository.
- **Input Validation:** Incoming payloads and user input are validated with Pydantic models before they reach the database. Invalid requests return `422`; API errors return JSON, while page routes render an HTML error page.
- **Database Isolation:** Direct database access is limited to the backend modules through SQLAlchemy ORM.
- **Server Hardening:** The production server runs with non-default settings and the broker certificate is verified against the system CA store.

See [Project Status and Known Issues](#project-status-and-known-issues) for the remaining hardening work.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Language | Python 3.13+ (project pins 3.14 in `pyproject.toml`) |
| Framework | FastAPI |
| Data validation | Pydantic v2 |
| ORM | SQLAlchemy 2 |
| Database | MariaDB 12 / MySQL, PyMySQL driver |
| Telemetry | MQTT / MQTTS, Eclipse Mosquitto, paho-mqtt |
| Templating | Jinja2 |
| Styling | Tailwind CSS 4, daisyUI 5, custom CSS, Inter and Plus Jakarta Sans |
| Auth | bcrypt, PyJWT |
| Packaging | uv |
| Containerization | Docker, Docker Compose |
| Testing | pytest, FastAPI TestClient |
| Version control | Git and GitHub |

---

## Repository Structure

```
.
├── main.py                 # FastAPI app, REST endpoints, web routes
├── auth.py                 # Password hashing, JWT creation and dependencies
├── models.py               # SQLAlchemy models
├── schemas.py              # Pydantic request/response schemas
├── database.py             # Engine, session factory and Base
├── mqtt_listener.py        # Mosquitto subscriber and telemetry ingestion
├── hourly_summary.py       # Hourly aggregation job
├── mosquitto.conf          # Local broker configuration
├── mosquitto-tls.conf      # TLS listener configuration for the server
├── docker-compose.yml      # Database, API and broker services
├── Dockerfile              # API image
├── database/
│   ├── schema.sql          # Database schema
│   └── backup_urcast.sh    # Daily backup script
├── templates/              # Jinja2 landing, auth, dashboard, node, alert and profile pages
├── static/                 # Tailwind/daisyUI CSS, vendored frontend dependencies, JavaScript, icons and manifest
└── tests/                  # pytest suite
```

---

## Database Schema Overview

The backend uses a relational schema with seven tables:

| Table | Purpose |
|---|---|
| `user` | Account details, bcrypt password hash, role and creation timestamp. |
| `node` | Registered enclosure nodes, ownership, coordinates, location name, status and `last_seen`. |
| `weather_reading` | Raw time-series samples (temperature, humidity, pressure, motion detection) linked to a node. |
| `hourly_weather_summary` | Per-node hourly averages, motion count, temperature min/max and reading count, unique per node and hour. |
| `node_diagnostic` | Hardware health: uptime, Wi-Fi state and flags for the DHT22, pressure, PIR and GPS sensors. |
| `favourite` | Junction table of user/node pairs used to pin preferred enclosures. |
| `alert` | User-defined thresholds (`>`, `<`, `>=`, `<=`, `==`) on a measurement for a node. |

The full DDL is in `database/schema.sql`. Tables are also created automatically by SQLAlchemy on startup (`Base.metadata.create_all`). Because `create_all` does not alter existing tables, databases created before the PIR switch need a manual migration:

```sql
ALTER TABLE weather_reading
    DROP COLUMN light_level,
    ADD COLUMN motion_detected BOOLEAN;

ALTER TABLE hourly_weather_summary
    DROP COLUMN avg_light_level,
    ADD COLUMN motion_count INT NOT NULL DEFAULT 0;

ALTER TABLE node_diagnostic
    CHANGE COLUMN light_sensor_status pir_status BOOLEAN;
```

---

## Database Backups

The MySQL database is backed up automatically on the Ubuntu AWS server with a Bash script and cron.

- **Method:** `mysqldump --single-transaction`, compressed with gzip.
- **Schedule:** Daily at 00:00 UTC.
- **Storage:** `/home/ubuntu/db_backup/`.
- **Retention:** Backups older than six days are removed with `find -mtime +6`.
- **Permissions:** `umask 077`, so only the owner can read the dump.
- **Script:** `database/backup_urcast.sh`.

Cron entry:

```cron
0 0 * * * /bin/bash /home/ubuntu/scripts/backup_urcast.sh
```

Copy the script to `/home/ubuntu/scripts/backup_urcast.sh` and make sure the backup directory exists before installing the entry with `sudo crontab -e`.

Restore check:

```bash
gunzip -c /home/ubuntu/db_backup/vivariumiq_<date>.sql.gz > /tmp/restore.sql
mysql -u root -p -e "CREATE DATABASE vivariumiq_restore_test"
mysql -u root -p vivariumiq_restore_test < /tmp/restore.sql
mysql -u root -p vivariumiq_restore_test -e "SHOW TABLES"
```

All seven tables should be present, then drop the temporary database.

---

## Getting Started

### Prerequisites

- Python 3.13 or higher
- [uv](https://docs.astral.sh/uv/) for dependency management
- MySQL or MariaDB, or Docker with Compose
- A Mosquitto broker (Docker Compose starts one for you)

### Option 1: Docker Compose (recommended)

Starts the database, API and broker together. `database/schema.sql` is loaded automatically on the first database start.

```bash
git clone https://github.com/pjmisev/VivariumIQ.git
cd VivariumIQ
cp .env.example .env   # fill in DATABASE_URL and SECRET_KEY
docker compose up -d --build
```

- Dashboard: `http://localhost:8000/`
- API docs: `http://localhost:8000/docs`
- Broker: `localhost:1883`

The Compose API service overrides `DATABASE_URL` and `MQTT_BROKER` to point at the Compose services.

### Option 2: Local development

```bash
git clone https://github.com/pjmisev/VivariumIQ.git
cd VivariumIQ
cp .env.example .env
uv sync
uv run fastapi dev main.py --host 0.0.0.0 --port 8000
```

To run the broker from the Compose file only:

```bash
docker compose up mqtt
```

### Environment variables

Create `.env` in the project root:

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLAlchemy URL, for example `mysql+pymysql://vivariumiq:vivariumiq@localhost:3306/vivariumiq_db`. |
| `SECRET_KEY` | Long random string used to sign JWTs. Change this in production. |
| `MQTT_BROKER` | Broker hostname. Must be the real hostname when TLS is enabled. |
| `MQTT_PORT` | Broker port, `1883` by default, `8883` for TLS. |
| `MQTT_TLS` | Set to `true` to connect to the broker over TLS. |
| `MQTT_CA_FILE` | CA bundle used to verify the broker certificate. |

> If `DATABASE_URL` is omitted, the API falls back to `mysql+pymysql://root:password@localhost:3306/vivariumiq_db`. Do not rely on this default outside local development.

---

## API Documentation

FastAPI generates interactive documentation automatically while the server runs:

- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

The landing page at `http://localhost:8000/` links to the API docs.

---

## Authentication Guide

The API uses token-based authentication. A user registers with an email and password, logs in to receive a JWT, and sends that token in the `Authorization` header for protected requests.

### 1. Register

Passwords are hashed with bcrypt before storage, so the plain-text password never reaches the database.

```bash
curl -X POST http://localhost:8000/api/user \
  -H "Content-Type: application/json" \
  -d '{"username": "pijus", "email": "pijus@example.com", "password": "S3curePass!"}'
```

### 2. Log in

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

Send the token as a Bearer token on protected endpoints:

```bash
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

You can also use Swagger UI: log in, copy `access_token`, click **Authorize** and paste the token.

### How it works

- **Registration (`POST /api/user`)** rejects duplicate usernames and emails, hashes the password with bcrypt and stores the account with the default `user` role.
- **Login (`POST /api/auth/login`)** looks the user up by email and checks the bcrypt hash. Wrong credentials always return `401 Invalid email or password`, whether the email exists or not.
- **Token** is a JWT signed with `SECRET_KEY` using HS256. It contains the user id in `sub` and an expiry in `exp`, 24 hours in the future. Missing, invalid or expired tokens return `401 Invalid or expired token`.
- **Protection** uses the `get_current_user` dependency from `auth.py`:

```python
from auth import get_current_user

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: Annotated[models.User, Depends(get_current_user)]):
    return current_user
```

The dependency decodes the token, loads the matching user and passes it to the endpoint. Ownership checks compare `current_user.user_id` with the stored record owner, and `/api/user/{user_id}/...` routes use `require_self`, which compares the URL id with the token id.

### Which endpoints need a token

Weather data is public. Anything that creates or changes user-owned data requires a Bearer token.

| Endpoints | Requirements |
|---|---|
| `POST /api/user`, `POST /api/auth/login` | Public |
| `GET /api/nodes`, `GET /api/node/{node_id}` | Public |
| `GET /api/readings`, `GET /api/reading/{reading_id}` | Public |
| `GET /api/diagnostics`, `GET /api/diagnostics/{diagnostic_id}` | Public |
| `GET /api/nodes/{node_id}/summaries/hourly`, `/daily` | Public |
| `GET /api/users`, `GET /api/user/{user_id}` | Public |
| `GET /api/auth/me` | Token |
| `POST /api/node` | Token; the node is owned by the logged-in user |
| `PATCH /api/node/{node_id}`, `DELETE /api/node/{node_id}` | Token; node owner only |
| `POST /api/node/{node_id}/reading` | Token; node owner only |
| `POST /api/node/{node_id}/diagnostic` | Token; node owner only |
| `POST /api/node/{node_id}/heartbeat` | Token; node owner only |
| `GET /api/user/{user_id}/favourites` | Token; `user_id` must match the token |
| `POST /api/user/{user_id}/favourites`, `DELETE /api/user/{user_id}/favourites/{node_id}` | Token; `user_id` must match the token |
| `GET /api/favourites`, `GET /api/alerts` | Any logged-in user |
| `POST /api/alert` | Token; the alert is owned by the logged-in user |
| `GET /api/alert/{alert_id}`, `PATCH`, `DELETE` | Token; alert owner only |

Two error codes are used:

- **401** - no token, or the token is invalid or expired.
- **403** - the token is valid but belongs to another user.

Note for the frontend and node clients: `POST /api/node` and `POST /api/alert` take the user from the token, not from the request body.

---

## Enclosure Nodes and MQTT

The Raspberry Pi nodes do not post telemetry through the REST API. They publish JSON messages to Mosquitto, and the backend listens on the broker and stores everything. Node registration is the only REST step, and it requires a JWT.

### Topics

| Topic | Payload | Stored as |
|---|---|---|
| `urcast/<node_id>/reading` | `temperature`, `humidity`, `pressure`, `motion_detected`, `token` | Row in `weather_reading` |
| `urcast/<node_id>/diagnostic` | `uptime`, `wifi_connected`, sensor status flags, `token` | Row in `node_diagnostic` |
| `urcast/<node_id>/heartbeat` | `token` | Updates node `status` and `last_seen` |

Every payload must contain the `token` field with the node owner's JWT. The listener checks that the token belongs to the user that registered the node; otherwise the message is ignored.

Example reading payload:

```json
{
  "temperature": 27.5,
  "humidity": 72.0,
  "pressure": 1013.2,
  "motion_detected": true,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

Any field except `token` may be `null` if that sensor failed its read. Partial readings are accepted.

Example diagnostic payload:

```json
{
  "uptime": 86400,
  "wifi_connected": true,
  "dht22_status": true,
  "pressure_sensor_status": true,
  "pir_status": false,
  "gps_status": true,
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Setting up a node

1. **Start the backend stack** (database, API and broker):

```bash
docker compose up -d --build
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

3. **On the Raspberry Pi 400**, clone the node client repository and install its sensor libraries. Configure:

   - `API_URL` - the API base URL
   - `MQTT_BROKER` - the broker address
   - `NODE_TOKEN` - the JWT from step 2
   - `NODE_ID` - filled in after registration

4. **Register the node** with `POST /api/node`, so a valid JWT is required. The script prints the new node id; put it into `NODE_ID` in the publishing client.

5. **Run the sensor loop.** Samples are published to the broker, the API stores them, and the node becomes `active` at `GET /api/node/{node_id}`.

The broker runs in Docker Compose (`docker compose up mqtt`), or on a separate machine with `mosquitto -c mosquitto.conf`. The local broker allows anonymous connections, which is why every message is still checked against the node owner's JWT by the backend.

### MQTT over TLS

By default the broker listens on port 1883 in plain text, so the JWT in every payload travels unencrypted. The production deployment adds a second TLS listener on port 8883 using the Let's Encrypt certificate already on the server, so nodes can verify it with the normal system CA store and no custom certificates are needed.

**On the server** (one-time setup):

```bash
# Let's Encrypt files are root only; copy them somewhere Mosquitto can read
sudo mkdir -p /etc/mosquitto/certs
sudo cp /etc/letsencrypt/live/<your-domain>/fullchain.pem /etc/mosquitto/certs/
sudo cp /etc/letsencrypt/live/<your-domain>/privkey.pem /etc/mosquitto/certs/
sudo chown -R mosquitto:mosquitto /etc/mosquitto/certs

# Install the TLS listener config from this repo
sudo cp mosquitto-tls.conf /etc/mosquitto/conf.d/vivariumiq-tls.conf
sudo systemctl restart mosquitto
sudo ss -tlnp | grep 8883   # should show mosquitto listening on 0.0.0.0:8883
```

The certificate is renewed roughly every 90 days, so a deploy hook must re-copy the files and restart Mosquitto after each renewal. See the comments at the top of `mosquitto-tls.conf`. The checked-in config references the existing deployment certificate paths; update them if the deployment domain changes.

Open port **8883** in the AWS security group, as was done for 80, 443 and 1883.

**On the backend**, set `MQTT_TLS=true` in `.env`. The listener then verifies the broker certificate against the system CA store. `MQTT_BROKER` must be the real hostname, not `localhost`, because the certificate is issued for the hostname and a localhost connection fails verification. A successful connection logs `connected to mqtt broker ... over tls`.

**On the node**, configure paho's `tls_set()`, use port 8883 and point `MQTT_BROKER` at the same hostname.

To confirm TLS is enforced, a plain connection to 8883 must fail while one with the CA file succeeds:

```bash
# Should fail the handshake - no CA given
mosquitto_pub -h <broker-host> -p 8883 -t "urcast/test/heartbeat" -m '{}'

# Should succeed
mosquitto_pub -h <broker-host> -p 8883 \
  --cafile /etc/ssl/certs/ca-certificates.crt \
  -t "urcast/test/heartbeat" -m '{}'
```

Port 1883 stays available as a fallback for the backend listener on the same machine, where traffic never leaves the server.

### Troubleshooting

- **Token expired** - tokens last 24 hours. If a node stops storing readings, the backend log says `token is missing or wrong for node <id>`. Log in again and update `NODE_TOKEN`.
- **Node not registered** - messages for unknown node ids are ignored (`node <id> does not exist`). Register the node first.
- **Wrong node id** - `NODE_ID` must match the id returned at registration.
- **Broker unreachable** - the node client reports no connection to the broker and keeps its sensor loop running; data resumes when the broker returns.
- **TLS certificate errors** - usually the broker is serving a stale certificate after renewal, or the client connects to `localhost`/an IP instead of the hostname on the certificate.

### Verifying it works

```bash
# Watch the raw messages on the broker
mosquitto_sub -h <broker-host> -t "urcast/#"

# Check the node went active
curl http://<api-host>:8000/api/node/1

# Check the readings arrived
curl http://<api-host>:8000/api/readings
```

---

## Hourly and Daily Summaries

`hourly_summary.py` aggregates the previous hour of raw readings per node into `hourly_weather_summary`: average temperature, humidity and pressure, total motion detections, plus minimum and maximum temperature and the reading count. Re-running the job for the same hour updates the existing row, so it is safe to repeat.

```bash
uv run python hourly_summary.py
```

On the server, schedule it with cron so it runs shortly after each hour:

```cron
5 * * * * cd /home/ubuntu/VivariumIQ && /home/ubuntu/.local/bin/uv run python hourly_summary.py
```

The API exposes the results:

- `GET /api/nodes/{node_id}/summaries/hourly` - stored hourly aggregates, newest first.
- `GET /api/nodes/{node_id}/summaries/daily` - daily rollups computed from the hourly table.

---

## Testing

The test suite covers authentication, node ownership, reading ingestion, heartbeats and the `401`/`403` paths. Tests run against in-memory SQLite, so no database or broker is needed.

```bash
uv run pytest
```

The suite is in `tests/test_node_auth.py`.

---

## Project Status and Known Issues

Implemented in this repository:

- User registration, login, JWT authentication and ownership checks
- Enclosure node registration and management
- MQTT ingestion for readings, diagnostics and heartbeats, with TLS support
- Hourly aggregation and daily summary endpoints
- Favourite nodes and threshold alert CRUD
- Web landing page, login/register screens and responsive app shell
- Dashboard with health banner, microclimate chart, enclosure cards, alerts and recent activity
- Enclosure list and per-node views for telemetry, hourly/daily history, diagnostics and alert management
- Favourite toggles, profile settings, API token access and account deletion
- Light and dark themes plus HTML error pages
- Daily database backups

Not yet complete in this repository:

- The biological clock/liveliness index is part of the product concept; the backend currently stores the raw signals it will use but does not compute the index yet.
- Multi-pet profiles and actuator controls are still being built.
- Actuator commands (LED and buzzer) are not exposed by the API yet.
- The legacy bulk write endpoints `POST /api/reading`, `POST /api/diagnostics`, `PATCH`/`DELETE` on readings and diagnostics are currently unauthenticated and are not used by nodes. They should be removed or protected before production.
- `GET /api/users` exposes account emails publicly and should be restricted or removed.
- The broker allows anonymous connections. JWT verification protects data integrity, but broker-level authentication is still recommended.

---

## Screencast and Demo

A complete video walkthrough covering the system architecture, security implementation, live end-to-end demo and known issues:

- [Link to Screencast/Demo]

---
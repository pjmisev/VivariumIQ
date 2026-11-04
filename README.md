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

---

## Technology Stack

* **Language:** Python 3.10+
* **Framework:** FastAPI
* **Data Validation:** Pydantic
* **ORM:** SQLAlchemy
* **Database:** MySQL / MariaDB
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
| `POST /api/alert` | token, the alert belongs to the logged in user |
| `GET /api/alert/{alert_id}`, `PATCH`, `DELETE` | token, only the owner of the alert |
| `PATCH /api/user/{user_id}`, `DELETE /api/user/{user_id}` | token, only for your own account |

Two different errors can come back:

* **401** - no token was sent, or the token is invalid or expired.
* **403** - the token is valid, but it belongs to another user, so you are not allowed to touch that data.

Ownership is checked in two ways: endpoints under `/api/user/{user_id}/...` use the `require_self` dependency from `auth.py`, which compares the `user_id` in the URL with the one inside the token, and the node and alert endpoints compare the `user_id` stored on the record before updating or deleting.

Note for the Android client: `POST /api/node` and `POST /api/alert` no longer take a `user_id` in the request body, the user is taken from the token instead.

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

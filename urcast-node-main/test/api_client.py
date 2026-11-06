# Simple client for talking to the urcast API from the node.
#
# The API only lets a node register and send data with a valid JWT token,
# so the token has to be pasted into NODE_TOKEN below before anything works.
#
# Used by:
#   register_node.py  -- run once, creates the node on the API
#   combinedTest.py   -- sends every sensor reading to the API

import requests

# change these before running on the Pi
API_URL = "http://localhost:8000"
NODE_TOKEN = "paste-your-jwt-token-here"
NODE_ID = 1

TIMEOUT_S = 5


def _headers():
    return {"Authorization": f"Bearer {NODE_TOKEN}"}


def _print_error(endpoint, response):
    detail = response.json().get("detail", response.text)
    print(f"{endpoint} failed ({response.status_code}): {detail}")


def create_node(node_name, latitude=None, longitude=None, location_name=None):
    """Register this node. The API rejects this if the token is missing or expired."""
    response = requests.post(
        f"{API_URL}/api/node",
        json={
            "node_name": node_name,
            "latitude": latitude,
            "longitude": longitude,
            "location_name": location_name,
        },
        headers=_headers(),
        timeout=TIMEOUT_S,
    )
    if response.status_code == 201:
        return response.json()
    _print_error("create node", response)
    return None


def send_reading(temperature=None, humidity=None, pressure=None, light_level=None):
    """Send one raw sensor sample for this node. Returns True if it was stored."""
    try:
        response = requests.post(
            f"{API_URL}/api/node/{NODE_ID}/reading",
            json={
                "temperature": temperature,
                "humidity": humidity,
                "pressure": pressure,
                "light_level": light_level,
            },
            headers=_headers(),
            timeout=TIMEOUT_S,
        )
    except requests.RequestException as error:
        print(f"reading not sent (no connection to API): {error}")
        return False

    if response.status_code == 201:
        return True
    _print_error("send reading", response)
    return False


def send_diagnostic(light_ok, air_ok, pressure_ok):
    """Report which sensors are working so the backend can track node health."""
    try:
        response = requests.post(
            f"{API_URL}/api/node/{NODE_ID}/diagnostic",
            json={
                "light_sensor_status": light_ok,
                "dht22_status": air_ok,
                "pressure_sensor_status": pressure_ok,
            },
            headers=_headers(),
            timeout=TIMEOUT_S,
        )
    except requests.RequestException as error:
        print(f"diagnostic not sent (no connection to API): {error}")
        return False

    if response.status_code == 201:
        return True
    _print_error("send diagnostic", response)
    return False


def send_heartbeat():
    """Tell the API the node is still online (updates status and last_seen)."""
    try:
        response = requests.post(
            f"{API_URL}/api/node/{NODE_ID}/heartbeat",
            headers=_headers(),
            timeout=TIMEOUT_S,
        )
    except requests.RequestException as error:
        print(f"heartbeat not sent (no connection to API): {error}")
        return False

    if response.status_code == 200:
        return True
    _print_error("send heartbeat", response)
    return False

# Receives the messages the weather nodes publish on the Mosquitto broker and
# stores them in the database.
#
# Topics the nodes can send on:
#   vivariumiq/<node_id>/reading    -> one raw sensor sample
#   vivariumiq/<node_id>/diagnostic -> sensor health report
#   vivariumiq/<node_id>/heartbeat  -> just tells us the node is still online
#
# Every message payload has to contain the JWT token of the user that owns the
# node (same token that was used to register the node with POST /api/node).
# If the token is missing, expired or belongs to a different user the message
# is ignored, so nobody can fake readings for a node they don't own.

import json
import os
import threading
import time
from datetime import datetime, timezone

import jwt
import paho.mqtt.client as mqtt
from sqlalchemy import select

import models
from auth import SECRET_KEY
from database import SessionLocal

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
# set MQTT_TLS=true to connect to the broker over TLS (port 8883 setup).
# the broker uses a lets encrypt cert so the system CA store can verify it,
# which means MQTT_BROKER has to be the real hostname (e.g. mqtt.pjmisev.com)
# and not localhost, otherwise the certificate check fails.
MQTT_TLS = os.getenv("MQTT_TLS", "").lower() == "true"
MQTT_CA_FILE = os.getenv("MQTT_CA_FILE", "/etc/ssl/certs/ca-certificates.crt")

_client = None


def token_belongs_to_node_owner(token: str, node: models.Node) -> bool:
    if not token:
        return False
    try:
        token_data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return False
    return token_data.get("sub") == str(node.user_id)


def mark_node_online(db, node: models.Node) -> None:
    node.last_seen = datetime.now(timezone.utc)
    node.status = "active"


def store_reading(node_id: int, data: dict) -> None:
    db = SessionLocal()
    try:
        node = db.scalars(select(models.Node).where(models.Node.node_id == node_id)).first()
        if not node:
            print(f"reading ignored, node {node_id} does not exist")
            return
        if not token_belongs_to_node_owner(data.get("token"), node):
            print(f"reading ignored, token is missing or wrong for node {node_id}")
            return
        reading = models.WeatherReading(
            node_id=node_id,
            temperature=data.get("temperature"),
            humidity=data.get("humidity"),
            pressure=data.get("pressure"),
            motion_detected=data.get("motion_detected"),
        )
        mark_node_online(db, node)
        db.add(reading)
        db.commit()
        print(f"stored reading #{reading.reading_id} from node {node_id}")
    finally:
        db.close()


def store_diagnostic(node_id: int, data: dict) -> None:
    db = SessionLocal()
    try:
        node = db.scalars(select(models.Node).where(models.Node.node_id == node_id)).first()
        if not node:
            print(f"diagnostic ignored, node {node_id} does not exist")
            return
        if not token_belongs_to_node_owner(data.get("token"), node):
            print(f"diagnostic ignored, token is missing or wrong for node {node_id}")
            return
        diagnostic = models.NodeDiagnostic(
            node_id=node_id,
            uptime=data.get("uptime"),
            wifi_connected=data.get("wifi_connected"),
            dht22_status=data.get("dht22_status"),
            pressure_sensor_status=data.get("pressure_sensor_status"),
            pir_status=data.get("pir_status"),
            gps_status=data.get("gps_status"),
        )
        mark_node_online(db, node)
        db.add(diagnostic)
        db.commit()
        print(f"stored diagnostic #{diagnostic.diagnostic_id} from node {node_id}")
    finally:
        db.close()


def store_heartbeat(node_id: int, data: dict) -> None:
    db = SessionLocal()
    try:
        node = db.scalars(select(models.Node).where(models.Node.node_id == node_id)).first()
        if not node:
            print(f"heartbeat ignored, node {node_id} does not exist")
            return
        if not token_belongs_to_node_owner(data.get("token"), node):
            print(f"heartbeat ignored, token is missing or wrong for node {node_id}")
            return
        mark_node_online(db, node)
        db.commit()
    finally:
        db.close()


def on_message(client, userdata, msg):
    # topic looks like vivariumiq/<node_id>/<kind>
    parts = msg.topic.split("/")
    if len(parts) != 3 or parts[0] != "vivariumiq":
        return
    try:
        node_id = int(parts[1])
    except ValueError:
        return
    kind = parts[2]
    try:
        data = json.loads(msg.payload)
    except ValueError:
        print(f"ignored message on {msg.topic} (payload is not valid json)")
        return

    if kind == "reading":
        store_reading(node_id, data)
    elif kind == "diagnostic":
        store_diagnostic(node_id, data)
    elif kind == "heartbeat":
        store_heartbeat(node_id, data)
    else:
        print(f"ignored message on {msg.topic} (unknown kind)")


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        client.subscribe("vivariumiq/#")
        if MQTT_TLS:
            print(f"connected to mqtt broker {MQTT_BROKER}:{MQTT_PORT} over tls, listening for node messages")
        else:
            print(f"connected to mqtt broker {MQTT_BROKER}:{MQTT_PORT}, listening for node messages")
    else:
        print(f"mqtt connection failed: {reason_code}")


def _connect_and_listen(client: mqtt.Client) -> None:
    # in docker compose the api can start before the broker is accepting
    # connections, so keep retrying instead of giving up on the first failure
    while _client is client:
        try:
            client.connect(MQTT_BROKER, MQTT_PORT, 60)
        except OSError as error:
            print(f"could not connect to mqtt broker: {error}, retrying in 5 seconds")
            time.sleep(5)
            continue
        client.loop_forever()
        return


def start_mqtt_listener():
    global _client
    _client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    _client.on_connect = on_connect
    _client.on_message = on_message
    if MQTT_TLS:
        _client.tls_set(ca_certs=MQTT_CA_FILE)
    # paho needs a loop running to handle the network traffic,
    # so we give it its own background thread
    thread = threading.Thread(target=_connect_and_listen, args=(_client,), daemon=True)
    thread.start()


def stop_mqtt_listener():
    global _client
    if _client is not None:
        client, _client = _client, None
        client.disconnect()

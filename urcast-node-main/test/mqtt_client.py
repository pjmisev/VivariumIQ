# Publishes the node's data to the API over MQTT.
#
# The api runs a Mosquitto broker, and the node sends everything to topics like:
#   urcast/<node_id>/reading    -> sensor sample
#   urcast/<node_id>/diagnostic -> sensor health
#   urcast/<node_id>/heartbeat  -> still online
#
# The node id and token have to be set below before running on the Pi.
# The token comes from logging in to the api (see register_node.py) and the
# api checks it on every message, so the node can't send anything without it.

import json

import paho.mqtt.publish as publish

# change these before running on the Pi
MQTT_BROKER = "localhost"  # on the Pi put the ip of the server here
NODE_ID = 1  # the id you got when the node was registered
NODE_TOKEN = "paste-your-jwt-token-here"  # login token, the node needs it for every message


def send_reading(temperature=None, humidity=None, pressure=None, light_level=None):
    """Send one raw sensor sample. Returns True if the broker took it."""
    payload = {
        "temperature": temperature,
        "humidity": humidity,
        "pressure": pressure,
        "light_level": light_level,
        "token": NODE_TOKEN,
    }
    return _publish("reading", payload)


def send_diagnostic(light_ok, air_ok, pressure_ok):
    """Report which sensors are working so the backend can track node health."""
    payload = {
        "dht22_status": air_ok,
        "pressure_sensor_status": pressure_ok,
        "light_sensor_status": light_ok,
        "token": NODE_TOKEN,
    }
    return _publish("diagnostic", payload)


def send_heartbeat():
    """Tell the api the node is still online (updates status and last_seen)."""
    return _publish("heartbeat", {"token": NODE_TOKEN})


def _publish(kind, payload):
    try:
        publish.single(
            f"urcast/{NODE_ID}/{kind}",
            json.dumps(payload),
            hostname=MQTT_BROKER,
        )
        return True
    except Exception as error:
        print(f"could not send {kind} (no connection to broker): {error}")
        return False

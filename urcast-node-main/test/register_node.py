# One-off script to register this Pi on the urcast API.
#
# The api only creates a node for a logged in user, so you need a jwt token.
# Log in with curl (or the swagger ui), paste the token below, run this once
# and it prints the node id to put into mqtt_client.py.
#
#   curl -X POST http://<api-host>:8000/api/auth/login \
#     -H "Content-Type: application/json" \
#     -d '{"email": "you@example.com", "password": "..."}'
#
# then:
#   python register_node.py

import requests

API_URL = "http://localhost:8000"
NODE_TOKEN = "paste-your-jwt-token-here"
NODE_NAME = "pi5-outdoor"
NODE_LOCATION = "Dublin, Ireland"


def register():
    response = requests.post(
        f"{API_URL}/api/node",
        json={
            "node_name": NODE_NAME,
            "location_name": NODE_LOCATION,
        },
        headers={"Authorization": f"Bearer {NODE_TOKEN}"},
    )
    if response.status_code == 201:
        node = response.json()
        print(f"node registered, id = {node['node_id']}")
        print("put this id and your token into mqtt_client.py")
        return node
    print(f"registration failed ({response.status_code}): {response.text}")
    return None


if __name__ == "__main__":
    register()

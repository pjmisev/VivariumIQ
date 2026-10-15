# VivariumIQ

VivariumIQ is a full-stack IoT remote monitoring and behavioral tracking system designed for exotic pet enclosures. Built around a Raspberry Pi 400 and a complete sensor array, the application captures microclimate telemetry, atmospheric pressure trends, regional positioning, and physical security events. Data streams securely via an MQTT pub-sub broker to a cloud-hosted FastAPI backend, where it computes a biological activity index and presents it through a web dashboard.

---

## System Architecture and Hardware

**Controller:** Raspberry Pi 400

**Sensor and Actuator Array:**
* Temperature and humidity sensors for microclimate monitoring
* Barometer for atmospheric pressure and seasonal trend analysis
* GPS sensor for regional coordinate tracking and native hemisphere day-length calculations
* PIR sensor for tank intrusion and animal movement detection
* LED light and piezo buzzer for local visual and audible alerts


**Communication Protocol:** MQTTS, HTTPS for front-end webpages

**Backend and Frontend:** FastAPI, HTML templates with TailwindCSS styling

**Database:** MySQL

**Cloud Infrastructure:** Deployed on AWS

---

## Key Features

* **Health Status Banner:** A front-and-center, color-coded dashboard indicator reflecting overall system and environmental health (Optimal, Environmental Drift, Critical Alert).
* **Biological Clock and Liveliness Index:** Automatically processes environmental streams alongside native regional GPS data to estimate behavioral shifts, activity levels, etc.
* **Multi-Pet Management:** Switch between different animal profiles from a unified web interface to manage multiple enclosures or a multi-species room.
* **Bidirectional Actuator Control:** Remotely trigger local warning LEDs or piezo buzzers on the Raspberry Pi directly from the cloud web dashboard via MQTT commands.

---

## Security Implementation

To adhere strictly to project safety and security guidelines:

* **Authentication:** All web endpoints and dashboard routes require secure user login. Passwords are securely hashed.
* **Data in Transit:** Communications between the Raspberry Pi and AWS use MQTTS (TLS encryption), and web traffic uses HTTPS with a custom domain.
* **Data at Rest:** Database connections are secured, and all secret keys, database credentials, and broker tokens are stored exclusively in environment variables.
* **Server Hardening:** The server is configured with secure, non-default production settings.

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/pjmisev/VivariumIQ.git
cd VivariumIQ

```

---

## Screencast and Demo Link

A complete video walkthrough detailing the system architecture, security implementations, live end-to-end functionality demo, and known issues will be available below:

* [Link to Screencast/Demo]

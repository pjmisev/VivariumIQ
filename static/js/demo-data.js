(function () {
  "use strict";

  const STATE_KEY = "viq_demo_state";
  const STATE_TTL = 2 * 60 * 60 * 1000;
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const DEMO_USER_ID = 1;

  const DEMO_PRESETS = {
    crested_gecko: { name: "Crested Gecko", temperature_min: 20, temperature_max: 25, humidity_min: 60, humidity_max: 80, pressure_min: 990, pressure_max: 1030 },
    bearded_dragon: { name: "Bearded Dragon", temperature_min: 28, temperature_max: 38, humidity_min: 30, humidity_max: 50, pressure_min: 990, pressure_max: 1030 },
    pacman_frog: { name: "Pac-Man Frog", temperature_min: 24, temperature_max: 28, humidity_min: 70, humidity_max: 85, pressure_min: 990, pressure_max: 1030 },
    leopard_gecko: { name: "Leopard Gecko", temperature_min: 28, temperature_max: 32, humidity_min: 30, humidity_max: 40, pressure_min: 990, pressure_max: 1030 },
  };

  function iso(ms) {
    return new Date(ms).toISOString();
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  function hash(a, b, c) {
    let x = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 3266489917) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  function unit(a, b, c) {
    return (hash(a, b, c) % 100000) / 100000;
  }

  function jitter(a, b, c, amount) {
    return (unit(a, b, c) - 0.5) * amount;
  }

  function clone(value) {
    if (value === undefined) return null;
    return JSON.parse(JSON.stringify(value));
  }

  function makeTarget(nodeId, input) {
    const source = input || {};
    const presetKey = source.preset_key === undefined ? null : source.preset_key;
    const preset = presetKey && DEMO_PRESETS[presetKey] ? DEMO_PRESETS[presetKey] : null;
    const presetName = source.preset_name !== undefined && source.preset_name !== null ? source.preset_name : (preset ? preset.name : null);
    const pick = (field) => {
      if (source[field] !== undefined && source[field] !== null) return source[field];
      if (preset) return preset[field];
      return null;
    };
    return {
      node_id: nodeId,
      preset_key: presetKey,
      preset_name: presetName,
      temperature_min: pick("temperature_min"),
      temperature_max: pick("temperature_max"),
      humidity_min: pick("humidity_min"),
      humidity_max: pick("humidity_max"),
      pressure_min: pick("pressure_min"),
      pressure_max: pick("pressure_max"),
      updated_at: iso(Date.now()),
    };
  }

  function apiError(message, status) {
    return new API.ApiError(message, status);
  }

  function unavailable() {
    return apiError("This action is not available in demo mode.", 501);
  }

  function notFound(message) {
    return apiError(message || "Not found", 404);
  }

  function enabled() {
    return Boolean(document.body && document.body.dataset.demo === "true");
  }

  function saveState(state) {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function reset() {
    try {
      sessionStorage.removeItem(STATE_KEY);
    } catch (_) {}
  }

  function loadState() {
    let state = null;
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (_) {
      state = null;
    }
    if (!isValid(state) || Date.now() - state.created_at > STATE_TTL) {
      state = seedState();
      saveState(state);
    }
    return state;
  }

  function isValid(state) {
    return Boolean(
      state &&
        typeof state === "object" &&
        state.user &&
        typeof state.created_at === "number" &&
        Array.isArray(state.nodes) &&
        Array.isArray(state.readings) &&
        Array.isArray(state.diagnostics) &&
        Array.isArray(state.alerts) &&
        state.counters
    );
  }

  function seedState() {
    const now = Date.now();
    const state = {
      created_at: now,
      user: {
        user_id: DEMO_USER_ID,
        username: "Demo keeper",
        email: "demo@vivariumiq.local",
        role: "demo",
        created_at: iso(now - 90 * DAY),
      },
      nodes: [
        {
          node_id: 1,
          user_id: DEMO_USER_ID,
          node_name: "Rainforest canopy",
          location_name: "Living room \u00b7 warm shelf",
          latitude: 53.3498,
          longitude: -6.2603,
          status: "active",
          installed_at: iso(now - 46 * DAY),
          last_seen: iso(now - 2 * MINUTE),
          targets: makeTarget(1, { preset_key: "crested_gecko" }),
        },
        {
          node_id: 2,
          user_id: DEMO_USER_ID,
          node_name: "Arid burrow",
          location_name: "Study \u00b7 south wall",
          latitude: 53.35,
          longitude: -6.26,
          status: "active",
          installed_at: iso(now - 33 * DAY),
          last_seen: iso(now - 4 * MINUTE),
          targets: makeTarget(2, { preset_key: "leopard_gecko" }),
        },
        {
          node_id: 3,
          user_id: DEMO_USER_ID,
          node_name: "Quarantine box",
          location_name: "Utility room",
          latitude: null,
          longitude: null,
          status: "inactive",
          installed_at: iso(now - 12 * DAY),
          last_seen: iso(now - 6 * HOUR),
          targets: makeTarget(3, { preset_key: "pacman_frog" }),
        },
      ],
      readings: [],
      diagnostics: [],
      alerts: [
        { alert_id: 1, user_id: DEMO_USER_ID, node_id: 1, measurement_type: "humidity", comparison_operator: "<", threshold_value: 60, enabled: true, created_at: iso(now - 20 * DAY) },
        { alert_id: 2, user_id: DEMO_USER_ID, node_id: 2, measurement_type: "temperature", comparison_operator: ">", threshold_value: 34, enabled: true, created_at: iso(now - 15 * DAY) },
        { alert_id: 3, user_id: DEMO_USER_ID, node_id: 1, measurement_type: "temperature", comparison_operator: ">", threshold_value: 28, enabled: false, created_at: iso(now - 9 * DAY) },
        { alert_id: 4, user_id: DEMO_USER_ID, node_id: 3, measurement_type: "temperature", comparison_operator: "<", threshold_value: 23, enabled: true, created_at: iso(now - 3 * DAY) },
      ],
      counters: { node_id: 3, reading_id: 0, diagnostic_id: 0, alert_id: 4 },
    };

    buildReadings(state, now);
    buildDiagnostics(state, now);
    return state;
  }

  function buildReadings(state, now) {
    const step = 10 * MINUTE;
    const count = 144;
    const profiles = [
      { node_id: 1, temperature: 24.6, humidity: 68, pressure: 1013.2, phase: 0.0, end: now, motionRate: 0.08 },
      { node_id: 2, temperature: 31.2, humidity: 42, pressure: 1009.4, phase: 1.7, end: now, motionRate: 0.18 },
      { node_id: 3, temperature: 22.2, humidity: 55, pressure: 1010.1, phase: 3.1, end: now - 6 * HOUR, motionRate: 0.03 },
    ];

    profiles.forEach((profile) => {
      for (let i = count - 1; i >= 0; i--) {
        const recordedAt = profile.end - i * step;
        const idx = count - 1 - i;
        state.readings.push(makeReading(state, profile, idx, recordedAt));
      }
    });
  }

  function makeReading(state, profile, idx, recordedAt) {
    const id = profile.node_id;
    return {
      reading_id: (state.counters.reading_id += 1),
      node_id: id,
      temperature: round2(profile.temperature + Math.sin(idx / 6 + profile.phase) * 0.5 + jitter(idx, id, 1, 0.25)),
      humidity: round2(profile.humidity + Math.sin(idx / 5.5 + profile.phase + 1.2) * 2 + jitter(idx, id, 2, 1)),
      pressure: round2(profile.pressure + Math.sin(idx / 9 + profile.phase) * 1.1 + jitter(idx, id, 3, 0.6)),
      motion_detected: unit(idx, id, 7) < profile.motionRate,
      recorded_at: iso(recordedAt),
    };
  }

  function buildDiagnostics(state, now) {
    const step = 2 * HOUR;
    const points = 13;
    const specs = [
      { node_id: 1, end: now, gps_status: true, pir_status: true },
      { node_id: 2, end: now, gps_status: false, pir_status: true },
      { node_id: 3, end: now - 6 * HOUR, gps_status: false, pir_status: false },
    ];

    specs.forEach((spec) => {
      for (let i = points - 1; i >= 0; i--) {
        const recordedAt = spec.end - i * step;
        const seq = points - 1 - i;
        state.diagnostics.push({
          diagnostic_id: (state.counters.diagnostic_id += 1),
          node_id: spec.node_id,
          uptime: 3600 + seq * 7200 + spec.node_id * 137,
          wifi_connected: true,
          dht22_status: true,
          pressure_sensor_status: true,
          pir_status: spec.pir_status,
          gps_status: spec.gps_status,
          recorded_at: iso(recordedAt),
        });
      }
    });
  }

  function accumulate(bucket, reading) {
    if (typeof reading.temperature === "number") {
      bucket.temperature += reading.temperature;
      bucket.temperatureCount += 1;
      bucket.minTemperature = Math.min(bucket.minTemperature, reading.temperature);
      bucket.maxTemperature = Math.max(bucket.maxTemperature, reading.temperature);
    }
    if (typeof reading.humidity === "number") {
      bucket.humidity += reading.humidity;
      bucket.humidityCount += 1;
    }
    if (typeof reading.pressure === "number") {
      bucket.pressure += reading.pressure;
      bucket.pressureCount += 1;
    }
    if (reading.motion_detected) bucket.motionCount += 1;
    bucket.readingCount += 1;
  }

  function newBucket() {
    return {
      temperature: 0,
      temperatureCount: 0,
      humidity: 0,
      humidityCount: 0,
      pressure: 0,
      pressureCount: 0,
      motionCount: 0,
      minTemperature: Infinity,
      maxTemperature: -Infinity,
      readingCount: 0,
    };
  }

  function hourlyAverages(bucket) {
    return {
      avg_temperature: bucket.temperatureCount ? round2(bucket.temperature / bucket.temperatureCount) : null,
      avg_humidity: bucket.humidityCount ? round2(bucket.humidity / bucket.humidityCount) : null,
      avg_pressure: bucket.pressureCount ? round2(bucket.pressure / bucket.pressureCount) : null,
      motion_count: bucket.motionCount,
      min_temperature: bucket.readingCount ? round2(bucket.minTemperature) : null,
      max_temperature: bucket.readingCount ? round2(bucket.maxTemperature) : null,
      reading_count: bucket.readingCount,
    };
  }

  function computeHourly(state, nodeId) {
    const buckets = new Map();
    state.readings.forEach((reading) => {
      if (reading.node_id !== nodeId) return;
      const key = `${reading.recorded_at.slice(0, 13)}:00:00.000Z`;
      if (!buckets.has(key)) buckets.set(key, newBucket());
      accumulate(buckets.get(key), reading);
    });
    return Array.from(buckets.keys())
      .sort()
      .map((hourStart, index) => Object.assign({ summary_id: index + 1, node_id: nodeId, hour_start: hourStart }, hourlyAverages(buckets.get(hourStart))))
      .reverse();
  }

  function computeDaily(state, nodeId) {
    const buckets = new Map();
    state.readings.forEach((reading) => {
      if (reading.node_id !== nodeId) return;
      const key = reading.recorded_at.slice(0, 10);
      if (!buckets.has(key)) buckets.set(key, newBucket());
      accumulate(buckets.get(key), reading);
    });
    return Array.from(buckets.keys())
      .sort()
      .map((day) => Object.assign({ date: day }, hourlyAverages(buckets.get(day))))
      .reverse();
  }

  function ascendingNumeric(a, b, field) {
    return a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0;
  }

  function descendingTime(rows) {
    return rows.sort((a, b) => ascendingNumeric(b, a, "recorded_at") || (b.reading_id || 0) - (a.reading_id || 0));
  }

  function intParam(params, name) {
    const raw = params.get(name);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function filterByQuery(state, rows, params) {
    const nodeId = intParam(params, "node_id");
    const userId = intParam(params, "user_id");
    const limit = intParam(params, "limit");
    let result = rows;
    if (nodeId !== null) result = result.filter((row) => row.node_id === nodeId);
    if (userId !== null) {
      const owned = new Set(state.nodes.filter((node) => node.user_id === userId).map((node) => node.node_id));
      result = result.filter((row) => owned.has(row.node_id));
    }
    result = descendingTime(result.slice());
    if (limit !== null && limit >= 0) result = result.slice(0, limit);
    return result;
  }

  function findNode(state, nodeId) {
    return state.nodes.find((node) => node.node_id === nodeId) || null;
  }

  function findAlert(state, alertId) {
    return state.alerts.find((alert) => alert.alert_id === alertId) || null;
  }

  function requireDemoUser(userId) {
    if (Number(userId) !== DEMO_USER_ID) throw apiError("You can only manage the demo account.", 403);
  }

  function handle(state, pathname, params, method, body) {
    const segments = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (segments[0] !== "api") throw unavailable();
    const root = segments[1];
    const length = segments.length;

    if (root === "auth") {
      if (length === 3 && segments[2] === "me" && method === "GET") return clone(state.user);
      throw unavailable();
    }

    if (root === "nodes") {
      if (length === 2 && method === "GET") {
        return clone(state.nodes.slice().sort((a, b) => String(a.node_name).localeCompare(String(b.node_name))));
      }
      if (length === 5 && segments[3] === "summaries" && method === "GET") {
        const nodeId = Number(segments[2]);
        if (segments[4] === "hourly") return clone(computeHourly(state, nodeId));
        if (segments[4] === "daily") return clone(computeDaily(state, nodeId));
      }
      throw unavailable();
    }

    if (root === "node") {
      if (length === 2 && method === "POST") {
        const node = {
          node_id: (state.counters.node_id += 1),
          user_id: DEMO_USER_ID,
          node_name: body.node_name,
          location_name: body.location_name === undefined ? null : body.location_name,
          latitude: body.latitude === undefined ? null : body.latitude,
          longitude: body.longitude === undefined ? null : body.longitude,
          status: "inactive",
          installed_at: iso(Date.now()),
          last_seen: null,
          targets: null,
        };
        if (body.targets !== undefined && body.targets !== null) {
          node.targets = makeTarget(node.node_id, body.targets);
        }
        state.nodes.push(node);
        saveState(state);
        return clone(node);
      }
      if (length === 3) {
        const nodeId = Number(segments[2]);
        const node = findNode(state, nodeId);
        if (method === "GET") {
          if (!node) throw notFound("Node not found");
          return clone(node);
        }
        if (method === "PATCH") {
          if (!node) throw notFound("Node not found");
          ["node_name", "location_name", "latitude", "longitude", "status"].forEach((field) => {
            if (body[field] !== undefined) node[field] = body[field];
          });
          saveState(state);
          return clone(node);
        }
        if (method === "DELETE") {
          if (!node) throw notFound("Node not found");
          state.nodes = state.nodes.filter((item) => item.node_id !== nodeId);
          state.readings = state.readings.filter((item) => item.node_id !== nodeId);
          state.diagnostics = state.diagnostics.filter((item) => item.node_id !== nodeId);
          state.alerts = state.alerts.filter((item) => item.node_id !== nodeId);
          saveState(state);
          return null;
        }
      }
      if (length === 4 && segments[3] === "targets") {
        const nodeId = Number(segments[2]);
        const node = findNode(state, nodeId);
        if (!node) throw notFound("Node not found");
        if (node.user_id !== DEMO_USER_ID) throw apiError("Not allowed to modify this node", 403);
        if (method === "GET") {
          if (!node.targets) throw notFound("Node targets not found");
          return clone(node.targets);
        }
        if (method === "PUT") {
          node.targets = makeTarget(nodeId, body);
          saveState(state);
          return clone(node.targets);
        }
        if (method === "DELETE") {
          node.targets = null;
          saveState(state);
          return null;
        }
      }
      throw unavailable();
    }

    if (root === "readings" && length === 2 && method === "GET") {
      return clone(filterByQuery(state, state.readings, params));
    }

    if (root === "diagnostics" && length === 2 && method === "GET") {
      return clone(filterByQuery(state, state.diagnostics, params));
    }

    if (root === "alerts" && length === 2 && method === "GET") {
      const rows = state.alerts.filter((alert) => alert.user_id === DEMO_USER_ID);
      return clone(rows.slice().sort((a, b) => ascendingNumeric(b, a, "created_at") || b.alert_id - a.alert_id));
    }

    if (root === "alert") {
      if (length === 2 && method === "POST") {
        const alert = {
          alert_id: (state.counters.alert_id += 1),
          user_id: DEMO_USER_ID,
          node_id: body.node_id,
          measurement_type: body.measurement_type,
          comparison_operator: body.comparison_operator,
          threshold_value: body.threshold_value,
          enabled: body.enabled === undefined ? true : Boolean(body.enabled),
          created_at: iso(Date.now()),
        };
        state.alerts.push(alert);
        saveState(state);
        return clone(alert);
      }
      if (length === 3) {
        const alertId = Number(segments[2]);
        const alert = findAlert(state, alertId);
        if (method === "PATCH") {
          if (!alert) throw notFound("Alert not found");
          ["node_id", "measurement_type", "comparison_operator", "threshold_value", "enabled"].forEach((field) => {
            if (body[field] !== undefined) alert[field] = body[field];
          });
          saveState(state);
          return clone(alert);
        }
        if (method === "DELETE") {
          if (!alert) throw notFound("Alert not found");
          state.alerts = state.alerts.filter((item) => item.alert_id !== alertId);
          saveState(state);
          return null;
        }
      }
      throw unavailable();
    }

    if (root === "user") {
      if (length === 3) {
        requireDemoUser(segments[2]);
        if (method === "PATCH") {
          if (body.username !== undefined) state.user.username = body.username;
          if (body.email !== undefined) state.user.email = body.email;
          saveState(state);
          return clone(state.user);
        }
        if (method === "DELETE") return null;
      }
      throw unavailable();
    }

    throw unavailable();
  }

  function request(path, config) {
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = new URL(path, window.location.origin);
      } catch (_) {
        reject(unavailable());
        return;
      }
      const options = config || {};
      const method = String(options.method || "GET").toUpperCase();
      const body = options.body || {};
      try {
        const state = loadState();
        resolve(handle(state, url.pathname, url.searchParams, method, body));
      } catch (error) {
        reject(error);
      }
    });
  }

  window.DemoMode = { enabled, request, reset };
})();

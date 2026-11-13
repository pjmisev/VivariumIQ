(function () {
  "use strict";

  const state = {
    chart: null,
    zoomController: null,
    loading: false,
    user: null,
  };


  function metric(value, unit, digits) {
    if (value === null || value === undefined || value === "") return "—";
    return `${API.formatNumber(value, digits === undefined ? 1 : digits)}${unit}`;
  }

  function isLive(node) {
    if (!node) return false;
    const lastSeen = API.parseDate(node.last_seen);
    if (!lastSeen || Number.isNaN(lastSeen.getTime())) return node.status === "active";
    return Date.now() - lastSeen.getTime() < 15 * 60 * 1000;
  }

  function groupByNode(readings) {
    const map = new Map();
    readings.forEach((reading) => {
      if (!map.has(reading.node_id)) map.set(reading.node_id, []);
      map.get(reading.node_id).push(reading);
    });
    map.forEach((list) => list.sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at)));
    return map;
  }

  function latestFor(grouped, nodeId) {
    return (grouped.get(nodeId) || [])[0] || null;
  }

  function averageFromLatest(nodes, grouped, key) {
    const values = nodes
      .map((node) => latestFor(grouped, node.node_id))
      .filter(Boolean)
      .map((reading) => reading[key])
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map(Number)
      .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function setHealth(tone, title, message, badge) {
    const banner = document.getElementById("health-banner");
    const icon = document.getElementById("health-icon");
    const titleElement = document.getElementById("health-title");
    const messageElement = document.getElementById("health-message");
    const badgeElement = document.getElementById("health-badge");
    if (!banner) return;
    const tones = {
      success: { border: "border-success/20 border-l-success", bg: "bg-success/5", icon: "bg-success/12 text-success", badge: "badge-success" },
      warning: { border: "border-warning/25 border-l-warning", bg: "bg-warning/5", icon: "bg-warning/15 text-warning", badge: "badge-warning" },
      error: { border: "border-error/20 border-l-error", bg: "bg-error/5", icon: "bg-error/12 text-error", badge: "badge-error" },
      neutral: { border: "border-base-content/8 border-l-base-content/20", bg: "bg-base-100", icon: "bg-base-200 text-base-content/50", badge: "badge-ghost" },
    };
    const style = tones[tone] || tones.neutral;
    banner.className = `mt-6 flex flex-col gap-4 rounded-2xl border border-l-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${style.border} ${style.bg}`;
    if (icon) icon.className = `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.icon}`;
    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;
    if (badgeElement) {
      badgeElement.className = `badge badge-sm self-start sm:self-auto ${style.badge}`;
      badgeElement.textContent = badge;
    }
  }

  function setStat(name, value, description) {
    document.querySelectorAll(`[data-stat-value="${name}"]`).forEach((element) => {
      element.textContent = value;
    });
    if (description) {
      document.querySelectorAll(`[data-stat-desc="${name}"]`).forEach((element) => {
        element.textContent = description;
      });
    }
  }

  function renderSnapshot(nodes, grouped, readings, todayMotion) {
    const temperature = averageFromLatest(nodes, grouped, "temperature");
    const humidity = averageFromLatest(nodes, grouped, "humidity");
    const pressure = averageFromLatest(nodes, grouped, "pressure");
    const latestReading = readings[0];
    document.querySelectorAll('[data-snapshot="temperature"]').forEach((element) => {
      element.textContent = metric(temperature, "°C");
    });
    document.querySelectorAll('[data-snapshot="humidity"]').forEach((element) => {
      element.textContent = metric(humidity, "%", 0);
    });
    document.querySelectorAll('[data-snapshot="pressure"]').forEach((element) => {
      element.textContent = metric(pressure, " hPa", 0);
    });
    document.querySelectorAll('[data-snapshot="motion"]').forEach((element) => {
      element.textContent = `${API.formatInteger(todayMotion)} events`;
    });
    document.querySelectorAll('[data-snapshot="latest"]').forEach((element) => {
      element.textContent = latestReading ? `${API.timeAgo(latestReading.recorded_at)} · ${API.formatTime(latestReading.recorded_at)}` : "No samples yet";
    });
    document.querySelectorAll("[data-reading-count]").forEach((element) => {
      element.textContent = `${API.formatInteger(readings.length)} readings`;
    });
  }

  function renderChart(readings) {
    const canvas = document.getElementById("dashboard-chart");
    const empty = document.getElementById("dashboard-chart-empty");
    if (!canvas) return;

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let points = readings
      .filter((reading) => {
        const date = API.parseDate(reading.recorded_at);
        return date && date.getTime() >= cutoff;
      })
      .sort((a, b) => API.parseDate(a.recorded_at) - API.parseDate(b.recorded_at));

    if (points.length > 90) {
      const step = Math.ceil(points.length / 90);
      points = points.filter((_, index) => index % step === 0 || index === points.length - 1);
    }

    if (state.zoomController) {
      state.zoomController.destroy();
      state.zoomController = null;
    }
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    const panSlider = document.querySelector("[data-chart-pan-slider]");
    if (panSlider) panSlider.classList.add("hidden");

    const hasData = points.some((reading) => reading.temperature !== null || reading.humidity !== null);
    if (!hasData) {
      canvas.classList.add("hidden");
      if (empty) empty.classList.remove("hidden");
      return;
    }
    canvas.classList.remove("hidden");
    if (empty) empty.classList.add("hidden");

    if (!window.Chart) {
      canvas.classList.add("hidden");
      if (empty) {
        empty.classList.remove("hidden");
        empty.innerHTML = '<p class="text-xs font-medium">Charts could not load. Check your connection and refresh.</p>';
      }
      return;
    }

    const labels = points.map((reading) => API.formatTime(reading.recorded_at));
    const temperatures = points.map((reading) => (reading.temperature === null ? null : Number(reading.temperature)));
    const humidity = points.map((reading) => (reading.humidity === null ? null : Number(reading.humidity)));
    const tempValues = temperatures.filter((value) => Number.isFinite(value));
    const textColor = "#64748b";
    const gridColor = "rgba(100, 116, 139, 0.12)";

    state.chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temperature",
            data: temperatures.map((value, index) => ({ x: index, y: value })),
            borderColor: "#527c9f",
            backgroundColor: "rgba(82, 124, 159, 0.08)",
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 18,
            tension: 0.35,
            fill: true,
            yAxisID: "y",
          },
          {
            label: "Humidity",
            data: humidity.map((value, index) => ({ x: index, y: value })),
            borderColor: "#84cc16",
            backgroundColor: "rgba(132, 204, 22, 0.06)",
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 18,
            tension: 0.35,
            fill: false,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        hover: { mode: "index", intersect: false, animationDuration: 80 },
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0f172a",
            padding: 12,
            caretPadding: 8,
            cornerRadius: 8,
            titleFont: { family: "Inter", size: 11 },
            bodyFont: { family: "Inter", size: 11 },
            callbacks: {
              title(items) {
                const index = items && items[0] ? Math.round(items[0].parsed.x) : 0;
                return labels[index] || "";
              },
              label(context) {
                const unit = context.dataset.yAxisID === "y1" ? "%" : " °C";
                return `${context.dataset.label}: ${API.formatNumber(context.parsed.y, 1)}${unit}`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            min: 0,
            max: Math.max(0, points.length - 1),
            grid: { display: false },
            ticks: {
              color: textColor,
              maxTicksLimit: 8,
              precision: 0,
              font: { family: "Inter", size: 10 },
              callback: (value) => labels[Math.round(value)] || "",
            },
            border: { display: false },
          },
          y: {
            position: "left",
            suggestedMin: tempValues.length ? Math.min(...tempValues) - 2 : undefined,
            suggestedMax: tempValues.length ? Math.max(...tempValues) + 2 : undefined,
            grid: { color: gridColor },
            ticks: { color: textColor, font: { family: "Inter", size: 10 }, callback: (value) => `${value}°` },
            border: { display: false },
          },
          y1: {
            position: "right",
            suggestedMin: 0,
            suggestedMax: 100,
            grid: { drawOnChartArea: false },
            ticks: { color: textColor, font: { family: "Inter", size: 10 }, callback: (value) => `${value}%` },
            border: { display: false },
          },
        },
      },
    });

    if (window.ChartZoom) {
      state.zoomController = ChartZoom.attach(canvas, state.chart, { minSpan: 8 });
    }
  }

  function sparkline(values) {
    const data = values.filter((value) => Number.isFinite(Number(value))).map(Number);
    if (data.length < 2) {
      return '<svg viewBox="0 0 120 32" class="h-8 w-full" preserveAspectRatio="none" aria-hidden="true"><path d="M0 24 L120 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.35"/></svg>';
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = 120 / (data.length - 1);
    const points = data.map((value, index) => {
      const x = index * step;
      const y = 28 - ((value - min) / range) * 24;
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return `<svg viewBox="0 0 120 32" class="h-8 w-full" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points.join(" ")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderNodes(nodes, grouped, targetStates) {
    const container = document.getElementById("dashboard-nodes");
    const empty = document.getElementById("dashboard-nodes-empty");
    if (!container) return;

    if (!nodes.length) {
      container.innerHTML = "";
      container.classList.add("hidden");
      if (empty) empty.classList.remove("hidden");
      return;
    }
    container.classList.remove("hidden");
    if (empty) empty.classList.add("hidden");

    container.innerHTML = nodes
      .map((node) => {
        const latest = latestFor(grouped, node.node_id);
        const live = isLive(node);
        const status = API.statusMeta(live ? "active" : "inactive");
        const readings = grouped.get(node.node_id) || [];
        const temperatures = readings
          .slice(0, 24)
          .reverse()
          .map((reading) => reading.temperature);
        const targetState = (targetStates && targetStates.get(node.node_id)) || API.evaluateTargets(node.targets, latest);
        const targetLabel = !targetState.configured
          ? "No targets"
          : (node.targets && node.targets.preset_name ? node.targets.preset_name : "Custom targets");
        const targetBadgeClass = targetState.tone === "success" ? "badge-success" : targetState.tone === "warning" ? "badge-warning" : "badge-ghost";
        const targetAccent = targetState.tone === "success" ? "border-l-success bg-success/5" : targetState.tone === "warning" ? "border-l-warning bg-warning/5" : "border-l-base-content/20";
        const targetPanel = targetState.tone === "success" ? "border-success/20 bg-success/10" : targetState.tone === "warning" ? "border-warning/25 bg-warning/10" : "border-base-content/10 bg-base-200/50";
        const targetDetail = API.targetDetail(node.targets, targetState);
        return `
          <article class="card card-lift relative overflow-hidden border-l-4 bg-base-100 ${targetAccent}">
            <a href="/app/nodes/${node.node_id}" class="block p-5">
              <div>
                <div class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${live ? "text-success" : "text-warning"}">
                  <span class="status-dot ${live ? "is-live" : ""}"></span>
                  ${status.label}
                </div>
                <h4 class="mt-2 truncate font-display text-base font-bold">${API.escapeHtml(node.node_name)}</h4>
                <p class="mt-1 flex items-center gap-1 truncate text-[11px] text-base-content/45">
                  ${node.location_name ? API.escapeHtml(node.location_name) : "No location set"}
                </p>
                <p class="mt-0.5 truncate text-[10px] text-base-content/40">${API.escapeHtml(targetLabel)}</p>
              </div>

              <div class="mt-3 rounded-xl border px-3 py-2.5 ${targetPanel}">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[9px] font-semibold uppercase tracking-[0.12em] text-base-content/45">Target health</span>
                  <span class="badge badge-sm ${targetBadgeClass}">${targetState.label}</span>
                </div>
                <p class="mt-1 text-[10px] leading-4 text-base-content/55">${API.escapeHtml(targetDetail)}</p>
              </div>

              <div class="mt-4 grid grid-cols-3 gap-2">
                <div class="rounded-xl bg-base-200/70 px-2.5 py-2">
                  <p class="text-[9px] font-medium uppercase tracking-wide text-base-content/40">Temp</p>
                  <p class="mt-0.5 text-sm font-bold tabular">${latest ? metric(latest.temperature, "°") : "—"}</p>
                </div>
                <div class="rounded-xl bg-base-200/70 px-2.5 py-2">
                  <p class="text-[9px] font-medium uppercase tracking-wide text-base-content/40">Humidity</p>
                  <p class="mt-0.5 text-sm font-bold tabular">${latest ? metric(latest.humidity, "%", 0) : "—"}</p>
                </div>
                <div class="rounded-xl bg-base-200/70 px-2.5 py-2">
                  <p class="text-[9px] font-medium uppercase tracking-wide text-base-content/40">Motion</p>
                  <p class="mt-0.5 text-sm font-bold">${latest ? (latest.motion_detected ? "Yes" : "No") : "—"}</p>
                </div>
              </div>
              <div class="mt-3 text-primary/60">${sparkline(temperatures)}</div>
              <div class="mt-2 flex items-center justify-between text-[10px] text-base-content/40">
                <span class="flex items-center gap-1">Last seen ${API.timeAgo(node.last_seen)}</span>
                <span class="font-semibold text-primary">Open →</span>
              </div>
            </a>
          </article>`;
      })
      .join("");
  }

  function renderAlerts(alerts, nodes, grouped) {
    const container = document.getElementById("dashboard-alerts");
    if (!container) return;
    if (!alerts.length) {
      container.innerHTML = `
        <div class="rounded-xl border border-dashed border-base-content/12 px-4 py-6 text-center">
          <p class="text-sm font-medium text-base-content/60">No alerts yet</p>
          <p class="mt-1 text-xs text-base-content/40">Set a threshold to be warned about drift.</p>
          <a href="/app/alerts" class="btn btn-ghost btn-xs mt-2 text-primary">Create an alert</a>
        </div>`;
      return;
    }

    const nodeNames = new Map(nodes.map((node) => [node.node_id, node.node_name]));
    container.innerHTML = alerts
      .slice(0, 4)
      .map((alert) => {
        const reading = latestFor(grouped, alert.node_id);
        const triggered = API.evaluateAlert(alert, reading);
        const measurement = API.MEASUREMENTS[alert.measurement_type] || { label: alert.measurement_type, unit: "" };
        const nodeName = nodeNames.get(alert.node_id) || `Node ${alert.node_id}`;
        return `
          <div class="flex items-center gap-3 rounded-xl border border-base-content/7 px-3 py-2.5">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${triggered ? "bg-error/12 text-error" : alert.enabled ? "bg-primary/10 text-primary" : "bg-base-200 text-base-content/35"}">
              <span class="h-2 w-2 rounded-full ${triggered ? "bg-error" : alert.enabled ? "bg-primary" : "bg-base-content/25"}"></span>
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-semibold">${API.escapeHtml(nodeName)}</p>
              <p class="truncate text-[10px] text-base-content/45">${measurement.label} ${API.escapeHtml(alert.comparison_operator)} ${API.formatNumber(alert.threshold_value, measurement.digits)}${measurement.unit}</p>
            </div>
            <span class="badge badge-xs ${triggered ? "badge-error" : alert.enabled ? "badge-success" : "badge-ghost"}">${triggered ? "Triggered" : alert.enabled ? "Armed" : "Paused"}</span>
          </div>`;
      })
      .join("");
  }

  function renderActivity(readings, nodes) {
    const container = document.getElementById("recent-activity");
    if (!container) return;
    if (!readings.length) {
      container.innerHTML = `
        <div class="rounded-xl border border-dashed border-base-content/12 px-4 py-6 text-center">
          <p class="text-sm font-medium text-base-content/60">Waiting for the first sample</p>
          <p class="mt-1 text-xs text-base-content/40">Once a node publishes, activity appears here.</p>
        </div>`;
      return;
    }
    const nodeNames = new Map(nodes.map((node) => [node.node_id, node.node_name]));
    container.innerHTML = readings
      .slice(0, 6)
      .map((reading) => `
        <div class="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-base-200/50">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-semibold">${API.escapeHtml(nodeNames.get(reading.node_id) || `Node ${reading.node_id}`)}</p>
            <p class="truncate text-[10px] text-base-content/45">
              ${metric(reading.temperature, "°C")} · ${metric(reading.humidity, "%", 0)} · ${reading.motion_detected ? "motion detected" : "no motion"}
            </p>
          </div>
          <span class="shrink-0 text-[10px] text-base-content/35">${API.timeAgo(reading.recorded_at)}</span>
        </div>`)
      .join("");
  }

  async function load() {
    if (state.loading || !state.user) return;
    state.loading = true;
    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) API.setButtonLoading(refreshButton, true, "Refreshing…");

    try {
      const [allNodes, allReadings, allAlerts, allDiagnostics] = await Promise.all([
        API.request("/api/nodes"),
        API.request(`/api/readings?user_id=${state.user.user_id}&limit=5000`),
        API.request("/api/alerts"),
        API.request(`/api/diagnostics?user_id=${state.user.user_id}&limit=500`),
      ]);

      const nodes = allNodes
        .filter((node) => node.user_id === state.user.user_id)
        .sort((a, b) => a.node_name.localeCompare(b.node_name));
      const nodeIds = new Set(nodes.map((node) => node.node_id));
      const readings = allReadings
        .filter((reading) => nodeIds.has(reading.node_id))
        .sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at));
      const alerts = allAlerts.filter((alert) => alert.user_id === state.user.user_id);
      const diagnostics = allDiagnostics
        .filter((diagnostic) => nodeIds.has(diagnostic.node_id))
        .sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at));

      const grouped = groupByNode(readings);
      const targetStates = new Map();
      nodes.forEach((node) => {
        targetStates.set(node.node_id, API.evaluateTargets(node.targets, latestFor(grouped, node.node_id)));
      });
      const liveCount = nodes.filter(isLive).length;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMotion = readings.filter((reading) => {
        const date = API.parseDate(reading.recorded_at);
        return date && date >= today && reading.motion_detected;
      }).length;
      const enabledAlerts = alerts.filter((alert) => alert.enabled);
      const triggered = enabledAlerts
        .map((alert) => ({ alert, reading: latestFor(grouped, alert.node_id) }))
        .filter(({ alert, reading }) => API.evaluateAlert(alert, reading));

      const configuredStates = Array.from(targetStates.values()).filter((item) => item.configured);
      const inRangeCount = configuredStates.filter((item) => item.tone === "success").length;
      const configuredCount = configuredStates.length;
      const targetSummary = {
        in: inRangeCount,
        attention: configuredStates.filter((item) => item.tone === "warning").length,
        none: Array.from(targetStates.values()).filter((item) => !item.configured).length,
      };
      document.querySelectorAll('[data-target-summary="in"]').forEach((element) => { element.textContent = API.formatInteger(targetSummary.in); });
      document.querySelectorAll('[data-target-summary="attention"]').forEach((element) => { element.textContent = API.formatInteger(targetSummary.attention); });
      document.querySelectorAll('[data-target-summary="none"]').forEach((element) => { element.textContent = API.formatInteger(targetSummary.none); });

      setStat("nodes", API.formatInteger(nodes.length), nodes.length ? `${nodes.length} registered` : "Add your first node");
      setStat("live", API.formatInteger(liveCount), `${liveCount} of ${nodes.length} reporting`);
      setStat("targets", configuredCount ? `${API.formatInteger(inRangeCount)}/${API.formatInteger(configuredCount)}` : "—", configuredCount ? `${configuredCount} with target ranges` : "No target ranges");
      setStat("alerts", API.formatInteger(enabledAlerts.length), `${alerts.length} total configured`);
      App.setAlertCount(enabledAlerts.length);

      const liveNodes = nodes.filter(isLive);
      const liveOutOfRange = liveNodes.filter((node) => {
        const item = targetStates.get(node.node_id);
        return item && item.configured && item.out > 0;
      });
      const liveMissingTargets = liveNodes.filter((node) => {
        const item = targetStates.get(node.node_id);
        return !item || !item.configured;
      });
      const liveWaitingForData = liveNodes.filter((node) => {
        const item = targetStates.get(node.node_id);
        return item && item.configured && item.tone === "warning" && item.out === 0;
      });
      const liveInRange = liveNodes.filter((node) => {
        const item = targetStates.get(node.node_id);
        return item && item.configured && item.tone === "success";
      }).length;

      if (!nodes.length) {
        setHealth("neutral", "No enclosures registered yet", "Add your first Raspberry Pi node to start collecting readings.", "Setup needed");
      } else if (!liveCount) {
        setHealth("warning", "Your nodes are quiet", "No readings have arrived in the last 15 minutes. Check the node power and Wi-Fi.", "No live nodes");
      } else if (liveOutOfRange.length) {
        const node = liveOutOfRange[0];
        const item = targetStates.get(node.node_id);
        const metric = item.metrics.find((entry) => entry.status === "low" || entry.status === "high") || item.metrics[0];
        setHealth(
          "warning",
          `${liveOutOfRange.length} enclosure${liveOutOfRange.length === 1 ? "" : "s"} outside target`,
          `${node.node_name}: ${metric.label.toLowerCase()} is ${API.formatNumber(metric.value, metric.digits)}${metric.unit} (target ${API.targetRangeLabel(metric)}).`,
          `${liveOutOfRange.length} need attention`
        );
      } else if (liveWaitingForData.length) {
        setHealth(
          "warning",
          "Waiting for target data",
          `${liveWaitingForData.length} enclosure${liveWaitingForData.length === 1 ? "" : "s"} have target ranges but no complete latest reading yet.`,
          "Waiting"
        );
      } else if (liveMissingTargets.length) {
        setHealth(
          "warning",
          "Targets need setting",
          `${liveMissingTargets.length} enclosure${liveMissingTargets.length === 1 ? "" : "s"} have no complete target range. Choose a species preset or custom values to track their health.`,
          "Setup needed"
        );
      } else if (triggered.length) {
        const { alert, reading } = triggered[0];
        const measurement = API.MEASUREMENTS[alert.measurement_type] || { label: alert.measurement_type, unit: "" };
        const nodeName = nodes.find((node) => node.node_id === alert.node_id)?.node_name || `Node ${alert.node_id}`;
        setHealth(
          "warning",
          "Environmental drift detected",
          `${nodeName}: ${measurement.label.toLowerCase()} is ${metric(reading[alert.measurement_type], measurement.unit, measurement.digits)} against a ${alert.comparison_operator} ${API.formatNumber(alert.threshold_value, measurement.digits)}${measurement.unit} threshold.`,
          `${triggered.length} alert${triggered.length === 1 ? "" : "s"}`
        );
      } else {
        setHealth("success", "All enclosures in target", `${liveInRange} of ${liveCount} enclosures within their target ranges.`, "Optimal");
      }

      renderSnapshot(nodes, grouped, readings, todayMotion);
      renderChart(readings);
      renderNodes(nodes, grouped, targetStates);
      renderAlerts(alerts, nodes, grouped);
      renderActivity(readings, nodes);

      document.querySelectorAll("[data-last-updated]").forEach((element) => {
        element.textContent = "just now";
      });

      if (diagnostics.length && nodes.length) {
        const nodeWithDiagnostic = nodes.find((node) => node.node_id === diagnostics[0].node_id);
        if (nodeWithDiagnostic) {
          const lastSeen = document.querySelector('[data-snapshot="latest"]');
          if (lastSeen) lastSeen.title = `Latest diagnostic: ${API.timeAgo(diagnostics[0].recorded_at)}`;
        }
      }
    } catch (error) {
      if (error.status !== 401) API.toast(error.message || "Could not load your dashboard.", "error");
      setHealth("error", "Could not load your data", "Refresh the page or check the server connection.", "Error");
    } finally {
      state.loading = false;
      if (refreshButton) API.setButtonLoading(refreshButton, false);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await App.init();
    if (!user) return;
    state.user = user;
    load();

    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) refreshButton.addEventListener("click", load);

    window.setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
  });
})();
(function () {
  "use strict";

  const state = {
    user: null,
    nodeId: Number(document.body.dataset.nodeId),
    node: null,
    readings: [],
    hourly: [],
    daily: [],
    diagnostics: [],
    alerts: [],
    chart: null,
    zoomController: null,
    chartMetric: "temperature",
    loading: false,
    alertsBusy: false,
  };

  const DIAGNOSTIC_KEYS = [
    { key: "wifi_connected", label: "Wi-Fi" },
    { key: "dht22_status", label: "DHT22" },
    { key: "pressure_sensor_status", label: "Pressure" },
    { key: "pir_status", label: "PIR" },
    { key: "gps_status", label: "GPS" },
  ];


  const targetBandPlugin = {
    id: "targetBand",
    beforeDatasetsDraw(chart, _args, options) {
      if (!options || options.min === null || options.max === null) return;
      const area = chart.chartArea;
      const yScale = chart.scales && chart.scales.y;
      if (!area || !yScale) return;
      const first = yScale.getPixelForValue(Math.min(options.max, yScale.max));
      const second = yScale.getPixelForValue(Math.max(options.min, yScale.min));
      if (!Number.isFinite(first) || !Number.isFinite(second)) return;
      const top = Math.max(area.top, Math.min(first, second));
      const bottom = Math.min(area.bottom, Math.max(first, second));
      if (bottom <= top) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = "rgba(132, 204, 22, 0.1)";
      ctx.fillRect(area.left, top, area.right - area.left, bottom - top);
      ctx.strokeStyle = "rgba(101, 163, 13, 0.35)";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(area.left, top);
      ctx.lineTo(area.right, top);
      ctx.moveTo(area.left, bottom);
      ctx.lineTo(area.right, bottom);
      ctx.stroke();
      ctx.restore();
    },
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

  function latestReading() {
    return state.readings[0] || null;
  }

  function latestDiagnostic() {
    return state.diagnostics[0] || null;
  }

  function formatUptime(seconds) {
    if (seconds === null || seconds === undefined) return "—";
    const total = Number(seconds);
    if (!Number.isFinite(total)) return "—";
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function statusPill(value) {
    if (value === true) return '<span class="badge badge-success badge-xs">OK</span>';
    if (value === false) return '<span class="badge badge-error badge-xs">Fail</span>';
    return '<span class="badge badge-ghost badge-xs">—</span>';
  }

  function iconTileClass(tone) {
    const map = {
      success: "bg-success/12 text-success",
      warning: "bg-warning/15 text-warning",
      error: "bg-error/12 text-error",
      neutral: "bg-base-200 text-base-content/45",
    };
    return map[tone] || map.neutral;
  }

  function targetLabel(node) {
    const targets = node && node.targets;
    if (!targets) return "No targets";
    const configured = ["temperature_min", "temperature_max", "humidity_min", "humidity_max", "pressure_min", "pressure_max"]
      .some((key) => targets[key] !== null && targets[key] !== undefined && targets[key] !== "");
    if (!configured) return "No targets";
    return targets.preset_name ? targets.preset_name : "Custom targets";
  }

  function targetStatusMeta(status) {
    switch (status) {
      case "ok": return { label: "In range", badge: "badge-success" };
      case "low": return { label: "Low", badge: "badge-warning" };
      case "high": return { label: "High", badge: "badge-warning" };
      case "unknown": return { label: "No data", badge: "badge-ghost" };
      default: return { label: "Not set", badge: "badge-ghost" };
    }
  }

  function renderHeader() {
    const node = state.node;
    if (!node) return;
    document.title = `${node.node_name} · VivariumIQ`;
    document.querySelectorAll("[data-page-title]").forEach((element) => {
      element.textContent = node.node_name;
    });
    document.querySelectorAll("[data-node-name]").forEach((element) => {
      element.textContent = node.node_name;
    });
    document.querySelectorAll("[data-node-location]").forEach((element) => {
      element.textContent = node.location_name || "No location set";
    });
    document.querySelectorAll("[data-node-last-seen]").forEach((element) => {
      element.textContent = API.timeAgo(node.last_seen);
    });
    document.querySelectorAll("[data-node-installed]").forEach((element) => {
      element.textContent = API.formatDate(node.installed_at);
    });
    document.querySelectorAll("[data-delete-node-name]").forEach((element) => {
      element.textContent = node.node_name;
    });
    document.querySelectorAll("[data-node-species]").forEach((element) => {
      element.textContent = targetLabel(node);
    });

    const status = document.getElementById("node-status");
    if (status) {
      const live = isLive(node);
      status.className = `badge badge-sm ${live ? "badge-success" : "badge-warning"}`;
      status.innerHTML = `<span class="status-dot ${live ? "is-live" : ""} mr-1"></span>${live ? "Live" : "Quiet"}`;
    }

  }

  function renderMetrics() {
    const latest = latestReading();
    const values = latest
      ? {
          temperature: metric(latest.temperature, "°C"),
          humidity: metric(latest.humidity, "%", 0),
          pressure: metric(latest.pressure, " hPa", 0),
          motion: latest.motion_detected ? "Detected" : "Quiet",
        }
      : { temperature: "—", humidity: "—", pressure: "—", motion: "—" };

    Object.entries(values).forEach(([key, value]) => {
      document.querySelectorAll(`[data-node-metric="${key}"]`).forEach((element) => {
        element.textContent = value;
      });
      document.querySelectorAll(`[data-node-metric-desc="${key}"]`).forEach((element) => {
        element.textContent = latest ? `${API.timeAgo(latest.recorded_at)} · ${API.formatTime(latest.recorded_at)}` : "No sample yet";
      });
    });
  }

  function renderHealth() {
    const node = state.node;
    const diagnostic = latestDiagnostic();
    const banner = document.getElementById("node-health");
    const icon = document.getElementById("node-health-icon");
    const title = document.getElementById("node-health-title");
    const message = document.getElementById("node-health-message");
    const badge = document.getElementById("node-health-badge");
    if (!banner || !node) return;

    let tone = "neutral";
    let heading = "Waiting for a diagnostic";
    let body = "Sensor health will appear when the node reports in.";
    let label = "Unknown";

    if (!isLive(node)) {
      tone = "warning";
      heading = "Enclosure is quiet";
      body = "No reading or heartbeat has arrived in the last 15 minutes.";
      label = "Quiet";
    } else if (diagnostic) {
      const known = DIAGNOSTIC_KEYS.filter(({ key }) => diagnostic[key] !== null && diagnostic[key] !== undefined);
      const failed = known.filter(({ key }) => diagnostic[key] === false).map(({ label: name }) => name);
      const ok = known.filter(({ key }) => diagnostic[key] === true).length;
      if (!known.length) {
        tone = "neutral";
        heading = "Diagnostic received";
        body = "The report did not include any sensor status values.";
        label = "Incomplete";
      } else if (failed.length) {
        tone = "warning";
        heading = "Some sensors need attention";
        body = `Failed checks: ${failed.join(", ")}.`;
        label = `${ok}/${known.length} OK`;
      } else {
        tone = "success";
        heading = "All sensors reporting";
        body = "Wi-Fi, DHT22, pressure, PIR and GPS are healthy.";
        label = "Healthy";
      }
    } else {
      tone = "neutral";
      heading = "Telemetry only";
      body = "Readings are arriving, but no diagnostic report has been stored yet.";
      label = "No report";
    }

    banner.className = `mt-6 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
      tone === "success" ? "border-success/20 bg-success/5" : tone === "warning" ? "border-warning/25 bg-warning/5" : "border-base-content/8 bg-base-100"
    }`;
    if (icon) icon.className = `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTileClass(tone)}`;
    if (title) title.textContent = heading;
    if (message) message.textContent = body;
    if (badge) {
      badge.className = `badge badge-sm self-start sm:self-auto ${tone === "success" ? "badge-success" : tone === "warning" ? "badge-warning" : "badge-ghost"}`;
      badge.textContent = label;
    }
  }

  function renderTargetHealth() {
    const node = state.node;
    const banner = document.getElementById("target-health");
    const icon = document.getElementById("target-health-icon");
    const title = document.getElementById("target-health-title");
    const message = document.getElementById("target-health-message");
    const badge = document.getElementById("target-health-badge");
    const chips = document.getElementById("target-chips");
    if (!banner || !node) return;

    const evaluation = API.evaluateTargets(node.targets, latestReading());
    const outMetrics = evaluation.metrics.filter((metric) => metric.status === "low" || metric.status === "high");

    let tone = "neutral";
    let heading = "Targets not set";
    let body = "Choose a species preset or custom ranges to track environmental health.";
    let label = "Not set";

    if (evaluation.tone === "success") {
      tone = "success";
      heading = "Environment in target";
      body = "Temperature, humidity and pressure are within their target ranges.";
      label = "Optimal";
    } else if (evaluation.tone === "warning" && outMetrics.length) {
      tone = "warning";
      heading = "Environment outside target";
      body = outMetrics
        .map((metric) => `${metric.label} is ${API.formatNumber(metric.value, metric.digits)}${metric.unit} (target ${API.targetRangeLabel(metric)})`)
        .join(" · ");
      label = `${outMetrics.length} out of range`;
    } else if (evaluation.tone === "warning") {
      tone = "warning";
      heading = "Waiting for data";
      body = "Some metrics have no reading yet. Targets will be checked once a sample arrives.";
      label = "No data";
    }

    banner.className = `mt-6 rounded-2xl border border-l-4 p-4 sm:p-5 ${
      tone === "success" ? "border-success/20 border-l-success bg-success/5" : tone === "warning" ? "border-warning/25 border-l-warning bg-warning/5" : "border-base-content/8 border-l-base-content/20 bg-base-100"
    }`;
    if (icon) icon.className = `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconTileClass(tone)}`;
    if (title) title.textContent = heading;
    if (message) message.textContent = body;
    if (badge) {
      badge.className = `badge badge-sm ${tone === "success" ? "badge-success" : tone === "warning" ? "badge-warning" : "badge-ghost"}`;
      badge.textContent = label;
    }

    if (!chips) return;
    if (!evaluation.configured) {
      chips.innerHTML = '<p class="rounded-xl border border-dashed border-base-content/12 px-4 py-5 text-center text-xs text-base-content/45 sm:col-span-3">Set a species preset or custom ranges to see per-metric target status.</p>';
      return;
    }
    chips.innerHTML = evaluation.metrics
      .map((metric) => {
        const status = targetStatusMeta(metric.status);
        const value = metric.value === null ? "—" : `${API.formatNumber(metric.value, metric.digits)}${metric.unit}`;
        return `
          <div class="rounded-xl border border-base-content/7 bg-base-200/50 p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] font-medium uppercase tracking-wide text-base-content/40">${metric.label}</p>
              <span class="badge badge-xs ${status.badge}">${status.label}</span>
            </div>
            <p class="mt-1.5 text-lg font-bold tabular">${value}</p>
            <p class="text-[11px] text-base-content/45">Target ${API.targetRangeLabel(metric)}</p>
          </div>`;
      })
      .join("");
  }

  function renderChart() {
    const canvas = document.getElementById("node-chart");
    const empty = document.getElementById("node-chart-empty");
    if (!canvas) return;
    const measurement = API.MEASUREMENTS[state.chartMetric];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let points = state.readings
      .filter((reading) => {
        const date = API.parseDate(reading.recorded_at);
        const value = reading[state.chartMetric];
        return date && date.getTime() >= cutoff && value !== null && value !== undefined;
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

    if (!points.length) {
      canvas.classList.add("hidden");
      if (empty) {
        empty.classList.remove("hidden");
        empty.innerHTML = '<p class="text-xs font-medium">No readings in the last 24 hours.</p>';
      }
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

    const values = points.map((reading) => Number(reading[state.chartMetric]));
    const labels = points.map((reading) => API.formatTime(reading.recorded_at));
    const textColor = "#64748b";
    const targetMetric = API.evaluateTargets(state.node && state.node.targets, latestReading()).metrics.find((item) => item.key === state.chartMetric);
    const hasTarget = targetMetric && targetMetric.min !== null && targetMetric.max !== null;
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const targetMin = hasTarget ? targetMetric.min : dataMin;
    const targetMax = hasTarget ? targetMetric.max : dataMax;
    const span = Math.max(1, targetMax - targetMin, dataMax - dataMin);
    const lower = Math.min(dataMin, targetMin) - span * 0.12;
    const upper = Math.max(dataMax, targetMax) + span * 0.12;
    document.querySelectorAll("[data-chart-target]").forEach((element) => {
      element.textContent = hasTarget ? `Target ${API.targetRangeLabel(targetMetric)}` : "No target set.";
    });

    state.chart = new Chart(canvas.getContext("2d"), {
      type: "line",
      plugins: [targetBandPlugin],
      data: {
        labels,
        datasets: [
          {
            label: measurement.label,
            data: values.map((value, index) => ({ x: index, y: value })),
            borderColor: measurement.color,
            backgroundColor: measurement.bg,
            borderWidth: 2.25,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 18,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        hover: { mode: "index", intersect: false, animationDuration: 80 },
        animation: { duration: 450 },
        plugins: {
          legend: { display: false },
          targetBand: { min: hasTarget ? targetMetric.min : null, max: hasTarget ? targetMetric.max : null },
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
                return `${measurement.label}: ${API.formatNumber(context.parsed.y, measurement.digits)}${measurement.unit}`;
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
            suggestedMin: lower,
            suggestedMax: upper,
            grid: { color: "rgba(100, 116, 139, 0.12)" },
            ticks: {
              color: textColor,
              font: { family: "Inter", size: 10 },
              callback: (value) => `${value}${measurement.unit}`,
            },
            border: { display: false },
          },
        },
      },
    });

    if (window.ChartZoom) {
      state.zoomController = ChartZoom.attach(canvas, state.chart, { minSpan: 8 });
    }
  }

  function renderReadings() {
    const body = document.getElementById("readings-table-body");
    if (!body) return;
    const rows = state.readings.slice(0, 12);
    document.querySelectorAll("[data-readings-count]").forEach((element) => {
      element.textContent = `${API.formatInteger(state.readings.length)} samples`;
    });
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-xs text-base-content/40">No readings yet.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map((reading) => `
        <tr>
          <td class="whitespace-nowrap text-xs text-base-content/55">${API.formatDateTime(reading.recorded_at)}</td>
          <td class="text-right text-xs font-medium tabular">${metric(reading.temperature, " °C")}</td>
          <td class="text-right text-xs font-medium tabular">${metric(reading.humidity, "%", 0)}</td>
          <td class="text-right text-xs font-medium tabular">${metric(reading.pressure, " hPa", 0)}</td>
          <td class="text-right"><span class="badge badge-xs ${reading.motion_detected ? "badge-warning" : "badge-ghost"}">${reading.motion_detected ? "Motion" : "Quiet"}</span></td>
        </tr>`)
      .join("");
  }

  function renderHourly() {
    const body = document.getElementById("hourly-table-body");
    if (!body) return;
    if (!state.hourly.length) {
      body.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-xs text-base-content/40">No hourly summaries yet.</td></tr>';
      return;
    }
    body.innerHTML = state.hourly
      .slice(0, 48)
      .map((row) => `
        <tr>
          <td class="whitespace-nowrap text-xs text-base-content/55">${API.formatDateTime(row.hour_start)}</td>
          <td class="text-right text-xs font-medium tabular">${metric(row.avg_temperature, " °C")}</td>
          <td class="text-right text-xs font-medium tabular">${metric(row.avg_humidity, "%", 0)}</td>
          <td class="text-right text-xs font-medium tabular">${API.formatInteger(row.motion_count)}</td>
        </tr>`)
      .join("");
  }

  function renderDaily() {
    const body = document.getElementById("daily-table-body");
    if (!body) return;
    if (!state.daily.length) {
      body.innerHTML = '<tr><td colspan="4" class="py-6 text-center text-xs text-base-content/40">No daily rollups yet.</td></tr>';
      return;
    }
    body.innerHTML = state.daily
      .slice(0, 30)
      .map((row) => `
        <tr>
          <td class="whitespace-nowrap text-xs text-base-content/55">${API.formatDate(row.date)}</td>
          <td class="text-right text-xs font-medium tabular">${metric(row.avg_temperature, " °C")}</td>
          <td class="text-right text-xs font-medium tabular">${metric(row.min_temperature, "°", 1)} / ${metric(row.max_temperature, "°", 1)}</td>
          <td class="text-right text-xs font-medium tabular">${API.formatInteger(row.motion_count)}</td>
        </tr>`)
      .join("");
  }

  function renderDiagnostics() {
    const diagnostic = latestDiagnostic();
    document.querySelectorAll("[data-diagnostic-uptime]").forEach((element) => {
      element.textContent = diagnostic ? formatUptime(diagnostic.uptime) : "—";
    });
    document.querySelectorAll("[data-diagnostic-time]").forEach((element) => {
      element.textContent = diagnostic ? API.formatDateTime(diagnostic.recorded_at) : "—";
    });

    const grid = document.getElementById("diagnostic-grid");
    const gridLarge = document.getElementById("diagnostic-grid-large");
    const cards = diagnostic
      ? DIAGNOSTIC_KEYS.map(({ key, label }) => `
          <div class="rounded-xl border border-base-content/7 bg-base-200/50 p-3">
            <p class="text-[10px] font-medium uppercase tracking-wide text-base-content/40">${label}</p>
            <div class="mt-1.5">${statusPill(diagnostic[key])}</div>
          </div>`).join("")
      : '<div class="col-span-2 rounded-xl border border-dashed border-base-content/12 px-4 py-5 text-center text-xs text-base-content/40">No diagnostics yet.</div>';
    if (grid) grid.innerHTML = cards;
    if (gridLarge) gridLarge.innerHTML = cards;

    const body = document.getElementById("diagnostics-table-body");
    if (!body) return;
    if (!state.diagnostics.length) {
      body.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-xs text-base-content/40">No diagnostic reports yet.</td></tr>';
      return;
    }
    body.innerHTML = state.diagnostics
      .slice(0, 24)
      .map((row) => `
        <tr>
          <td class="whitespace-nowrap text-xs text-base-content/55">${API.formatDateTime(row.recorded_at)}</td>
          <td class="text-right">${statusPill(row.wifi_connected)}</td>
          <td class="text-right">${statusPill(row.dht22_status)}</td>
          <td class="text-right">${statusPill(row.pressure_sensor_status)}</td>
          <td class="text-right">${statusPill(row.pir_status)}</td>
          <td class="text-right">${statusPill(row.gps_status)}</td>
        </tr>`)
      .join("");
  }

  function renderAlerts() {
    const container = document.getElementById("node-alerts");
    if (!container) return;
    const alerts = state.alerts.filter((alert) => alert.node_id === state.nodeId && alert.user_id === state.user.user_id);
    const reading = latestReading();
    if (!alerts.length) {
      container.innerHTML = `
        <div class="rounded-xl border border-dashed border-base-content/12 px-4 py-7 text-center">
          <p class="text-sm font-medium text-base-content/60">No alerts for this enclosure</p>
          <p class="mt-1 text-xs text-base-content/40">Add a threshold to be warned about drift.</p>
          <a href="/app/alerts?new=1&node_id=${state.nodeId}" class="btn btn-ghost btn-xs mt-2 text-primary">Create an alert</a>
        </div>`;
      return;
    }

    container.innerHTML = alerts
      .map((alert) => {
        const measurement = API.MEASUREMENTS[alert.measurement_type] || { label: alert.measurement_type, unit: "" };
        const triggered = API.evaluateAlert(alert, reading);
        return `
          <div class="flex flex-col gap-3 rounded-xl border border-base-content/7 px-4 py-3 sm:flex-row sm:items-center">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${triggered ? "bg-error/12 text-error" : alert.enabled ? "bg-primary/10 text-primary" : "bg-base-200 text-base-content/35"}">
              <span class="h-2 w-2 rounded-full ${triggered ? "bg-error" : alert.enabled ? "bg-primary" : "bg-base-content/25"}"></span>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold">${measurement.label} ${API.escapeHtml(alert.comparison_operator)} ${API.formatNumber(alert.threshold_value, measurement.digits)}${measurement.unit}</p>
              <p class="mt-0.5 text-[11px] text-base-content/45">${triggered ? "Currently crossed by the latest reading." : alert.enabled ? "Armed and watching the latest reading." : "Paused."}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="badge badge-xs ${triggered ? "badge-error" : alert.enabled ? "badge-success" : "badge-ghost"}">${triggered ? "Triggered" : alert.enabled ? "Armed" : "Paused"}</span>
              <button type="button" class="btn btn-ghost btn-xs" data-alert-toggle="${alert.alert_id}">${alert.enabled ? "Pause" : "Resume"}</button>
              <button type="button" class="btn btn-ghost btn-xs text-error" data-alert-delete="${alert.alert_id}" aria-label="Delete alert">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
              </button>
            </div>
          </div>`;
      })
      .join("");
  }

  function renderAll() {
    renderHeader();
    renderMetrics();
    renderTargetHealth();
    renderHealth();
    renderChart();
    renderReadings();
    renderHourly();
    renderDaily();
    renderDiagnostics();
    renderAlerts();
  }

  async function load() {
    if (state.loading || !state.user) return;
    state.loading = true;
    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) API.setButtonLoading(refreshButton, true, "Refreshing…");
    try {
      const [node, allReadings, hourly, daily, allDiagnostics, allAlerts] = await Promise.all([
        API.request(`/api/node/${state.nodeId}`),
        API.request(`/api/readings?node_id=${state.nodeId}&limit=5000`),
        API.request(`/api/nodes/${state.nodeId}/summaries/hourly`),
        API.request(`/api/nodes/${state.nodeId}/summaries/daily`),
        API.request(`/api/diagnostics?node_id=${state.nodeId}&limit=200`),
        API.request("/api/alerts"),
      ]);

      if (node.user_id !== state.user.user_id) {
        document.getElementById("node-detail")?.classList.add("hidden");
        document.getElementById("node-access-denied")?.classList.remove("hidden");
        return;
      }

      state.node = node;
      state.readings = allReadings
        .filter((reading) => reading.node_id === state.nodeId)
        .sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at));
      state.hourly = hourly || [];
      state.daily = daily || [];
      state.diagnostics = allDiagnostics
        .filter((diagnostic) => diagnostic.node_id === state.nodeId)
        .sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at));
      state.alerts = allAlerts.filter((alert) => alert.user_id === state.user.user_id);
      renderAll();
    } catch (error) {
      if (error.status !== 401) API.toast(error.message || "Could not load this enclosure.", "error");
    } finally {
      state.loading = false;
      if (refreshButton) API.setButtonLoading(refreshButton, false);
    }
  }

  function activateTab(name) {
    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      const active = button.getAttribute("data-tab-target") === name;
      button.classList.toggle("tab-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.getAttribute("data-tab-panel") !== name);
    });
  }

  function initTabs() {
    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.getAttribute("data-tab-target")));
    });
    document.querySelectorAll("[data-tab-jump]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.getAttribute("data-tab-jump");
        document.querySelector(`[data-tab-target="${target}"]`)?.click();
      });
    });
  }

  function initChartControls() {
    document.querySelectorAll("[data-chart-metric]").forEach((button) => {
      button.addEventListener("click", () => {
        state.chartMetric = button.getAttribute("data-chart-metric");
        document.querySelectorAll("[data-chart-metric]").forEach((other) => {
          const active = other === button;
          other.className = `btn btn-xs ${active ? "btn-primary" : "btn-ghost"}`;
        });
        renderChart();
      });
    });
  }

  function initEditModal() {
    const modal = document.getElementById("edit-node-modal");
    const form = document.getElementById("edit-node-form");
    if (!modal || !form) return;
    const fieldset = form.querySelector("[data-target-fieldset]");
    const open = () => {
      if (!state.node) return;
      document.getElementById("edit-node-name").value = state.node.node_name || "";
      document.getElementById("edit-node-location").value = state.node.location_name || "";
      document.getElementById("edit-node-latitude").value = state.node.latitude ?? "";
      document.getElementById("edit-node-longitude").value = state.node.longitude ?? "";
      if (fieldset) Targets.setTargets(fieldset, state.node.targets);
      document.getElementById("edit-node-error").classList.add("hidden");
      modal.showModal();
    };
    document.querySelectorAll("[data-open-edit]").forEach((button) => button.addEventListener("click", open));
    document.querySelectorAll("[data-close-edit]").forEach((button) => button.addEventListener("click", () => modal.close()));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity() || !state.node) return;
      const latitudeValue = document.getElementById("edit-node-latitude").value.trim();
      const longitudeValue = document.getElementById("edit-node-longitude").value.trim();
      const body = {
        node_name: document.getElementById("edit-node-name").value.trim(),
        location_name: document.getElementById("edit-node-location").value.trim() || null,
        latitude: latitudeValue === "" ? null : Number(latitudeValue),
        longitude: longitudeValue === "" ? null : Number(longitudeValue),
      };
      if ((body.latitude !== null && !Number.isFinite(body.latitude)) || (body.longitude !== null && !Number.isFinite(body.longitude))) {
        const box = document.getElementById("edit-node-error");
        document.getElementById("edit-node-error-message").textContent = "Latitude and longitude must be valid numbers.";
        box.classList.remove("hidden");
        return;
      }
      const targets = fieldset ? Targets.getTargets(fieldset) : null;
      if (targets === false) {
        const box = document.getElementById("edit-node-error");
        document.getElementById("edit-node-error-message").textContent = Targets.lastError || "Check the environment target ranges and try again.";
        box.classList.remove("hidden");
        return;
      }
      const submit = document.getElementById("edit-node-submit");
      API.setButtonLoading(submit, true, "Saving…");
      try {
        const updated = await API.request(`/api/node/${state.node.node_id}`, { method: "PATCH", body });
        let targetResult = null;
        if (targets) {
          targetResult = await API.request(`/api/node/${state.node.node_id}/targets`, { method: "PUT", body: targets });
        } else {
          await API.request(`/api/node/${state.node.node_id}/targets`, { method: "DELETE" });
        }
        state.node = updated;
        state.node.targets = targetResult;
        modal.close();
        renderAll();
        API.toast("Enclosure updated.", "success");
      } catch (error) {
        document.getElementById("edit-node-error-message").textContent = error.message || "Could not update the enclosure.";
        document.getElementById("edit-node-error").classList.remove("hidden");
      } finally {
        API.setButtonLoading(submit, false);
      }
    });
  }

  function initDeleteModal() {
    const modal = document.getElementById("delete-node-modal");
    if (!modal) return;
    document.querySelectorAll("[data-open-delete]").forEach((button) => button.addEventListener("click", () => modal.showModal()));
    document.querySelectorAll("[data-close-delete]").forEach((button) => button.addEventListener("click", () => modal.close()));
    const submit = document.getElementById("delete-node-submit");
    submit?.addEventListener("click", async () => {
      if (!state.node) return;
      API.setButtonLoading(submit, true, "Deleting…");
      try {
        await API.request(`/api/node/${state.node.node_id}`, { method: "DELETE" });
        API.toast("Enclosure deleted.", "success");
        window.location.assign("/app/nodes");
      } catch (error) {
        const box = document.getElementById("delete-node-error");
        document.getElementById("delete-node-error-message").textContent = error.message || "Could not delete the enclosure.";
        box.classList.remove("hidden");
        API.setButtonLoading(submit, false);
      }
    });
  }

  function initAlertActions() {
    const container = document.getElementById("node-alerts");
    if (!container) return;
    container.addEventListener("click", async (event) => {
      const toggle = event.target.closest("[data-alert-toggle]");
      const remove = event.target.closest("[data-alert-delete]");
      if (state.alertsBusy || (!toggle && !remove)) return;
      state.alertsBusy = true;
      try {
        if (toggle) {
          const alertId = Number(toggle.getAttribute("data-alert-toggle"));
          const alert = state.alerts.find((item) => item.alert_id === alertId);
          if (!alert) return;
          const updated = await API.request(`/api/alert/${alertId}`, { method: "PATCH", body: { enabled: !alert.enabled } });
          Object.assign(alert, updated);
          renderAlerts();
          API.toast(updated.enabled ? "Alert resumed." : "Alert paused.", "info");
        }
        if (remove) {
          const alertId = Number(remove.getAttribute("data-alert-delete"));
          if (!window.confirm("Delete this alert?")) return;
          await API.request(`/api/alert/${alertId}`, { method: "DELETE" });
          state.alerts = state.alerts.filter((alert) => alert.alert_id !== alertId);
          renderAlerts();
          API.toast("Alert deleted.", "info");
        }
      } catch (error) {
        API.toast(error.message || "Could not update the alert.", "error");
      } finally {
        state.alertsBusy = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await App.init();
    if (!user) return;
    state.user = user;
    initTabs();
    initChartControls();
    const targetFieldset = document.querySelector("#edit-node-form [data-target-fieldset]");
    if (targetFieldset) Targets.init(targetFieldset);
    initEditModal();
    initDeleteModal();
    initAlertActions();
    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) refreshButton.addEventListener("click", load);    await load();
    window.setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
  });
})();
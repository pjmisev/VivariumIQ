(function () {
  "use strict";

  const state = {
    user: null,
    nodes: [],
    alerts: [],
    latest: new Map(),
    editingId: null,
    loading: false,
  };

  const MEASUREMENTS = {
    temperature: { label: "Temperature", unit: "°C", digits: 1 },
    humidity: { label: "Humidity", unit: "%", digits: 0 },
    pressure: { label: "Pressure", unit: " hPa", digits: 0 },
  };

  function evaluateAlert(alert, reading) {
    if (!alert.enabled || !reading) return false;
    const value = Number(reading[alert.measurement_type]);
    const threshold = Number(alert.threshold_value);
    if (!Number.isFinite(value) || !Number.isFinite(threshold)) return false;
    switch (alert.comparison_operator) {
      case ">": return value > threshold;
      case "<": return value < threshold;
      case ">=": return value >= threshold;
      case "<=": return value <= threshold;
      case "==": return Math.abs(value - threshold) < 0.001;
      default: return false;
    }
  }

  function renderStats() {
    const armed = state.alerts.filter((alert) => alert.enabled);
    const triggered = armed.filter((alert) => evaluateAlert(alert, state.latest.get(alert.node_id))).length;
    document.querySelectorAll('[data-alert-stat="total"]').forEach((element) => {
      element.textContent = API.formatInteger(state.alerts.length);
    });
    document.querySelectorAll('[data-alert-stat="armed"]').forEach((element) => {
      element.textContent = API.formatInteger(armed.length);
    });
    document.querySelectorAll('[data-alert-stat="triggered"]').forEach((element) => {
      element.textContent = API.formatInteger(triggered);
    });
    App.setAlertCount(armed.length);
  }

  function render() {
    const list = document.getElementById("alerts-list");
    const empty = document.getElementById("alerts-empty");
    if (!list) return;

    if (!state.alerts.length) {
      list.innerHTML = "";
      list.classList.add("hidden");
      if (empty) empty.classList.remove("hidden");
      renderStats();
      return;
    }

    list.classList.remove("hidden");
    if (empty) empty.classList.add("hidden");

    const nodeNames = new Map(state.nodes.map((node) => [node.node_id, node.node_name]));
    list.innerHTML = state.alerts
      .map((alert) => {
        const measurement = MEASUREMENTS[alert.measurement_type] || { label: alert.measurement_type, unit: "", digits: 1 };
        const reading = state.latest.get(alert.node_id);
        const latestValue = reading ? reading[alert.measurement_type] : null;
        const triggered = evaluateAlert(alert, reading);
        const nodeName = nodeNames.get(alert.node_id) || `Node ${alert.node_id}`;
        const statusClass = triggered ? "badge-error" : alert.enabled ? "badge-success" : "badge-ghost";
        const statusLabel = triggered ? "Triggered" : alert.enabled ? "Armed" : "Paused";
        return `
          <article class="card bg-base-100">
            <div class="card-body flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
              <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${triggered ? "bg-error/12 text-error" : alert.enabled ? "bg-primary/10 text-primary" : "bg-base-200 text-base-content/35"}">
                <span class="h-2.5 w-2.5 rounded-full ${triggered ? "bg-error" : alert.enabled ? "bg-primary" : "bg-base-content/25"}"></span>
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate font-display text-sm font-bold">${API.escapeHtml(nodeName)}</h3>
                  <span class="badge badge-xs ${statusClass}">${statusLabel}</span>
                </div>
                <p class="mt-1 text-xs text-base-content/55">
                  ${measurement.label} ${API.escapeHtml(alert.comparison_operator)} <span class="font-semibold text-base-content/75">${API.formatNumber(alert.threshold_value, measurement.digits)}${measurement.unit}</span>
                  <span class="mx-1.5 text-base-content/20">·</span>
                  Latest ${latestValue === null || latestValue === undefined ? "—" : `${API.formatNumber(latestValue, measurement.digits)}${measurement.unit}`}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                <button type="button" class="btn btn-ghost btn-xs gap-1" data-edit-alert="${alert.alert_id}">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-3.5 w-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
                  Edit
                </button>
                <button type="button" class="btn btn-ghost btn-xs" data-toggle-alert="${alert.alert_id}">${alert.enabled ? "Pause" : "Resume"}</button>
                <button type="button" class="btn btn-ghost btn-xs text-error" data-delete-alert="${alert.alert_id}" aria-label="Delete alert">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-3.5 w-3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                </button>
              </div>
            </div>
          </article>`;
      })
      .join("");

    renderStats();
  }

  function renderNodeOptions(selectedId) {
    const select = document.getElementById("alert-node");
    if (!select) return;
    const options = ['<option value="" disabled>Select an enclosure</option>'].concat(
      state.nodes.map((node) => `<option value="${node.node_id}">${API.escapeHtml(node.node_name)}</option>`)
    );
    select.innerHTML = options.join("");
    if (selectedId) select.value = String(selectedId);
    else if (state.nodes.length === 1) select.value = String(state.nodes[0].node_id);
  }

  async function load() {
    if (state.loading || !state.user) return;
    state.loading = true;
    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) API.setButtonLoading(refreshButton, true, "Refreshing…");
    try {
      const [alerts, nodes, readings] = await Promise.all([
        API.request("/api/alerts"),
        API.request("/api/nodes"),
        API.request("/api/readings"),
      ]);
      state.alerts = alerts
        .filter((alert) => alert.user_id === state.user.user_id)
        .sort((a, b) => API.parseDate(b.created_at) - API.parseDate(a.created_at));
      state.nodes = nodes
        .filter((node) => node.user_id === state.user.user_id)
        .sort((a, b) => a.node_name.localeCompare(b.node_name));
      const nodeIds = new Set(state.nodes.map((node) => node.node_id));
      state.latest = new Map();
      readings
        .filter((reading) => nodeIds.has(reading.node_id))
        .sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at))
        .forEach((reading) => {
          if (!state.latest.has(reading.node_id)) state.latest.set(reading.node_id, reading);
        });
      renderNodeOptions();
      render();
    } catch (error) {
      if (error.status !== 401) API.toast(error.message || "Could not load your alerts.", "error");
    } finally {
      state.loading = false;
      if (refreshButton) API.setButtonLoading(refreshButton, false);
    }
  }

  function clearError() {
    document.getElementById("alert-form-error")?.classList.add("hidden");
  }

  function showError(message) {
    const box = document.getElementById("alert-form-error");
    const text = document.getElementById("alert-form-error-message");
    if (box && text) {
      text.textContent = message;
      box.classList.remove("hidden");
    }
  }

  function openModal(alert, presetNodeId) {
    const modal = document.getElementById("alert-modal");
    const form = document.getElementById("alert-form");
    if (!modal || !form) return;
    if (!state.nodes.length) {
      API.toast("Add an enclosure before creating an alert.", "warning");
      return;
    }
    form.reset();
    clearError();
    state.editingId = alert ? alert.alert_id : null;
    renderNodeOptions(alert ? alert.node_id : presetNodeId);
    document.getElementById("alert-modal-title").textContent = alert ? "Edit alert" : "New alert";
    document.getElementById("alert-modal-subtitle").textContent = alert ? "Update the threshold or condition." : "Watch a measurement on one enclosure.";
    document.getElementById("alert-submit").textContent = alert ? "Save changes" : "Create alert";
    document.getElementById("alert-measurement").value = alert ? alert.measurement_type : "temperature";
    document.getElementById("alert-operator").value = alert ? alert.comparison_operator : ">";
    document.getElementById("alert-threshold").value = alert ? alert.threshold_value : "";
    document.getElementById("alert-enabled").checked = alert ? Boolean(alert.enabled) : true;
    modal.showModal();
    window.setTimeout(() => document.getElementById("alert-threshold")?.focus(), 80);
  }

  function initModal(initialNodeId) {
    const modal = document.getElementById("alert-modal");
    const form = document.getElementById("alert-form");
    if (!modal || !form) return;

    document.querySelectorAll("[data-open-alert-modal]").forEach((button) => {
      button.addEventListener("click", () => openModal(null, initialNodeId));
    });
    document.querySelectorAll("[data-close-alert-modal]").forEach((button) => {
      button.addEventListener("click", () => modal.close());
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearError();
      if (!form.reportValidity()) return;
      const nodeId = Number(document.getElementById("alert-node").value);
      if (!nodeId) {
        showError("Choose an enclosure.");
        return;
      }
      const body = {
        node_id: nodeId,
        measurement_type: document.getElementById("alert-measurement").value,
        comparison_operator: document.getElementById("alert-operator").value,
        threshold_value: Number(document.getElementById("alert-threshold").value),
        enabled: document.getElementById("alert-enabled").checked,
      };
      if (!Number.isFinite(body.threshold_value)) {
        showError("Enter a valid threshold.");
        return;
      }
      const submit = document.getElementById("alert-submit");
      API.setButtonLoading(submit, true, state.editingId ? "Saving…" : "Creating…");
      try {
        if (state.editingId) {
          const { node_id, ...patch } = body;
          await API.request(`/api/alert/${state.editingId}`, { method: "PATCH", body: patch });
        } else {
          await API.request("/api/alert", { method: "POST", body });
        }
        modal.close();
        API.toast(state.editingId ? "Alert updated." : "Alert created.", "success");
        await load();
      } catch (error) {
        showError(error.message || "Could not save the alert.");
      } finally {
        API.setButtonLoading(submit, false);
      }
    });
  }

  function initListActions() {
    const list = document.getElementById("alerts-list");
    if (!list) return;
    list.addEventListener("click", async (event) => {
      const edit = event.target.closest("[data-edit-alert]");
      const toggle = event.target.closest("[data-toggle-alert]");
      const remove = event.target.closest("[data-delete-alert]");
      if (edit) {
        const alert = state.alerts.find((item) => item.alert_id === Number(edit.getAttribute("data-edit-alert")));
        if (alert) openModal(alert);
        return;
      }
      if (toggle) {
        const alertId = Number(toggle.getAttribute("data-toggle-alert"));
        const alert = state.alerts.find((item) => item.alert_id === alertId);
        if (!alert) return;
        toggle.disabled = true;
        try {
          const updated = await API.request(`/api/alert/${alertId}`, { method: "PATCH", body: { enabled: !alert.enabled } });
          Object.assign(alert, updated);
          render();
          API.toast(updated.enabled ? "Alert resumed." : "Alert paused.", "info");
        } catch (error) {
          API.toast(error.message || "Could not update the alert.", "error");
          toggle.disabled = false;
        }
        return;
      }
      if (remove) {
        const alertId = Number(remove.getAttribute("data-delete-alert"));
        if (!window.confirm("Delete this alert?")) return;
        try {
          await API.request(`/api/alert/${alertId}`, { method: "DELETE" });
          state.alerts = state.alerts.filter((alert) => alert.alert_id !== alertId);
          render();
          API.toast("Alert deleted.", "info");
        } catch (error) {
          API.toast(error.message || "Could not delete the alert.", "error");
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await App.init();
    if (!user) return;
    state.user = user;
    const params = new URLSearchParams(window.location.search);
    const initialNodeId = params.get("node_id");
    initModal(initialNodeId);
    initListActions();
    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) refreshButton.addEventListener("click", load);
    await load();
    if (params.get("new") === "1") openModal(null, initialNodeId);
  });
})();
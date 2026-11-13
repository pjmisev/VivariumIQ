(function () {
  "use strict";

  const state = {
    user: null,
    nodes: [],
    grouped: new Map(),
    diagnostics: new Map(),
    favourites: new Set(),
    query: "",
    filter: "all",
    loading: false,
  };

  const STAR_OUTLINE = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/></svg>';
  const STAR_FILLED = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clip-rule="evenodd"/></svg>';

  function metric(value, unit, digits) {
    if (value === null || value === undefined || value === "") return "—";
    return `${API.formatNumber(value, digits === undefined ? 1 : digits)}${unit}`;
  }

  function isLive(node) {
    const lastSeen = API.parseDate(node.last_seen);
    if (!lastSeen || Number.isNaN(lastSeen.getTime())) return node.status === "active";
    return Date.now() - lastSeen.getTime() < 15 * 60 * 1000;
  }

  function groupReadings(readings) {
    const map = new Map();
    readings.forEach((reading) => {
      if (!map.has(reading.node_id)) map.set(reading.node_id, []);
      map.get(reading.node_id).push(reading);
    });
    map.forEach((list) => list.sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at)));
    return map;
  }

  function diagnosticHealth(diagnostic) {
    if (!diagnostic) return { label: "No diagnostics yet", tone: "neutral" };
    const keys = ["wifi_connected", "dht22_status", "pressure_sensor_status", "pir_status", "gps_status"];
    const known = keys.filter((key) => diagnostic[key] !== null && diagnostic[key] !== undefined);
    const ok = known.filter((key) => diagnostic[key] === true).length;
    if (!known.length) return { label: "No diagnostics yet", tone: "neutral" };
    return { label: `${ok}/${known.length} sensors OK`, tone: ok === known.length ? "success" : "warning" };
  }

  function sparkline(values) {
    const data = values.filter((value) => Number.isFinite(Number(value))).map(Number);
    if (data.length < 2) {
      return '<svg viewBox="0 0 120 32" class="h-9 w-full" preserveAspectRatio="none" aria-hidden="true"><path d="M0 24 L120 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.35"/></svg>';
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
    return `<svg viewBox="0 0 120 32" class="h-9 w-full" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points.join(" ")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderStats() {
    const live = state.nodes.filter(isLive).length;
    const targetStates = state.nodes.map((node) => API.evaluateTargets(node.targets, (state.grouped.get(node.node_id) || [])[0]));
    const inTarget = targetStates.filter((item) => item.configured && item.tone === "success").length;
    const attention = targetStates.filter((item) => !item.configured || item.tone === "warning").length;
    document.querySelectorAll('[data-node-stat="total"]').forEach((element) => {
      element.textContent = API.formatInteger(state.nodes.length);
    });
    document.querySelectorAll('[data-node-stat="live"]').forEach((element) => {
      element.textContent = API.formatInteger(live);
    });
    document.querySelectorAll('[data-node-stat="target"]').forEach((element) => {
      element.textContent = API.formatInteger(inTarget);
    });
    document.querySelectorAll('[data-node-stat="attention"]').forEach((element) => {
      element.textContent = API.formatInteger(attention);
    });
  }

  function visibleNodes() {
    const query = state.query.trim().toLowerCase();
    return state.nodes.filter((node) => {
      const matchesQuery = !query ||
        node.node_name.toLowerCase().includes(query) ||
        (node.location_name || "").toLowerCase().includes(query);
      if (!matchesQuery) return false;
      if (state.filter === "live") return isLive(node);
      if (state.filter === "quiet") return !isLive(node);
      if (state.filter === "target") return API.evaluateTargets(node.targets, (state.grouped.get(node.node_id) || [])[0]).tone === "success";
      if (state.filter === "attention") {
        const target = API.evaluateTargets(node.targets, (state.grouped.get(node.node_id) || [])[0]);
        return !target.configured || target.tone === "warning";
      }
      return true;
    });
  }

  function render() {
    const container = document.getElementById("nodes-grid");
    const empty = document.getElementById("nodes-empty");
    if (!container) return;
    const nodes = visibleNodes();

    if (!nodes.length) {
      container.innerHTML = "";
      container.classList.add("hidden");
      if (empty) {
        empty.classList.remove("hidden");
        const title = document.getElementById("nodes-empty-title");
        const message = document.getElementById("nodes-empty-message");
        const action = document.getElementById("nodes-empty-action");
        if (!state.nodes.length) {
          if (title) title.textContent = "No enclosures yet";
          if (message) message.textContent = "Register your first Raspberry Pi node to start collecting microclimate and motion data.";
          if (action) action.classList.remove("hidden");
        } else {
          if (title) title.textContent = "No enclosures match";
          if (message) message.textContent = "Try a different search or clear the status filter.";
          if (action) action.classList.add("hidden");
        }
      }
      return;
    }

    container.classList.remove("hidden");
    if (empty) empty.classList.add("hidden");

    container.innerHTML = nodes
      .map((node) => {
        const latest = (state.grouped.get(node.node_id) || [])[0];
        const diagnostic = state.diagnostics.get(node.node_id);
        const health = diagnosticHealth(diagnostic);
        const live = isLive(node);
        const status = API.statusMeta(live ? "active" : "inactive");
        const favourite = state.favourites.has(node.node_id);
        const targetState = API.evaluateTargets(node.targets, latest);
        const targetLabel = !targetState.configured
          ? "No targets"
          : (node.targets && node.targets.preset_name ? node.targets.preset_name : "Custom targets");
        const targetBadgeClass = targetState.tone === "success" ? "badge-success" : targetState.tone === "warning" ? "badge-warning" : "badge-ghost";
        const targetAccent = targetState.tone === "success" ? "border-l-success bg-success/5" : targetState.tone === "warning" ? "border-l-warning bg-warning/5" : "border-l-base-content/20";
        const targetPanel = targetState.tone === "success" ? "border-success/20 bg-success/10" : targetState.tone === "warning" ? "border-warning/25 bg-warning/10" : "border-base-content/10 bg-base-200/50";
        const targetDetail = API.targetDetail(node.targets, targetState);
        const temperatures = (state.grouped.get(node.node_id) || [])
          .slice(0, 24)
          .reverse()
          .map((reading) => reading.temperature);
        const healthClass = health.tone === "success" ? "badge-success" : health.tone === "warning" ? "badge-warning" : "badge-ghost";
        return `
          <article class="card card-lift relative overflow-hidden border-l-4 bg-base-100 ${targetAccent}">
            <a href="/app/nodes/${node.node_id}" class="block p-5">
              <div class="flex items-start justify-between gap-3 pr-10">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] ${live ? "text-success" : "text-warning"}">
                    <span class="status-dot ${live ? "is-live" : ""}"></span>
                    ${status.label}
                  </div>
                  <h3 class="mt-2 truncate font-display text-base font-bold">${API.escapeHtml(node.node_name)}</h3>
                  <p class="mt-1 flex items-center gap-1 truncate text-[11px] text-base-content/45">
                    ${node.location_name ? API.escapeHtml(node.location_name) : "No location set"}
                  </p>
                  <p class="mt-0.5 truncate text-[10px] text-base-content/40">${API.escapeHtml(targetLabel)}</p>
                </div>
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
                  <p class="text-[9px] font-medium uppercase tracking-wide text-base-content/40">Pressure</p>
                  <p class="mt-0.5 text-sm font-bold tabular">${latest ? metric(latest.pressure, "", 0) : "—"}</p>
                </div>
              </div>

              <div class="mt-3 text-primary/55">${sparkline(temperatures)}</div>

              <div class="mt-3 flex items-center justify-between gap-2 border-t border-base-content/7 pt-3">
                <span class="badge badge-xs ${healthClass}">${health.label}</span>
                <span class="text-[10px] text-base-content/40">Seen ${API.timeAgo(node.last_seen)}</span>
              </div>
            </a>
            <button type="button" class="btn btn-ghost btn-circle btn-xs absolute right-3 top-3 z-10 ${favourite ? "text-secondary" : "text-base-content/35"}" data-favourite-node="${node.node_id}" aria-label="${favourite ? "Remove from favourites" : "Add to favourites"}" aria-pressed="${favourite}">
              ${favourite ? STAR_FILLED : STAR_OUTLINE}
            </button>
          </article>`;
      })
      .join("");

    container.querySelectorAll("[data-favourite-node]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        toggleFavourite(Number(button.getAttribute("data-favourite-node")), button);
      });
    });
  }

  async function toggleFavourite(nodeId, button) {
    if (!state.user) return;
    button.disabled = true;
    const isFavourite = state.favourites.has(nodeId);
    try {
      if (isFavourite) {
        await API.request(`/api/user/${state.user.user_id}/favourites/${nodeId}`, { method: "DELETE" });
        state.favourites.delete(nodeId);
      } else {
        await API.request(`/api/user/${state.user.user_id}/favourites`, { method: "POST", body: { node_id: nodeId } });
        state.favourites.add(nodeId);
      }
      render();
      API.toast(isFavourite ? "Removed from favourites." : "Pinned to favourites.", isFavourite ? "info" : "success");
    } catch (error) {
      API.toast(error.message || "Could not update favourites.", "error");
      button.disabled = false;
    }
  }

  async function load() {
    if (state.loading || !state.user) return;
    state.loading = true;
    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) API.setButtonLoading(refreshButton, true, "Refreshing…");
    try {
      const [allNodes, allReadings, favourites, diagnostics] = await Promise.all([
        API.request("/api/nodes"),
        API.request(`/api/readings?user_id=${state.user.user_id}&limit=5000`),
        API.request(`/api/user/${state.user.user_id}/favourites`),
        API.request(`/api/diagnostics?user_id=${state.user.user_id}&limit=500`),
      ]);
      state.nodes = allNodes
        .filter((node) => node.user_id === state.user.user_id)
        .sort((a, b) => a.node_name.localeCompare(b.node_name));
      const nodeIds = new Set(state.nodes.map((node) => node.node_id));
      state.grouped = groupReadings(allReadings.filter((reading) => nodeIds.has(reading.node_id)));
      state.favourites = new Set(favourites.map((favourite) => favourite.node_id));
      state.diagnostics = new Map();
      diagnostics
        .filter((diagnostic) => nodeIds.has(diagnostic.node_id))
        .sort((a, b) => API.parseDate(b.recorded_at) - API.parseDate(a.recorded_at))
        .forEach((diagnostic) => {
          if (!state.diagnostics.has(diagnostic.node_id)) state.diagnostics.set(diagnostic.node_id, diagnostic);
        });
      renderStats();
      render();
    } catch (error) {
      if (error.status !== 401) API.toast(error.message || "Could not load your enclosures.", "error");
    } finally {
      state.loading = false;
      if (refreshButton) API.setButtonLoading(refreshButton, false);
    }
  }

  function showFormError(message) {
    const box = document.getElementById("node-form-error");
    const text = document.getElementById("node-form-error-message");
    if (!box || !text) return;
    text.textContent = message;
    box.classList.remove("hidden");
  }

  function clearFormError() {
    const box = document.getElementById("node-form-error");
    if (box) box.classList.add("hidden");
  }

  function initModal() {
    const modal = document.getElementById("node-modal");
    const form = document.getElementById("node-form");
    if (!modal || !form) return;
    const fieldset = form.querySelector("[data-target-fieldset]");

    const open = () => {
      form.reset();
      clearFormError();
      if (fieldset) Targets.setTargets(fieldset, null);
      modal.showModal();
      window.setTimeout(() => document.getElementById("node-name")?.focus(), 80);
    };
    const close = () => modal.close();

    document.querySelectorAll("[data-open-node-modal]").forEach((button) => {
      button.addEventListener("click", open);
    });
    document.querySelectorAll("[data-close-node-modal]").forEach((button) => {
      button.addEventListener("click", close);
    });
    modal.addEventListener("close", clearFormError);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFormError();
      if (!form.reportValidity()) return;

      const latitudeValue = document.getElementById("node-latitude").value.trim();
      const longitudeValue = document.getElementById("node-longitude").value.trim();
      const latitude = latitudeValue === "" ? null : Number(latitudeValue);
      const longitude = longitudeValue === "" ? null : Number(longitudeValue);
      if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
        showFormError("Latitude and longitude must be valid numbers.");
        return;
      }

      const targets = fieldset ? Targets.getTargets(fieldset) : null;
      if (targets === false) {
        showFormError(Targets.lastError || "Check the environment target ranges and try again.");
        return;
      }

      const body = {
        node_name: document.getElementById("node-name").value.trim(),
        location_name: document.getElementById("node-location").value.trim() || null,
        latitude,
        longitude,
        targets,
      };
      const submit = document.getElementById("node-submit");
      API.setButtonLoading(submit, true, "Creating…");
      try {
        const created = await API.request("/api/node", { method: "POST", body });
        modal.close();
        API.toast("Enclosure created.", "success");
        window.location.assign(`/app/nodes/${created.node_id}`);
      } catch (error) {
        showFormError(error.message || "Could not create the enclosure.");
        API.setButtonLoading(submit, false);
      }
    });

    return open;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await App.init();
    if (!user) return;
    state.user = user;
    const targetFieldset = document.querySelector("#node-form [data-target-fieldset]");
    if (targetFieldset) Targets.init(targetFieldset);
    const openModal = initModal();
    await load();

    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1" && openModal) openModal();

    const search = document.getElementById("node-search");
    if (search) {
      search.addEventListener("input", () => {
        state.query = search.value;
        render();
      });
    }

    document.querySelectorAll("[data-node-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.getAttribute("data-node-filter");
        document.querySelectorAll("[data-node-filter]").forEach((other) => {
          const active = other === button;
          other.className = `btn btn-xs ${active ? "btn-primary" : "btn-ghost"}`;
        });
        render();
      });
    });

    const refreshButton = document.querySelector("[data-refresh]");
    if (refreshButton) refreshButton.addEventListener("click", load);

    window.setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
  });
})();
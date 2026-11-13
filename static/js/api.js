(function () {
  "use strict";

  const TOKEN_KEY = "viq_token";
  const USER_KEY = "viq_user";

  class ApiError extends Error {
    constructor(message, status, detail) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.detail = detail;
    }
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (_) {
      return null;
    }
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function setSession(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (_) {}
    if (window.VIQ && window.VIQ.setAuthVisibility) window.VIQ.setAuthVisibility();
  }

  function setUser(user) {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch (_) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (_) {}
    if (window.VIQ && window.VIQ.setAuthVisibility) window.VIQ.setAuthVisibility();
  }

  function formatError(payload, fallback) {
    if (!payload) return fallback || "Something went wrong. Please try again.";
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) {
      return payload.detail
        .map((item) => {
          const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(".") : "";
          return field ? `${field}: ${item.msg}` : item.msg;
        })
        .join(" · ");
    }
    if (typeof payload.message === "string") return payload.message;
    return fallback || "Something went wrong. Please try again.";
  }

  async function request(path, options) {
    const config = options || {};
    const method = config.method || "GET";
    const auth = config.auth !== false;
    const headers = Object.assign({ Accept: "application/json" }, config.headers || {});

    const token = getToken();
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    const fetchOptions = { method, headers };
    if (config.body !== undefined && config.body !== null) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(config.body);
    }

    let response;
    try {
      response = await fetch(path, fetchOptions);
    } catch (_) {
      throw new ApiError("Cannot reach the server. Check your connection and try again.", 0, null);
    }

    if (response.status === 401 && auth) {
      clearSession();
      const onAuthPage = /^\/(login|register)\/?$/.test(window.location.pathname);
      if (!onAuthPage) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${next}`);
      }
      throw new ApiError("Your session has expired. Please log in again.", 401, null);
    }

    const contentType = response.headers.get("content-type") || "";
    let payload = null;
    if (response.status !== 204 && contentType.includes("application/json")) {
      payload = await response.json().catch(() => null);
    }

    if (!response.ok) {
      throw new ApiError(formatError(payload, response.statusText), response.status, payload);
    }

    return payload;
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value !== "string") return new Date(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
    return new Date(hasZone ? value : `${value}Z`);
  }

  function formatNumber(value, digits) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString(undefined, {
      minimumFractionDigits: digits === undefined ? 1 : digits,
      maximumFractionDigits: digits === undefined ? 1 : digits,
    });
  }

  function formatInteger(value) {
    return formatNumber(value, 0);
  }

  function formatDateTime(value) {
    const date = parseDate(value);
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDate(value) {
    const date = parseDate(value);
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function formatTime(value) {
    const date = parseDate(value);
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function timeAgo(value) {
    const date = parseDate(value);
    if (!date || Number.isNaN(date.getTime())) return "never";
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 45) return "just now";
    if (seconds < 90) return "1 min ago";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
    return formatDate(value);
  }

  function statusMeta(status) {
    const value = (status || "inactive").toLowerCase();
    if (value === "active" || value === "online" || value === "live") {
      return { label: "Live", tone: "success", dot: "bg-success", badge: "badge-success" };
    }
    if (value === "offline" || value === "error") {
      return { label: "Offline", tone: "error", dot: "bg-error", badge: "badge-error" };
    }
    return { label: "Idle", tone: "warning", dot: "bg-warning", badge: "badge-warning" };
  }

  function initials(value) {
    const parts = String(value || "VQ").trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "VQ";
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setButtonLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="loading loading-spinner loading-sm"></span><span>${escapeHtml(label || "Working…")}</span>`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    }
  }

  function toast(message, type) {
    if (window.VIQ && window.VIQ.toast) window.VIQ.toast(message, type);
    else if (type === "error") console.error(message);
    else console.info(message);
  }

  window.API = {
    TOKEN_KEY,
    USER_KEY,
    ApiError,
    request,
    getToken,
    getStoredUser,
    setSession,
    setUser,
    clearSession,
    formatError,
    parseDate,
    formatNumber,
    formatInteger,
    formatDateTime,
    formatDate,
    formatTime,
    timeAgo,
    statusMeta,
    initials,
    escapeHtml,
    setButtonLoading,
    copyText,
    toast,
  };
})();
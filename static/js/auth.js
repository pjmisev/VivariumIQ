(function () {
  "use strict";

  function safeNextTarget(value) {
    if (!value || !value.startsWith("/")) return null;
    try {
      const target = new URL(value, window.location.origin);
      if (target.origin !== window.location.origin) return null;
      return target.pathname + target.search + target.hash;
    } catch (_) {
      return null;
    }
  }

  function safeNext() {
    return safeNextTarget(new URLSearchParams(window.location.search).get("next")) || "/app";
  }

  function showError(message) {
    const box = document.getElementById("auth-error");
    const text = document.getElementById("auth-error-message");
    if (!box || !text) return;
    text.textContent = message;
    box.classList.remove("hidden");
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearError() {
    const box = document.getElementById("auth-error");
    if (box) box.classList.add("hidden");
  }

  function initPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      const input = document.getElementById(button.getAttribute("data-password-toggle"));
      if (!input) return;
      button.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        const open = button.querySelector("[data-eye-open]");
        const closed = button.querySelector("[data-eye-closed]");
        if (open) open.classList.toggle("hidden", !showing);
        if (closed) closed.classList.toggle("hidden", showing);
      });
    });
  }

  function initStrengthMeter() {
    const input = document.getElementById("password");
    const label = document.getElementById("strength-label");
    const bars = Array.from(document.querySelectorAll("[data-strength-bar]"));
    if (!input || !label || bars.length === 0) return;

    const levels = [
      { label: "Use 8 or more characters.", color: "" },
      { label: "Weak password", color: "#e11d48" },
      { label: "Fair password", color: "#f59e0b" },
      { label: "Good password", color: "#527c9f" },
      { label: "Strong password", color: "#65a30d" },
    ];

    input.addEventListener("input", () => {
      const value = input.value;
      let score = 0;
      if (value.length >= 8) score += 1;
      if (value.length >= 12) score += 1;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
      if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
      if (!value) score = 0;
      const level = levels[Math.min(score, 4)];
      label.textContent = value ? level.label : levels[0].label;
      bars.forEach((bar, index) => {
        bar.style.backgroundColor = value && index < Math.max(score, 1) ? level.color : "";
      });
    });
  }

  function initSessionBanner() {
    const banner = document.getElementById("session-banner");
    if (!banner) return;
    if (API.getToken()) banner.classList.remove("hidden");
  }

  function preserveNextLink() {
    const next = safeNextTarget(new URLSearchParams(window.location.search).get("next"));
    if (!next) return;
    document.querySelectorAll('a[href="/login"], a[href="/register"]').forEach((link) => {
      const url = new URL(link.getAttribute("href"), window.location.origin);
      url.searchParams.set("next", next);
      link.setAttribute("href", url.pathname + url.search);
    });
  }

  async function finishLogin(token) {
    API.setSession(token);
    const user = await API.request("/api/auth/me");
    API.setSession(token, user);
    window.location.replace(safeNext());
  }

  function initLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;
    const button = document.getElementById("login-submit");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearError();
      if (!form.reportValidity()) return;
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      API.setButtonLoading(button, true, "Signing in…");
      try {
        const result = await API.request("/api/auth/login", {
          method: "POST",
          auth: false,
          body: { email, password },
        });
        await finishLogin(result.access_token);
      } catch (error) {
        API.setButtonLoading(button, false);
        showError(error.message || "Could not sign you in.");
      }
    });
  }

  function initRegisterForm() {
    const form = document.getElementById("register-form");
    if (!form) return;
    const button = document.getElementById("register-submit");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearError();
      if (!form.reportValidity()) return;

      const username = document.getElementById("username").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const confirm = document.getElementById("confirm-password").value;

      if (password !== confirm) {
        showError("Your passwords do not match.");
        document.getElementById("confirm-password").focus();
        return;
      }

      API.setButtonLoading(button, true, "Creating account…");
      try {
        await API.request("/api/user", {
          method: "POST",
          auth: false,
          body: { username, email, password },
        });
        const result = await API.request("/api/auth/login", {
          method: "POST",
          auth: false,
          body: { email, password },
        });
        await finishLogin(result.access_token);
      } catch (error) {
        API.setButtonLoading(button, false);
        showError(error.message || "Could not create your account.");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initPasswordToggles();
    initStrengthMeter();
    initSessionBanner();
    preserveNextLink();
    initLoginForm();
    initRegisterForm();
  });
})();
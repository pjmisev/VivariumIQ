(function () {
  "use strict";

  const ROOT = document.documentElement;
  const TOKEN_KEY = "viq_token";
  const THEME_KEY = "viq_theme";

  function savedTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "vivarium-dark" ? "vivarium-dark" : "vivarium";
    } catch (_) {
      return "vivarium";
    }
  }

  function applyTheme(theme) {
    ROOT.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", theme === "vivarium-dark" ? "Switch to light theme" : "Switch to dark theme");
    });
    document.querySelectorAll("[data-theme-icon]").forEach((element) => {
      const name = element.getAttribute("data-theme-icon");
      const visible = theme === "vivarium-dark" ? name === "sun" : name === "moon";
      element.classList.toggle("hidden", !visible);
    });
  }

  function toggleTheme() {
    applyTheme(ROOT.getAttribute("data-theme") === "vivarium-dark" ? "vivarium" : "vivarium-dark");
  }

  function hasToken() {
    try {
      return Boolean(localStorage.getItem(TOKEN_KEY));
    } catch (_) {
      return false;
    }
  }

  function setAuthVisibility() {
    const signedIn = hasToken();
    document.querySelectorAll("[data-guest-only]").forEach((element) => {
      element.classList.toggle("viq-auth-hidden", signedIn);
    });
    document.querySelectorAll("[data-auth-only]").forEach((element) => {
      element.classList.toggle("viq-auth-hidden", !signedIn);
    });
  }

  function closeMobileMenu() {
    const menu = document.getElementById("mobile-menu");
    const toggle = document.querySelector("[data-mobile-toggle]");
    if (!menu || !toggle) return;
    menu.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
  }

  function initMobileMenu() {
    const menu = document.getElementById("mobile-menu");
    const toggle = document.querySelector("[data-mobile-toggle]");
    if (!menu || !toggle) return;
    toggle.addEventListener("click", () => {
      const willOpen = menu.classList.contains("hidden");
      menu.classList.toggle("hidden", !willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
    });
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMobileMenu));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMobileMenu();
    });
  }

  function toast(message, type) {
    const root = document.getElementById("toast-root");
    if (!root || !message) return;
    const alert = document.createElement("div");
    const palette = {
      success: "alert-success",
      error: "alert-error",
      warning: "alert-warning",
      info: "alert-info",
    };
    alert.className = `alert ${palette[type] || "alert-info"} shadow-lg text-sm fade-in`;
    alert.setAttribute("role", type === "error" ? "alert" : "status");
    const text = document.createElement("span");
    text.className = "flex-1";
    text.textContent = message;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn-ghost btn-xs btn-circle";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "✕";
    close.addEventListener("click", () => alert.remove());
    alert.append(text, close);
    root.appendChild(alert);
    window.setTimeout(() => {
      alert.classList.add("opacity-0", "transition-opacity", "duration-300");
      window.setTimeout(() => alert.remove(), 320);
    }, 4200);
  }

  window.VIQ = window.VIQ || {};
  window.VIQ.toast = toast;
  window.VIQ.setAuthVisibility = setAuthVisibility;
  window.VIQ.applyTheme = applyTheme;
  window.VIQ.hasToken = hasToken;
  window.VIQ.tokenKey = TOKEN_KEY;

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(savedTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", toggleTheme);
    });
    setAuthVisibility();
    initMobileMenu();
    document.querySelectorAll("[data-current-year]").forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });
  });
})();
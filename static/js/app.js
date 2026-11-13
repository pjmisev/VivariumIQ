(function () {
  "use strict";

  const state = {
    promise: null,
    user: null,
  };

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  function paintUser(user) {
    if (!user) return;
    document.querySelectorAll("[data-user-name]").forEach((element) => {
      element.textContent = user.username;
    });
    document.querySelectorAll("[data-user-email]").forEach((element) => {
      element.textContent = user.email;
    });
    document.querySelectorAll("[data-user-initials]").forEach((element) => {
      element.textContent = API.initials(user.username);
    });
    document.querySelectorAll("[data-greeting]").forEach((element) => {
      element.textContent = `${greeting()}, ${user.username}`;
    });
  }

  function setAlertCount(count) {
    document.querySelectorAll("[data-alert-count]").forEach((element) => {
      element.textContent = String(count);
      element.classList.toggle("hidden", count <= 0);
    });
  }

  async function init() {
    if (state.promise) return state.promise;
    state.promise = (async () => {
      if (!API.getToken() && !API.isDemo()) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?next=${next}`);
        return null;
      }
      try {
        const user = await API.request("/api/auth/me");
        state.user = user;
        API.setUser(user);
        paintUser(user);
        document.documentElement.dataset.sessionReady = "true";
        return user;
      } catch (error) {
        if (error.status === 401) return null;
        const cached = API.getStoredUser();
        if (cached) {
          state.user = cached;
          paintUser(cached);
          API.toast("Could not reach the server. Showing the last known account.", "warning");
          return cached;
        }
        API.toast(error.message || "Could not start your session.", "error");
        return null;
      }
    })();
    return state.promise;
  }

  function initSidebar() {
    const sidebar = document.getElementById("app-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const toggle = document.querySelector("[data-sidebar-toggle]");
    const closeButtons = document.querySelectorAll("[data-sidebar-close]");
    if (!sidebar || !overlay) return;

    const open = () => {
      sidebar.classList.remove("-translate-x-full");
      overlay.classList.remove("hidden");
      if (toggle) toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("overflow-hidden", "lg:overflow-auto");
    };
    const close = () => {
      sidebar.classList.add("-translate-x-full");
      overlay.classList.add("hidden");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("overflow-hidden", "lg:overflow-auto");
    };

    if (toggle) toggle.addEventListener("click", open);
    overlay.addEventListener("click", close);
    closeButtons.forEach((button) => button.addEventListener("click", close));
    sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024) close();
    });
  }

  function clearDemoState() {
    try {
      sessionStorage.removeItem("viq_demo_state");
    } catch (_) {}
  }

  function initLogout() {
    document.querySelectorAll("[data-logout]").forEach((button) => {
      button.addEventListener("click", () => {
        if (API.isDemo()) {
          clearDemoState();
          window.location.replace("/demo/exit");
          return;
        }
        API.clearSession();
        window.location.replace("/");
      });
    });
  }

  function initDemoExit() {
    document.querySelectorAll("[data-demo-exit]").forEach((button) => {
      button.addEventListener("click", () => {
        clearDemoState();
        window.location.assign("/demo/exit");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSidebar();
    initLogout();
    initDemoExit();
    if (document.body.dataset.auth === "required") {
      init();
    }
  });

  window.App = {
    init,
    state,
    greeting,
    paintUser,
    setAlertCount,
    get user() {
      return state.user;
    },
  };
})();
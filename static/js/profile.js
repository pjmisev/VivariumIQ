(function () {
  "use strict";

  const state = {
    user: null,
  };

  function tokenExpiry(token) {
    if (!token) return null;
    try {
      const payload = token.split(".")[1];
      const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const decoded = JSON.parse(atob(padded));
      return decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;
    } catch (_) {
      return null;
    }
  }

  function paint() {
    const user = state.user;
    if (!user) return;
    document.querySelectorAll("[data-profile-username]").forEach((element) => {
      element.textContent = user.username;
    });
    document.querySelectorAll("[data-profile-email]").forEach((element) => {
      element.textContent = user.email;
    });
    document.querySelectorAll("[data-profile-initials]").forEach((element) => {
      element.textContent = API.initials(user.username);
    });
    document.querySelectorAll("[data-profile-role]").forEach((element) => {
      element.textContent = user.role || "user";
    });
    document.querySelectorAll("[data-profile-created]").forEach((element) => {
      element.textContent = API.formatDate(user.created_at);
    });
    document.querySelectorAll("[data-profile-id]").forEach((element) => {
      element.textContent = `#${user.user_id}`;
    });

    const username = document.getElementById("profile-username");
    const email = document.getElementById("profile-email");
    if (username) username.value = user.username;
    if (email) email.value = user.email;
  }

  function initTokenPanel() {
    const input = document.getElementById("api-token");
    const token = API.getToken();
    if (input) input.value = token || "";
    const expiry = tokenExpiry(token);
    document.querySelectorAll("[data-token-expiry]").forEach((element) => {
      element.textContent = expiry ? API.formatDateTime(expiry) : "—";
    });

    const reveal = document.querySelector("[data-token-reveal]");
    if (reveal && input) {
      reveal.addEventListener("click", () => {
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        reveal.setAttribute("aria-label", showing ? "Show token" : "Hide token");
      });
    }

    const copy = document.querySelector("[data-token-copy]");
    if (copy && token) {
      copy.addEventListener("click", async () => {
        const ok = await API.copyText(token);
        API.toast(ok ? "Token copied to the clipboard." : "Could not copy the token.", ok ? "success" : "error");
      });
    }
  }

  function showError(message) {
    const box = document.getElementById("profile-form-error");
    const text = document.getElementById("profile-form-error-message");
    if (box && text) {
      text.textContent = message;
      box.classList.remove("hidden");
    }
  }

  function initProfileForm() {
    const form = document.getElementById("profile-form");
    if (!form) return;
    const submit = document.getElementById("profile-submit");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      document.getElementById("profile-form-error")?.classList.add("hidden");
      if (!form.reportValidity() || !state.user) return;
      const body = {
        username: document.getElementById("profile-username").value.trim(),
        email: document.getElementById("profile-email").value.trim(),
      };
      API.setButtonLoading(submit, true, "Saving…");
      try {
        state.user = await API.request(`/api/user/${state.user.user_id}`, { method: "PATCH", body });
        API.setUser(state.user);
        App.paintUser(state.user);
        paint();
        API.toast("Profile updated.", "success");
      } catch (error) {
        showError(error.message || "Could not update your profile.");
      } finally {
        API.setButtonLoading(submit, false);
      }
    });
  }

  function initDeleteAccount() {
    const modal = document.getElementById("delete-account-modal");
    const submit = document.getElementById("delete-account-submit");
    if (!modal || !submit) return;
    document.querySelectorAll("[data-open-delete-account]").forEach((button) => {
      button.addEventListener("click", () => modal.showModal());
    });
    document.querySelectorAll("[data-close-delete-account]").forEach((button) => {
      button.addEventListener("click", () => modal.close());
    });
    submit.addEventListener("click", async () => {
      if (!state.user) return;
      API.setButtonLoading(submit, true, "Deleting…");
      try {
        await API.request(`/api/user/${state.user.user_id}`, { method: "DELETE" });
        API.clearSession();
        window.location.replace("/");
      } catch (error) {
        const box = document.getElementById("delete-account-error");
        document.getElementById("delete-account-error-message").textContent = error.message || "Could not delete your account.";
        box.classList.remove("hidden");
        API.setButtonLoading(submit, false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const user = await App.init();
    if (!user) return;
    state.user = user;
    paint();
    initTokenPanel();
    initProfileForm();
    initDeleteAccount();
  });
})();
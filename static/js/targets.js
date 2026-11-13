(function () {
  "use strict";

  const FIELDS = [
    "temperature_min",
    "temperature_max",
    "humidity_min",
    "humidity_max",
    "pressure_min",
    "pressure_max",
  ];

  const DATASET_KEYS = {
    temperature_min: "temperatureMin",
    temperature_max: "temperatureMax",
    humidity_min: "humidityMin",
    humidity_max: "humidityMax",
    pressure_min: "pressureMin",
    pressure_max: "pressureMax",
  };

  const RANGE_PAIRS = [
    { min: "temperature_min", max: "temperature_max", label: "temperature" },
    { min: "humidity_min", max: "humidity_max", label: "humidity" },
    { min: "pressure_min", max: "pressure_max", label: "pressure" },
  ];

  let lastError = "";

  function parts(fieldset) {
    return {
      select: fieldset.querySelector("[data-target-preset]"),
      inputs: Array.from(fieldset.querySelectorAll("[data-target-input]")),
      fields: Array.from(fieldset.querySelectorAll("[data-target-field]")),
      hint: fieldset.querySelector("[data-target-hint]"),
    };
  }

  function setHint(hint, message, tone) {
    if (!hint) return;
    hint.textContent = message;
    hint.classList.toggle("text-error", tone === "error");
    hint.classList.toggle("text-base-content/50", tone !== "error");
  }

  function setFieldState(fields, faded) {
    fields.forEach((field) => {
      field.classList.toggle("opacity-50", faded);
      field.classList.toggle("pointer-events-none", faded);
    });
  }

  function setInputsReadonly(inputs, readonly) {
    inputs.forEach((input) => {
      input.readOnly = readonly;
      input.classList.toggle("bg-base-200/60", readonly);
    });
  }

  function fillFromOption(inputs, option) {
    inputs.forEach((input) => {
      const key = input.getAttribute("data-target-input");
      const datasetKey = DATASET_KEYS[key];
      const raw = option && datasetKey ? option.dataset[datasetKey] : "";
      input.value = raw === undefined || raw === null ? "" : raw;
    });
  }

  function fillFromTargets(inputs, targets) {
    inputs.forEach((input) => {
      const key = input.getAttribute("data-target-input");
      const raw = targets ? targets[key] : "";
      input.value = raw === undefined || raw === null ? "" : raw;
    });
  }

  function hasRangeValues(targets) {
    if (!targets) return false;
    return FIELDS.some((field) => targets[field] !== null && targets[field] !== undefined && targets[field] !== "");
  }

  function applyMode(fieldset, targets) {
    const { select, inputs, fields, hint } = parts(fieldset);
    if (!select) return;
    const value = select.value;

    if (value === "") {
      inputs.forEach((input) => {
        input.disabled = true;
        input.value = "";
      });
      setInputsReadonly(inputs, false);
      setFieldState(fields, true);
      setHint(hint, "No targets set. Health will show as unconfigured.", "muted");
      return;
    }

    inputs.forEach((input) => {
      input.disabled = false;
    });

    if (value === "custom") {
      setInputsReadonly(inputs, false);
      setFieldState(fields, false);
      if (targets) fillFromTargets(inputs, targets);
      setHint(hint, "Custom ranges: set a minimum and maximum for each metric.", "muted");
      return;
    }

    const option = Array.from(select.options).find((item) => item.value === value);
    setInputsReadonly(inputs, true);
    setFieldState(fields, false);
    fillFromOption(inputs, option);
    const name = option ? option.textContent.trim() : "preset";
    setHint(hint, `Preset ranges applied: ${name}.`, "muted");
  }

  function init(fieldset) {
    if (!fieldset) return;
    const { select } = parts(fieldset);
    if (!select) return;
    select.addEventListener("change", () => applyMode(fieldset, null));
    applyMode(fieldset, null);
  }

  function setTargets(fieldset, targets) {
    if (!fieldset) return;
    const { select } = parts(fieldset);
    if (!select) return;

    if (!hasRangeValues(targets)) {
      select.value = "";
      applyMode(fieldset, null);
      return;
    }

    if (targets.preset_key) {
      const option = Array.from(select.options).find((item) => item.value === targets.preset_key);
      if (option) {
        select.value = targets.preset_key;
        applyMode(fieldset, null);
        return;
      }
    }

    select.value = "custom";
    applyMode(fieldset, targets);
  }

  function error(message) {
    lastError = message || "Check the target ranges and try again.";
    if (window.API && API.toast) API.toast(lastError, "error");
    return lastError;
  }

  function getTargets(fieldset) {
    lastError = "";
    if (!fieldset) return null;
    const { select, inputs } = parts(fieldset);
    if (!select) return null;

    const value = select.value;
    if (value === "") return null;

    const targets = { preset_key: value === "custom" ? null : value, preset_name: null };
    if (value !== "custom") {
      const option = Array.from(select.options).find((item) => item.value === value);
      targets.preset_name = option ? option.textContent.trim() : null;
    }
    const numbers = {};

    for (const input of inputs) {
      const key = input.getAttribute("data-target-input");
      if (!FIELDS.includes(key)) continue;
      const raw = input.value.trim();
      const readable = key.replace("_", " ");
      if (raw === "") {
        return error(`Enter a value for ${readable}.`) && false;
      }
      const number = Number(raw);
      if (!Number.isFinite(number)) {
        return error(`${readable} must be a number.`) && false;
      }
      numbers[key] = number;
    }

    if (FIELDS.some((field) => numbers[field] === undefined)) {
      return error("Set a minimum and maximum for temperature, humidity and pressure.") && false;
    }

    for (const pair of RANGE_PAIRS) {
      if (numbers[pair.min] > numbers[pair.max]) {
        return error(`The ${pair.label} minimum must be less than or equal to the maximum.`) && false;
      }
    }

    FIELDS.forEach((field) => {
      targets[field] = numbers[field];
    });
    return targets;
  }

  window.Targets = {
    init,
    setTargets,
    getTargets,
    error,
    get lastError() {
      return lastError;
    },
  };
})();
